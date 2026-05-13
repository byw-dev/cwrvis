#!/usr/bin/env python3
"""
预生成格点 JSON 切片。

输入目录结构：
  {nc_dir}/yearly/ResultGrid_Y_YYYY-MM-DD-00_YYYY-MM-DD-00.nc
  {nc_dir}/monthly/ResultGrid_M_YYYY-MM-DD-00_YYYY-MM-DD-00.nc

输出：
  {out_dir}/meta.json            — 网格坐标（含 dxy）、时间轴、var 元数据
  {out_dir}/year/{var}.json      — 年颗粒度数据，shape (n_year, lat, lon)，NaN→null
  {out_dir}/month/{var}.json     — 月颗粒度数据，shape (n_month, lat, lon)，NaN→null
  {out_dir}/mean_all/{var}.json  — 年数据整体时间均值，shape (1, lat, lon)
  {out_dir}/mean_month/{var}.json — 月气候态（按月分组均值），shape (12, lat, lon)
  {out_dir}/mean_season/{var}.json — 季节气候态，shape (4, lat, lon)，顺序：春夏秋冬

用法：
  uv run python scripts/netcdf_to_json.py
  uv run python scripts/netcdf_to_json.py --nc-dir data/nc --out-dir output/static/grid
"""

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import xarray as xr

EXCLUDE_VARS = {"dxy"}

_YEARLY_RE = re.compile(r"ResultGrid_Y_(\d{4})-\d{2}-\d{2}-\d{2}_")
_MONTHLY_RE = re.compile(r"ResultGrid_M_(\d{4})-(\d{2})-\d{2}-\d{2}_")

# 春=3/4/5, 夏=6/7/8, 秋=9/10/11, 冬=12/1/2
SEASON_MONTHS: dict[str, set[int]] = {
    "spring": {3, 4, 5},
    "summer": {6, 7, 8},
    "autumn": {9, 10, 11},
    "winter": {12, 1, 2},
}
SEASON_ORDER = ["spring", "summer", "autumn", "winter"]


def _scan_files(nc_dir: Path) -> tuple[dict, dict]:
    yearly: dict[int, Path] = {}
    monthly: dict[tuple[int, int], Path] = {}

    for f in (nc_dir / "yearly").glob("ResultGrid_Y_*.nc"):
        m = _YEARLY_RE.search(f.name)
        if m:
            yearly[int(m.group(1))] = f

    for f in (nc_dir / "monthly").glob("ResultGrid_M_*.nc"):
        m = _MONTHLY_RE.search(f.name)
        if m:
            monthly[(int(m.group(1)), int(m.group(2)))] = f

    return yearly, monthly


def _build_meta(ds: xr.Dataset, year_keys, month_keys) -> tuple[dict, list[str]]:
    lat = ds.coords["latitude"].values.tolist()
    lon = ds.coords["longitude"].values.tolist()

    var_names = [v for v in ds.data_vars if v not in EXCLUDE_VARS]
    vars_meta = {}
    for var in var_names:
        attrs = ds[var].attrs
        vars_meta[var] = {
            "name": attrs.get("name", var),
            "long_name": attrs.get("long_name", ""),
            "units": attrs.get("units", ""),
        }

    grid: dict = {"lat": lat, "lon": lon}
    if "dxy" in ds.data_vars:
        grid["dxy"] = [[float(v) for v in row] for row in ds["dxy"].values]

    meta = {
        "grid": grid,
        "timeline": {
            "year": sorted(year_keys),
            "month": [{"year": y, "month": mo} for y, mo in sorted(month_keys)],
            "mean_all": ["mean"],
            "mean_month": list(range(1, 13)),
            "mean_season": SEASON_ORDER,
        },
        "vars": vars_meta,
    }
    return meta, var_names


def _collect_frames(files_sorted: list, var_names: list[str]) -> dict[str, np.ndarray]:
    """读取 NC 文件，返回 dict: var -> np.ndarray shape (T, lat, lon)，NaN 保留。"""
    arrs: dict[str, list] = {var: [] for var in var_names}
    total = len(files_sorted)
    for i, (_, path) in enumerate(files_sorted, 1):
        print(f"  [{i}/{total}] {path.name}", flush=True)
        with xr.open_dataset(path) as ds:
            for var in var_names:
                arrs[var].append(ds[var].values)
    return {var: np.stack(a) for var, a in arrs.items()}


