#!/usr/bin/env python3
"""
预生成格点 JSON 切片。

输入目录结构：
  {nc_dir}/yearly/ResultGrid_Y_YYYY-MM-DD-00_YYYY-MM-DD-00.nc
  {nc_dir}/monthly/ResultGrid_M_YYYY-MM-DD-00_YYYY-MM-DD-00.nc

输出：
  {out_dir}/meta.json          — 网格坐标、时间轴、var 元数据（从 nc attrs 读取）
  {out_dir}/year/{var}.json    — 年颗粒度数据，shape (n_year, lat, lon)，NaN→null
  {out_dir}/month/{var}.json   — 月颗粒度数据，shape (n_month, lat, lon)，NaN→null

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

    meta = {
        "grid": {"lat": lat, "lon": lon},
        "timeline": {
            "year": sorted(year_keys),
            "month": [{"year": y, "month": mo} for y, mo in sorted(month_keys)],
        },
        "vars": vars_meta,
    }
    return meta, var_names


def _to_nested(arr: np.ndarray) -> list:
    return [[None if np.isnan(v) else float(v) for v in row] for row in arr]


def _collect_frames(files_sorted: list, var_names: list[str]) -> dict[str, list]:
    frames: dict[str, list] = {var: [] for var in var_names}
    total = len(files_sorted)
    for i, (_, path) in enumerate(files_sorted, 1):
        print(f"  [{i}/{total}] {path.name}", flush=True)
        with xr.open_dataset(path) as ds:
            for var in var_names:
                frames[var].append(_to_nested(ds[var].values))
    return frames


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

    (args.out_dir / "year").mkdir(parents=True, exist_ok=True)
    (args.out_dir / "month").mkdir(parents=True, exist_ok=True)

    _write(args.out_dir / "meta.json", meta)
    print(
        f"meta.json  —  {len(var_names)} vars | "
        f"year {len(meta['timeline']['year'])} frames | "
        f"month {len(meta['timeline']['month'])} frames"
    )

    print(f"\nyearly ({len(yearly)} files):")
    yearly_frames = _collect_frames(sorted(yearly.items()), var_names)
    for var in var_names:
        _write(args.out_dir / "year" / f"{var}.json", yearly_frames[var])
        print(f"  -> year/{var}.json")

    print(f"\nmonthly ({len(monthly)} files):")
    monthly_frames = _collect_frames(sorted(monthly.items()), var_names)
    for var in var_names:
        _write(args.out_dir / "month" / f"{var}.json", monthly_frames[var])
        print(f"  -> month/{var}.json")

    print("\ndone.")


if __name__ == "__main__":
    main()
