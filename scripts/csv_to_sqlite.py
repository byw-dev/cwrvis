#!/usr/bin/env python3
"""
预计算 CSV → SQLite 区域统计数据库。

输入：
  {csv_dir}/yearly/{region_id}_NCEP_00to25_Y_client.csv
  {csv_dir}/monthly/{region_id}_NCEP_00to25_M_client.csv

输出：
  {db_path}：SQLite 宽表
    region_stats(region_id, granularity, year, month, SP, aveMv, ..., RCh)
    region_areas(region_id, area_m2)  ← 区域有效面积，供前端 kg→mm 换算
  仅存 granularity IN ('year','month') 的原始统计值；
  mean_all / mean_month / mean_season 由后端查询时用 SQL 实时计算。

  幂等操作：先删除再重建 region_stats 表，可重复运行。

用法：
  uv run python scripts/csv_to_sqlite.py
  uv run python scripts/csv_to_sqlite.py \\
      --csv-dir data/csv --db-path db/stats.db

依赖：Python 标准库（csv, sqlite3, argparse, pathlib）
"""

import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# constants                                                                     #
# --------------------------------------------------------------------------- #

VAR_NAMES = [
    "SP", "aveMv", "aveMh", "INv", "OTv", "INh", "OTh",
    "MC", "GMh", "GMv", "CWR", "CEv", "PEh", "RCv", "RCh",
]

# {region_id}_NCEP_00to25_{M|Y}_client.csv
_FNAME_RE = re.compile(r"^(\w+)_NCEP_00to25_([MY])_client\.csv$")

_GRAN_SUFFIX = {"Y": "year", "M": "month"}
_GRAN_SUBDIR = {"Y": "yearly", "M": "monthly"}


# --------------------------------------------------------------------------- #
# SQLite                                                                        #
# --------------------------------------------------------------------------- #

def _init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    var_col_defs = "".join(f"    {v:<8}REAL,\n" for v in VAR_NAMES)
    conn.executescript(f"""\
DROP TABLE IF EXISTS region_stats;
DROP INDEX IF EXISTS idx_region_gran;
DROP TABLE IF EXISTS region_areas;
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
CREATE TABLE region_areas (
    region_id TEXT PRIMARY KEY,
    area_m2   REAL NOT NULL
);
""")
    conn.commit()
    return conn


def _insert_rows(conn: sqlite3.Connection, rows: list[dict]) -> None:
    all_cols = ["region_id", "granularity", "year", "month"] + VAR_NAMES
    placeholders = ", ".join("?" * len(all_cols))
    sql = (
        f"INSERT OR REPLACE INTO region_stats "
        f"({', '.join(all_cols)}) VALUES ({placeholders})"
    )
    conn.executemany(sql, [[r[c] for c in all_cols] for r in rows])
    conn.commit()


# --------------------------------------------------------------------------- #
# CSV parsing                                                                   #
# --------------------------------------------------------------------------- #

def _parse_float(s: str) -> float | None:
    s = s.strip()
    if s in ("", "nan", "NaN", "None", "null", "NULL"):
        return None
    return float(s)


def _load_csv(path: Path, region_id: str, granularity: str) -> tuple[list[dict], float | None]:
    """返回 (rows, area_m2)。area_m2 从首行 dxy 列读取，同一区域内各行相同。"""
    rows = []
    area_m2: float | None = None
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            if area_m2 is None:
                area_m2 = _parse_float(raw.get("dxy", ""))

            # time 格式：YYYY-MM-DDT00:00:00，取日期部分的年和月
            date_part = raw["time"].split("T")[0]
            y, mo, _ = date_part.split("-")
            year = int(y)
            month = int(mo) if granularity == "month" else None

            row: dict = {
                "region_id":   region_id,
                "granularity": granularity,
                "year":        year,
                "month":       month,
            }
            for var in VAR_NAMES:
                row[var] = _parse_float(raw.get(var, ""))
            rows.append(row)
    return rows, area_m2


# --------------------------------------------------------------------------- #
# main                                                                          #
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description="预计算 CSV → SQLite 区域统计")
    parser.add_argument("--csv-dir", default="data/csv", type=Path, metavar="DIR")
    parser.add_argument("--db-path", default="db/stats.db", type=Path, metavar="FILE")
    args = parser.parse_args()

    # ---- 扫描 CSV 文件 ----
    all_files: list[tuple[Path, str, str]] = []  # (path, region_id, granularity)
    for suffix, gran in _GRAN_SUFFIX.items():
        sub_dir = args.csv_dir / _GRAN_SUBDIR[suffix]
        if not sub_dir.is_dir():
            print(f"WARNING: {sub_dir} not found, skipping")
            continue
        for f in sorted(sub_dir.glob(f"*_NCEP_00to25_{suffix}_client.csv")):
            m = _FNAME_RE.match(f.name)
            if not m:
                print(f"WARNING: unexpected filename {f.name}, skipping")
                continue
            all_files.append((f, m.group(1), gran))

    if not all_files:
        sys.exit(f"ERROR: {args.csv_dir} 下未找到匹配的 CSV 文件")

    print(f"found {len(all_files)} CSV files → {args.db_path}")

    # ---- 初始化数据库 ----
    conn = _init_db(args.db_path)

    # ---- 逐文件导入 ----
    total_rows = 0
    areas: dict[str, float] = {}   # region_id → area_m2（每个区域只记一次）
    for path, region_id, granularity in all_files:
        print(f"  {path.name}", end=" ... ", flush=True)
        rows, area_m2 = _load_csv(path, region_id, granularity)
        _insert_rows(conn, rows)
        total_rows += len(rows)
        if area_m2 is not None and region_id not in areas:
            areas[region_id] = area_m2
        print(f"{len(rows)} rows")

    if areas:
        conn.executemany(
            "INSERT OR REPLACE INTO region_areas (region_id, area_m2) VALUES (?, ?)",
            list(areas.items()),
        )
        conn.commit()

    conn.close()
    print(f"\ndone.  db={args.db_path}  total rows={total_rows}  areas written={len(areas)}")


if __name__ == "__main__":
    main()
