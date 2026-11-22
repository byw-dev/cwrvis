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
  uv run python scripts/netcdf_to_json.py --nc-dir data/full/nc --out-dir output/static/grid
"""

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import xarray as xr

# 系统支持的 15 个变量（与 frontend/src/config/vars.ts 保持一致）。
# 采用正向白名单而非反向排除：部分数据集的 nc 含数十个中间变量（边界通量、
# 初/终值等），前端并不使用，全量导出会让产物体积和 DB 列数无谓膨胀。
INCLUDE_VARS = frozenset({
    "SP", "aveMv", "aveMh", "INv", "OTv", "INh", "OTh",
    "MC", "GMh", "GMv", "CWR", "CEv", "PEh", "RCv", "RCh",
})

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


def _reference_grid(paths) -> tuple[list[float], list[float], np.ndarray]:
    """
    扫描全部 nc，返回 (基准 lat 降序, 基准 lon 升序, 拼接后的 dxy)。

    甲方数据可能出现个别年份缺行的情况（如 2025 年缺最南一行 16.5°N），
    直接 np.stack 会因形状不一致报错。取并集作为基准格点，各帧 reindex 后
    缺失处为 NaN —— 面积加权时 NaN 单元不计权重，格点图上留空。

    dxy 从全部文件拼接：同一格点在多个文件中出现时必须一致；任何格点缺失
    dxy 直接报错，避免把 NaN 写进 meta.json（非法 JSON）或把缺失面积当 0。
    """
    lats: set[float] = set()
    lons: set[float] = set()
    coords: dict[Path, tuple[list[float], list[float]]] = {}
    for path in paths:
        with xr.open_dataset(path) as ds:
            la = [float(v) for v in ds.coords["latitude"].values]
            lo = [float(v) for v in ds.coords["longitude"].values]
        coords[path] = (la, lo)
        lats.update(la)
        lons.update(lo)

    ref_lats, ref_lons = sorted(lats, reverse=True), sorted(lons)
    lat_ix = {v: i for i, v in enumerate(ref_lats)}
    lon_ix = {v: i for i, v in enumerate(ref_lons)}
    dxy = np.full((len(ref_lats), len(ref_lons)), np.nan)
    filled = np.zeros(dxy.shape, dtype=bool)

    for path, (la, lo) in coords.items():
        with xr.open_dataset(path) as ds:
            if "dxy" not in ds.data_vars:
                sys.exit(f"ERROR: {path.name} 缺少 dxy 变量")
            block = ds["dxy"].values.astype(float)
        li = np.array([lat_ix[v] for v in la])
        lj = np.array([lon_ix[v] for v in lo])
        existing = filled[np.ix_(li, lj)]
        if existing.any() and not np.allclose(
            dxy[np.ix_(li, lj)][existing], block[existing], rtol=0.0, atol=1e-6
        ):
            sys.exit(f"ERROR: dxy 在多个文件中不一致（{path.name}）")
        dxy[np.ix_(li, lj)] = block
        filled[np.ix_(li, lj)] = True

    missing = int((~filled).sum())
    if missing:
        sys.exit(f"ERROR: {missing} 个格点缺少 dxy，无法生成 meta.json")
    return ref_lats, ref_lons, dxy


def _aligned(ds: xr.Dataset, ref_lats: list[float], ref_lons: list[float]) -> xr.Dataset:
    """把数据集重投影到基准格点，缺失格点填 NaN。已对齐时为无操作。"""
    if (list(ds.coords["latitude"].values) == ref_lats
            and list(ds.coords["longitude"].values) == ref_lons):
        return ds
    return ds.reindex(latitude=ref_lats, longitude=ref_lons)


def _build_meta(ds: xr.Dataset, year_keys, month_keys, dxy: np.ndarray) -> tuple[dict, list[str]]:
    lat = ds.coords["latitude"].values.tolist()
    lon = ds.coords["longitude"].values.tolist()

    var_names = [v for v in ds.data_vars if v in INCLUDE_VARS]
    vars_meta = {}
    for var in var_names:
        attrs = ds[var].attrs
        vars_meta[var] = {
            "name": attrs.get("name", var),
            "long_name": attrs.get("long_name", ""),
            "units": attrs.get("units", ""),
        }

    grid: dict = {
        "lat": lat,
        "lon": lon,
        "dxy": [[float(v) for v in row] for row in dxy],
    }

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


def _collect_frames(
    files_sorted: list,
    var_names: list[str],
    ref_lats: list[float],
    ref_lons: list[float],
) -> dict[str, np.ndarray]:
    """读取 NC 文件，返回 dict: var -> np.ndarray shape (T, lat, lon)，NaN 保留。"""
    arrs: dict[str, list] = {var: [] for var in var_names}
    total = len(files_sorted)
    for i, (_, path) in enumerate(files_sorted, 1):
        print(f"  [{i}/{total}] {path.name}", flush=True)
        with xr.open_dataset(path) as ds:
            ds = _aligned(ds, ref_lats, ref_lons)
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
    units_map: dict[str, str],
) -> tuple[dict, dict, dict]:
    """
    计算三种均值，各返回 dict: var -> np.ndarray。
      mean_all:    shape (1, lat, lon)  — yearly 帧整体时间均值
      mean_month:  shape (12, lat, lon) — monthly 按月份分组均值（1–12月）
      mean_season: shape (4, lat, lon)  — monthly 按四季分组均值（春夏秋冬）

    mean_season 对 kg 变量采用两步聚合（与后端 SQL 一致）：
      第一步：每年季节内月份 SUM → 得到该年该季节总量
      第二步：跨年 nanmean → 多年平均季节总量
    非 kg 变量直接 nanmean（等价于两步 avg）。
    """
    mean_all: dict[str, np.ndarray] = {}
    mean_month: dict[str, np.ndarray] = {}
    mean_season: dict[str, np.ndarray] = {}

    years = sorted({yr for yr, _ in sorted_month_keys})

    for var in var_names:
        mean_all[var] = np.nanmean(yearly_arrs[var], axis=0, keepdims=True)

        monthly_by_month = []
        for m in range(1, 13):
            indices = [i for i, (_, mo) in enumerate(sorted_month_keys) if mo == m]
            monthly_by_month.append(np.nanmean(monthly_arrs[var][indices], axis=0))
        mean_month[var] = np.stack(monthly_by_month)

        is_kg = units_map.get(var) == "kg"
        seasonal = []
        for season in SEASON_ORDER:
            months_set = SEASON_MONTHS[season]
            if is_kg:
                # 两步聚合：先按年 SUM 季节内月份，再跨年 nanmean
                year_totals = []
                for yr in years:
                    idx = [i for i, (y, mo) in enumerate(sorted_month_keys)
                           if y == yr and mo in months_set]
                    if idx:
                        arr = monthly_arrs[var][idx]
                        # 全 NaN 格点保持 NaN，而非 nansum 的 0
                        total = np.where(np.all(np.isnan(arr), axis=0),
                                         np.nan, np.nansum(arr, axis=0))
                        year_totals.append(total)
                if year_totals:
                    seasonal.append(np.nanmean(np.stack(year_totals), axis=0))
                else:
                    seasonal.append(np.full(monthly_arrs[var].shape[1:], np.nan))
            else:
                # 非 kg：直接 nanmean（等价于两步取 avg）
                indices = [i for i, (_, mo) in enumerate(sorted_month_keys) if mo in months_set]
                seasonal.append(np.nanmean(monthly_arrs[var][indices], axis=0))
        mean_season[var] = np.stack(seasonal)

    return mean_all, mean_month, mean_season


def _write(path: Path, data) -> None:
    # allow_nan=False：meta 里的 dxy 若有 NaN，宁可在这里失败，也不写出浏览器
    # JSON.parse 无法解析的非标准 NaN 字面量（数据帧的 NaN 已在 _to_json_frames 转 null）
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="netcdf → 格点 JSON")
    parser.add_argument("--nc-dir", default="data/full/nc", type=Path, metavar="DIR")
    parser.add_argument("--out-dir", default="static/grid", type=Path, metavar="DIR")
    args = parser.parse_args()

    yearly, monthly = _scan_files(args.nc_dir)
    if not yearly and not monthly:
        sys.exit(f"ERROR: {args.nc_dir} 下未找到 nc 文件")

    all_paths = list(yearly.values()) + list(monthly.values())
    ref_lats, ref_lons, dxy = _reference_grid(all_paths)
    print(f"基准格点：{len(ref_lats)} lat × {len(ref_lons)} lon  (dxy 已拼接校验)")

    with xr.open_dataset(all_paths[0]) as ds:
        meta, var_names = _build_meta(
            _aligned(ds, ref_lats, ref_lons), yearly.keys(), monthly.keys(), dxy
        )

    units_map = {var: meta["vars"][var]["units"] for var in var_names}

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
    yearly_arrs = _collect_frames(sorted(yearly.items()), var_names, ref_lats, ref_lons)
    for var in var_names:
        _write(args.out_dir / "year" / f"{var}.json", _to_json_frames(yearly_arrs[var]))
        print(f"  -> year/{var}.json")

    print(f"\nmonthly ({len(monthly)} files):")
    sorted_month_keys = sorted(monthly.keys())
    monthly_arrs = _collect_frames(sorted(monthly.items()), var_names, ref_lats, ref_lons)
    for var in var_names:
        _write(args.out_dir / "month" / f"{var}.json", _to_json_frames(monthly_arrs[var]))
        print(f"  -> month/{var}.json")

    print("\ncomputing means...")
    mean_all, mean_month, mean_season = _compute_means(
        yearly_arrs, monthly_arrs, sorted_month_keys, var_names, units_map
    )
    for var in var_names:
        _write(args.out_dir / "mean_all" / f"{var}.json", _to_json_frames(mean_all[var]))
        _write(args.out_dir / "mean_month" / f"{var}.json", _to_json_frames(mean_month[var]))
        _write(args.out_dir / "mean_season" / f"{var}.json", _to_json_frames(mean_season[var]))
        print(f"  -> mean_all/{var}.json  mean_month/{var}.json  mean_season/{var}.json")

    print("\ndone.")


if __name__ == "__main__":
    main()
