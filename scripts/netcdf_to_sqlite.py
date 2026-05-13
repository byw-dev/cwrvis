#!/usr/bin/env python3
"""
netcdf × shape → SQLite 区域统计数据库。

输入：
  {nc_dir}/yearly/ResultGrid_Y_YYYY-MM-DD-00_YYYY-MM-DD-00.nc
  {nc_dir}/monthly/ResultGrid_M_YYYY-MM-DD-00_YYYY-MM-DD-00.nc
  {shape_dir}/*.geojson  （文件名为区域中文名，如"西藏自治区.geojson"）

输出：
  {db_path}：SQLite 宽表
    region_stats(region_id, granularity, year, month, SP, aveMv, ..., RCh)
  仅存 granularity IN ('year','month') 的原始统计值；
  mean_all / mean_month / mean_season 由后端查询时用 SQL 实时计算。

空间聚合方法（--method）：
  area_weighted    （默认）面积加权均值：格点单元与区域多边形的重叠面积为权重
  point_in_boundary         中心点在边界内的格点：kg var → SUM，其余 → 算术平均

用法：
  uv run python scripts/netcdf_to_sqlite.py
  uv run python scripts/netcdf_to_sqlite.py \\
      --nc-dir data/nc --shape-dir data/shapes \\
      --db-path db/stats.db --method area_weighted

依赖：numpy xarray netCDF4 shapely
"""

import argparse
import json
import re
import sqlite3
import sys
from abc import ABC, abstractmethod
from pathlib import Path

import numpy as np
import xarray as xr
from shapely.geometry import Point, box
from shapely.geometry import shape as shapely_shape
from shapely.ops import unary_union

# --------------------------------------------------------------------------- #
# constants                                                                     #
# --------------------------------------------------------------------------- #

REGION_MAP: dict[str, str] = {
    "xizang":  "西藏自治区",
    "lasa":    "拉萨市",
    "rikaze":  "日喀则市",
    "shannan": "山南市",
    "linzhi":  "林芝市",
    "changdu": "昌都市",
    "naqu":    "那曲市",
    "ali":     "阿里地区",
}

EXCLUDE_VARS = {"dxy"}

# PointInBoundary：这些 var 的单位是 kg，区域统计取 SUM；其余取算术平均
KG_VARS = frozenset({
    "SP", "aveMv", "aveMh", "INv", "OTv",
    "INh", "OTh", "MC", "GMh", "GMv", "CWR",
})

_YEARLY_RE  = re.compile(r"ResultGrid_Y_(\d{4})-\d{2}-\d{2}-\d{2}_")
_MONTHLY_RE = re.compile(r"ResultGrid_M_(\d{4})-(\d{2})-\d{2}-\d{2}_")


# --------------------------------------------------------------------------- #
# Strategy Pattern: RegionAggregator                                            #
# --------------------------------------------------------------------------- #

class RegionAggregator(ABC):
    """
    空间聚合策略接口。
    prepare() 每个区域调用一次（缓存权重/掩码，后续逐帧复用）。
    aggregate() 每帧每 var 调用一次，返回 float；区域内无有效格点时返回 None。
    """

    @abstractmethod
    def prepare(
        self,
        region_geom,
        grid_lats: list[float],
        grid_lons: list[float],
    ) -> None: ...

    @abstractmethod
    def aggregate(self, frame_2d: np.ndarray, var_name: str) -> float | None: ...


class AreaWeightedMean(RegionAggregator):
    """
    以格点单元与区域多边形的面积重叠比例为权重，对所有 var 做加权平均。
    格点单元：以 (lon±0.5°, lat±0.5°) 为边界的矩形。
    """

    def prepare(self, region_geom, grid_lats, grid_lons) -> None:
        n_lat, n_lon = len(grid_lats), len(grid_lons)
        w = np.zeros((n_lat, n_lon), dtype=float)
        for i, lat in enumerate(grid_lats):
            for j, lon in enumerate(grid_lons):
                cell = box(lon - 0.5, lat - 0.5, lon + 0.5, lat + 0.5)
                w[i, j] = region_geom.intersection(cell).area
        self._w = w

    def aggregate(self, frame_2d: np.ndarray, var_name: str) -> float | None:
        valid = ~np.isnan(frame_2d)
        w = self._w * valid
        total_w = float(w.sum())
        if total_w == 0.0:
            return None
        return float(np.nansum(frame_2d * w) / total_w)