def _to_json_frames(arr: np.ndarray) -> list:
    """将 (T, lat, lon) numpy 数组转为 JSON 可序列化的嵌套列表，NaN→null。"""
    out = []
    for frame in arr:
        out.append([[None if np.isnan(v) else float(v) for v in row] for row in frame])
    return out


def _compute_means(
    yearly_arrs: dict[str, np.ndarray],
    monthly_arrs: dict[str, np.ndarray],
    sorted_month_keys: list[tuple[int, int]],
    var_names: list[str],
) -> tuple[dict, dict, dict]:
    """
    计算三种均值，各返回 dict: var -> np.ndarray。
      mean_all:    shape (1, lat, lon)  — yearly 帧整体时间均值
      mean_month:  shape (12, lat, lon) — monthly 按月份分组均值（1–12月）
      mean_season: shape (4, lat, lon)  — monthly 按四季分组均值（春夏秋冬）
    """
    mean_all: dict[str, np.ndarray] = {}
    mean_month: dict[str, np.ndarray] = {}
    mean_season: dict[str, np.ndarray] = {}

    for var in var_names:
        mean_all[var] = np.nanmean(yearly_arrs[var], axis=0, keepdims=True)

        monthly_by_month = []
        for m in range(1, 13):
            indices = [i for i, (_, mo) in enumerate(sorted_month_keys) if mo == m]
            monthly_by_month.append(np.nanmean(monthly_arrs[var][indices], axis=0))
        mean_month[var] = np.stack(monthly_by_month)

        seasonal = []
        for season in SEASON_ORDER:
            months_set = SEASON_MONTHS[season]
            indices = [i for i, (_, mo) in enumerate(sorted_month_keys) if mo in months_set]
            seasonal.append(np.nanmean(monthly_arrs[var][indices], axis=0))
        mean_season[var] = np.stack(seasonal)

    return mean_all, mean_month, mean_season


def _write(path: Path, data) -> None:
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="netcdf → 格点 JSON")
    parser.add_argument("--nc-dir", default="data/nc", type=Path, metavar="DIR")
    parser.add_argument("--out-dir", default="output/static/grid", type=Path, metavar="DIR")
    args = parser.parse_args()

    yearly, monthly = _scan_files(args.nc_dir)
    if not yearly and not monthly:
        sys.exit(f"ERROR: {args.nc_dir} 下未找到 nc 文件")

    sample = next(iter(yearly.values())) if yearly else next(iter(monthly.values()))
    with xr.open_dataset(sample) as ds:
        meta, var_names = _build_meta(ds, yearly.keys(), monthly.keys())

    for sub in ("year", "month", "mean_all", "mean_month", "mean_season"):
        (args.out_dir / sub).mkdir(parents=True, exist_ok=True)

    _write(args.out_dir / "meta.json", meta)
    print(
        f"meta.json  —  {len(var_names)} vars | "
        f"year {len(meta['timeline']['year'])} frames | "
        f"month {len(meta['timeline']['month'])} frames | "
        f"dxy {'included' if 'dxy' in meta['grid'] else 'NOT FOUND'}"
    )

    print(f"\nyearly ({len(yearly)} files):")
    yearly_arrs = _collect_frames(sorted(yearly.items()), var_names)
    for var in var_names:
        _write(args.out_dir / "year" / f"{var}.json", _to_json_frames(yearly_arrs[var]))
        print(f"  -> year/{var}.json")

    print(f"\nmonthly ({len(monthly)} files):")
    sorted_month_keys = sorted(monthly.keys())
    monthly_arrs = _collect_frames(sorted(monthly.items()), var_names)
    for var in var_names:
        _write(args.out_dir / "month" / f"{var}.json", _to_json_frames(monthly_arrs[var]))
        print(f"  -> month/{var}.json")

    print("\ncomputing means...")
    mean_all, mean_month, mean_season = _compute_means(
        yearly_arrs, monthly_arrs, sorted_month_keys, var_names
    )
    for var in var_names:
        _write(args.out_dir / "mean_all" / f"{var}.json", _to_json_frames(mean_all[var]))
        _write(args.out_dir / "mean_month" / f"{var}.json", _to_json_frames(mean_month[var]))
        _write(args.out_dir / "mean_season" / f"{var}.json", _to_json_frames(mean_season[var]))
        print(f"  -> mean_all/{var}.json  mean_month/{var}.json  mean_season/{var}.json")

    print("\ndone.")


if __name__ == "__main__":
    main()
