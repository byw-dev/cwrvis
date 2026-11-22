#!/usr/bin/env python3
"""
从已生成的格点 JSON 反算色卡量程统计 CSV。

输入：
  {grid_dir}/meta.json            — 提供 grid.dxy（kg→mm 换算）和 vars 元数据
  {grid_dir}/{year|month}/*.json  — 各变量的全部帧

输出（4 个 CSV，列结构与甲方提供的原始统计表一致）：
  {out_dir}/Year_Kg_values_maxmin_summary.csv
  {out_dir}/Year_mm_values_maxmin_summary.csv
  {out_dir}/month_Kg_values_maxmin_summary.csv
  {out_dir}/month_mm_values_maxmin_summary.csv

算法（对甲方提供的统计 CSV 逐值复核确认：SP 的 count/min/max/mean/median/std/
p05/p95 及 colorbar_min/max 与之精确一致，相对差 1.25e-16）：
  样本  = 该粒度下全部帧 × 全部格点，丢弃 NaN
  mm 版 = kg 单位变量先逐格点除以 dxy（m²）得 kg/m² 即 mm；
          非 kg 变量（CEv/PEh/RCv/RCh）不换算，两版数值相同
  量程  = p10 / p90，即 coverage_percent = 80
          min >= 0            → range_mode=positive，直接取 (p10, p90)
          min <  0            → range_mode=negative_positive，
                                取 ±max(|p10|, |p90|) 的对称量程

用法（从项目根运行）：
  uv run --project scripts python scripts/grid_colorbar_stats.py
  uv run --project scripts python scripts/grid_colorbar_stats.py \
      --grid-dir static/grid --out-dir data/colorbars

依赖：numpy
"""

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

# 单位为 kg 的变量（与 backend/config.py 的 KG_VARS 保持一致）。
# 仅这些变量在 mm 版中除以 dxy。
KG_VARS = frozenset({
    "SP", "aveMv", "aveMh", "INv", "OTv",
    "INh", "OTh", "MC", "GMh", "GMv", "CWR",
})

COVERAGE_PERCENT = 80.0            # colorbar 量程覆盖的样本比例
_LO_Q = (100.0 - COVERAGE_PERCENT) / 2.0   # 10
_HI_Q = 100.0 - _LO_Q                      # 90

FIELDNAMES = [
    "varname", "count", "min", "max", "mean", "median", "std", "p05", "p95",
    "colorbar_M", "colorbar_N", "colorbar_min", "colorbar_max",
    "range_mode", "coverage_percent",
]

# (输出文件名, 格点子目录, 是否换算为 mm)
OUTPUTS = [
    ("Year_Kg_values_maxmin_summary.csv",  "year",  False),
    ("Year_mm_values_maxmin_summary.csv",  "year",  True),
    ("month_Kg_values_maxmin_summary.csv", "month", False),
    ("month_mm_values_maxmin_summary.csv", "month", True),
]


def _load_frames(path: Path) -> np.ndarray:
    """读取 {var}.json，返回 shape (T, lat, lon) 的 float 数组，null → NaN。"""
    raw = json.loads(path.read_text(encoding="utf-8"))
    return np.array(
        [[[np.nan if v is None else float(v) for v in row] for row in frame]
         for frame in raw],
        dtype=float,
    )


def _summarise(var: str, sample: np.ndarray) -> dict:
    lo = float(np.percentile(sample, _LO_Q))
    hi = float(np.percentile(sample, _HI_Q))

    if float(sample.min()) >= 0.0:
        range_mode = "positive"
        cb_min, cb_max = lo, hi
    else:
        # 跨零变量用对称量程，便于发散色卡以 0 为中心
        range_mode = "negative_positive"
        bound = max(abs(lo), abs(hi))
        cb_min, cb_max = -bound, bound

    return {
        "varname":          var,
        "count":            int(sample.size),
        "min":              float(sample.min()),
        "max":              float(sample.max()),
        "mean":             float(sample.mean()),
        "median":           float(np.median(sample)),
        "std":              float(sample.std()),   # 总体标准差（ddof=0），与甲方 CSV 一致
        "p05":              float(np.percentile(sample, 5)),
        "p95":              float(np.percentile(sample, 95)),
        "colorbar_M":       cb_min,
        "colorbar_N":       cb_max,
        "colorbar_min":     cb_min,
        "colorbar_max":     cb_max,
        "range_mode":       range_mode,
        "coverage_percent": COVERAGE_PERCENT,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="格点 JSON → 色卡量程统计 CSV")
    parser.add_argument("--grid-dir", default="static/grid", type=Path, metavar="DIR")
    parser.add_argument("--out-dir", default="data/colorbars", type=Path, metavar="DIR")
    args = parser.parse_args()

    meta_path = args.grid_dir / "meta.json"
    if not meta_path.is_file():
        sys.exit(f"ERROR: {meta_path} 不存在，请先运行 make data-grid")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    dxy = np.array(meta["grid"]["dxy"], dtype=float)   # shape (lat, lon)，单位 m²
    if not np.isfinite(dxy).all() or np.any(dxy <= 0):
        sys.exit("ERROR: meta.json 的 grid.dxy 含非有限值或非正值，无法换算 mm")
    var_names = sorted(meta["vars"])
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"grid: {dxy.shape[0]}×{dxy.shape[1]}  vars({len(var_names)}): {var_names}")

    for fname, sub, to_mm in OUTPUTS:
        sub_dir = args.grid_dir / sub
        rows = []
        for var in var_names:
            path = sub_dir / f"{var}.json"
            if not path.is_file():
                print(f"  WARNING: {path} 不存在，跳过 {var}")
                continue
            arr = _load_frames(path)
            if to_mm and var in KG_VARS:
                arr = arr / dxy[None, :, :]
            sample = arr[~np.isnan(arr)]
            if sample.size == 0:
                print(f"  WARNING: {var} 在 {sub}/ 下无有效值，跳过")
                continue
            rows.append(_summarise(var, sample))

        out_path = args.out_dir / fname
        # lineterminator="\n"：仓库 .gitattributes 要求 *.csv 为 LF
        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        n = rows[0]["count"] if rows else 0
        print(f"  -> {out_path}  ({len(rows)} vars, {n} samples each)")

    print("\ndone.  下一步：make colorbars 重新生成 frontend/src/config/colorbars.ts")


if __name__ == "__main__":
    main()