class PointInBoundary(RegionAggregator):
    """
    仅取格点中心落在区域边界内的格点。
    kg 单位 var → SUM（代表区域总量）；其余（%、day、hour）→ 算术平均。
    """

    def prepare(self, region_geom, grid_lats, grid_lons) -> None:
        n_lat, n_lon = len(grid_lats), len(grid_lons)
        mask = np.zeros((n_lat, n_lon), dtype=bool)
        for i, lat in enumerate(grid_lats):
            for j, lon in enumerate(grid_lons):
                mask[i, j] = region_geom.contains(Point(lon, lat))
        self._mask = mask

    def aggregate(self, frame_2d: np.ndarray, var_name: str) -> float | None:
        m = self._mask & ~np.isnan(frame_2d)
        vals = frame_2d[m]
        if vals.size == 0:
            return None
        return float(np.sum(vals) if var_name in KG_VARS else np.mean(vals))


AGGREGATORS: dict[str, type[RegionAggregator]] = {
    "area_weighted":     AreaWeightedMean,
    "point_in_boundary": PointInBoundary,
}


# --------------------------------------------------------------------------- #
# file scanning                                                                 #
# --------------------------------------------------------------------------- #

def _scan_files(
    nc_dir: Path,
) -> tuple[dict[int, Path], dict[tuple[int, int], Path]]:
    yearly: dict[int, Path] = {}
    monthly: dict[tuple[int, int], Path] = {}

    yearly_dir  = nc_dir / "yearly"
    monthly_dir = nc_dir / "monthly"

    if yearly_dir.is_dir():
        for f in yearly_dir.glob("ResultGrid_Y_*.nc"):
            m = _YEARLY_RE.search(f.name)
            if m:
                yearly[int(m.group(1))] = f

    if monthly_dir.is_dir():
        for f in monthly_dir.glob("ResultGrid_M_*.nc"):
            m = _MONTHLY_RE.search(f.name)
            if m:
                monthly[(int(m.group(1)), int(m.group(2)))] = f

    return yearly, monthly


def _read_grid_meta(
    sample_path: Path,
) -> tuple[list[float], list[float], list[str]]:
    with xr.open_dataset(sample_path) as ds:
        lats = [float(v) for v in ds.coords["latitude"].values]
        lons = [float(v) for v in ds.coords["longitude"].values]
        var_names = [v for v in ds.data_vars if v not in EXCLUDE_VARS]
    return lats, lons, var_names


# --------------------------------------------------------------------------- #
# frame loading                                                                 #
# --------------------------------------------------------------------------- #

def _load_frames(
    files: dict,
    var_names: list[str],
) -> dict:
    """
    返回 {key: {var: np.ndarray shape (lat, lon)}}，key 为 year 或 (year, month)。
    """
    data: dict = {}
    sorted_items = sorted(files.items())
    total = len(sorted_items)
    for idx, (key, path) in enumerate(sorted_items, 1):
        print(f"  [{idx:>3}/{total}] {path.name}", flush=True)
        with xr.open_dataset(path) as ds:
            data[key] = {var: ds[var].values.astype(float) for var in var_names}
    return data


# --------------------------------------------------------------------------- #
# region loading                                                                #
# --------------------------------------------------------------------------- #

def _extract_geometry(gj: dict):
    """从 GeoJSON 对象（FeatureCollection / Feature / 裸 Geometry）提取 shapely 几何体。"""
    t = gj.get("type", "")
    if t in ("Polygon", "MultiPolygon"):
        return shapely_shape(gj)
    if t == "Feature":
        geom = gj.get("geometry")
        return shapely_shape(geom) if geom else None
    if t == "FeatureCollection":
        features = gj.get("features", [])
        geoms = [
            shapely_shape(f["geometry"])
            for f in features
            if f.get("geometry")
        ]
        if not geoms:
            return None
        return geoms[0] if len(geoms) == 1 else unary_union(geoms)
    return None


def _load_regions(shape_dir: Path) -> list[tuple[str, object]]:
    regions = []
    for region_id, chinese_name in REGION_MAP.items():
        path = shape_dir / f"{chinese_name}.geojson"
        if not path.exists():
            print(f"  WARNING: {path} not found — skipping {region_id}")
            continue
        gj = json.loads(path.read_text(encoding="utf-8"))
        geom = _extract_geometry(gj)
        if geom is None:
            print(f"  WARNING: cannot extract geometry from {path} — skipping")
            continue
        regions.append((region_id, geom))
    return regions


# --------------------------------------------------------------------------- #
# SQLite                                                                        #
# --------------------------------------------------------------------------- #

def _init_db(db_path: Path, var_names: list[str]) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    var_col_defs = "".join(f"    {v}  REAL,\n" for v in var_names)
    schema = f"""\
CREATE TABLE region_stats (
    region_id   TEXT    NOT NULL,
    granularity TEXT    NOT NULL CHECK (granularity IN ('year','month')),
    year        INTEGER NOT NULL,
    month       INTEGER,
{var_col_defs}\
    PRIMARY KEY (region_id, granularity, year, month)
);
CREATE INDEX idx_region_gran
    ON region_stats (region_id, granularity, year, month);
"""
    conn = sqlite3.connect(db_path)
    conn.executescript(schema)
    conn.commit()
    return conn


def _insert_rows(
    conn: sqlite3.Connection,
    rows: list[dict],
    fixed_cols: list[str],
    var_names: list[str],
) -> None:
    all_cols = fixed_cols + var_names
    placeholders = ", ".join("?" * len(all_cols))
    sql = (
        f"INSERT OR REPLACE INTO region_stats "
        f"({', '.join(all_cols)}) VALUES ({placeholders})"
    )
    conn.executemany(sql, [[r[c] for c in all_cols] for r in rows])
    conn.commit()


# --------------------------------------------------------------------------- #
# main                                                                          #
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description="netcdf × shape → SQLite 区域统计")
    parser.add_argument("--nc-dir",    default="data/nc",     type=Path, metavar="DIR")
    parser.add_argument("--shape-dir", default="data/shapes", type=Path, metavar="DIR")
    parser.add_argument("--db-path",   default="db/stats.db", type=Path, metavar="FILE")
    parser.add_argument(
        "--method",
        default="area_weighted",
        choices=list(AGGREGATORS),
        metavar="|".join(AGGREGATORS),
        help="空间聚合算法（默认: area_weighted）",
    )
    args = parser.parse_args()

    # ---- scan nc files ----
    yearly, monthly = _scan_files(args.nc_dir)
    if not yearly and not monthly:
        sys.exit(f"ERROR: {args.nc_dir} 下未找到 nc 文件")

    sample = next(iter(yearly.values())) if yearly else next(iter(monthly.values()))
    lats, lons, var_names = _read_grid_meta(sample)
    print(
        f"grid: {len(lats)}×{len(lons)}  "
        f"vars({len(var_names)}): {var_names}\n"
        f"yearly: {len(yearly)} files  monthly: {len(monthly)} files"
    )

    # ---- load regions ----
    print(f"\nloading regions from {args.shape_dir}...")
    regions = _load_regions(args.shape_dir)
    if not regions:
        sys.exit("ERROR: 未能加载任何区域 GeoJSON")
    print(f"  loaded: {[rid for rid, _ in regions]}")

    # ---- load all nc frames into memory ----
    print(f"\nloading yearly frames ({len(yearly)} files)...")
    yearly_data = _load_frames(yearly, var_names)

    print(f"\nloading monthly frames ({len(monthly)} files)...")
    monthly_data = _load_frames(monthly, var_names)

    # ---- init db ----
    print(f"\ninitialising {args.db_path}  (method={args.method})...")
    conn = _init_db(args.db_path, var_names)

    # ---- aggregate per region ----
    agg = AGGREGATORS[args.method]()
    fixed_cols = ["region_id", "granularity", "year", "month"]
    total_rows = 0

    print("\naggregating...")
    for region_id, region_geom in regions:
        print(f"  {region_id} — prepare...", end=" ", flush=True)
        agg.prepare(region_geom, lats, lons)
        print("aggregate...", end=" ", flush=True)

        rows: list[dict] = []

        for year in sorted(yearly_data):
            row: dict = {
                "region_id": region_id,
                "granularity": "year",
                "year": year,
                "month": None,
            }
            for var in var_names:
                row[var] = agg.aggregate(yearly_data[year][var], var)
            rows.append(row)

        for (year, month) in sorted(monthly_data):
            row = {
                "region_id": region_id,
                "granularity": "month",
                "year": year,
                "month": month,
            }
            for var in var_names:
                row[var] = agg.aggregate(monthly_data[(year, month)][var], var)
            rows.append(row)

        _insert_rows(conn, rows, fixed_cols, var_names)
        total_rows += len(rows)
        print(f"inserted {len(rows)} rows")

    conn.close()
    print(
        f"\ndone.  db={args.db_path}  "
        f"total rows={total_rows}  "
        f"method={args.method}"
    )


if __name__ == "__main__":
    main()
