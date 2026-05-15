# 数据预生成流程设计 — cwrvis

> 文档版本：v1.4  
> 对应模块：`scripts/`

---

## 概述

所有原始数据来源于 netcdf 文件，通过离线脚本一次性预生成为系统运行时所需的静态文件。预生成完成后，运行时不再依赖原始 netcdf 文件。

---

## 输入数据规格

### netcdf 文件结构（实测）

**目录结构：**
```
data/nc/
├── yearly/
│   └── ResultGrid_Y_YYYY-MM-DD-00_YYYY-MM-DD-00.nc
└── monthly/
    └── ResultGrid_M_YYYY-MM-DD-00_YYYY-MM-DD-00.nc
```

**当前数据范围：**
- 年颗粒度：2000–2015，共 16 个文件
- 月颗粒度：2000-01 至 2025-12，共 312 个文件

**时间步解析规则**（取起始日期）：
- `ResultGrid_Y_2006-01-01-00_2007-01-01-00.nc` → yearly: 2006
- `ResultGrid_M_2025-03-01-00_2025-04-01-00.nc` → monthly: 2025-03

**变量（实测）：**

每个 nc 文件包含以下 16 个变量，其中 `dxy`（网格面积，值恒定）不生成独立数据文件，但会导出到 `meta.json` 供前端单位换算使用：

| var 名 | long_name | units |
|--------|-----------|-------|
| SP | 地面降水 | kg |
| aveMv | 水汽平均状态量 | kg |
| aveMh | 水凝物平均状态量 | kg |
| INv | 水汽输入值 | kg |
| OTv | 水汽输出值 | kg |
| INh | 水凝物输入值 | kg |
| OTh | 水凝物输出值 | kg |
| MC | 云凝结 | kg |
| GMh | 水凝物总量 | kg |
| GMv | 水汽总量 | kg |
| CWR | 云水资源量 | kg |
| CEv | 水汽凝结效率 | % |
| PEh | 水凝物降水效率 | % |
| RCv | 水汽更新期 | day |
| RCh | 水凝物更新期 | hour |
| dxy | 网格面积（导出至 meta.json） | m² |

**空间规格（实测）：**
```
latitude  15 个点：39.5°N → 25.5°N，步长 -1°（北→南）
longitude 25 个点：75.5°E → 99.5°E，步长 +1°（西→东）
格点数：375 点/帧
坐标系：WGS-84
```

> 脚本从实际 netcdf 文件动态读取 lat/lon 坐标数组，不硬编码。

---

## 脚本一：netcdf → 格点 JSON（`scripts/netcdf_to_json.py`）

### 设计决策

**按 var 整体打包**：每个输出文件包含一个 var 在一种颗粒度下的全部时间步数据，前端切换 var 时一次请求获取完整时间轴，播放期间零网络等待。

**元数据与数据分离**：所有网格坐标、时间轴、var 描述信息集中在一个 `meta.json` 中，数据文件只存纯数值数组，消除冗余。var 的 `name`/`long_name`/`units` 直接从 nc 文件 attrs 中读取。

### 输出文件结构

```
{out_dir}/
├── meta.json
├── year/           ← 年颗粒度原始数据
│   └── {var}.json  × 15
├── month/          ← 月颗粒度原始数据
│   └── {var}.json  × 15
├── mean_all/       ← 年数据整体时间均值（1帧）
│   └── {var}.json  × 15
├── mean_month/     ← 月气候态，按月分组均值（12帧）
│   └── {var}.json  × 15
└── mean_season/    ← 季节气候态，按四季分组均值（4帧）
    └── {var}.json  × 15
```

总文件数：76 个（1 meta + 15 var × 5 颗粒度）

### meta.json 格式

```json
{
  "grid": {
    "lat": [39.5, 38.5, 37.5, ..., 25.5],
    "lon": [75.5, 76.5, 77.5, ..., 99.5],
    "dxy": [[v, v, ...], ...]
  },
  "timeline": {
    "year":        [2000, 2001, ..., 2025],
    "month":       [{"year": 2000, "month": 1}, ..., {"year": 2025, "month": 12}],
    "mean_all":    ["mean"],
    "mean_month":  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "mean_season": ["spring", "summer", "autumn", "winter"]
  },
  "vars": {
    "SP":    {"name": "SP",    "long_name": "地面降水",     "units": "kg"},
    "aveMv": {"name": "aveMv", "long_name": "水汽平均状态量", "units": "kg"},
    ...
  }
}
```

**`grid.dxy`**：shape 15×25（lat×lon），单位 m²，供前端对 `units="kg"` 的 var 做 kg→mm 换算（`mm = kg / dxy[i][j]`）。

**`timeline.mean_season` 帧顺序**：index 0=春（3/4/5月），1=夏（6/7/8月），2=秋（9/10/11月），3=冬（12/1/2月）。

### 数据文件格式

所有五种颗粒度的数据文件均为纯嵌套数组，无包裹对象：

```json
[
  [[v00, v01, ...], [v10, v11, ...], ...],   ← timeline[0] 的 (lat, lon) 帧
  [[v00, v01, ...], [v10, v11, ...], ...],   ← timeline[1] 的 (lat, lon) 帧
  ...
]
```

- `frames[i]` 对应 `meta.json` 中对应颗粒度 `timeline[granularity][i]`
- 行对应纬度（北→南），列对应经度（西→东）
- 缺测值（NaN）统一用 `null` 表示

### 执行方式

```bash
# 默认路径（nc-dir=data/nc，out-dir=static/grid）—— 从项目根运行
uv run --project scripts python scripts/netcdf_to_json.py

# 显式指定
uv run --project scripts python scripts/netcdf_to_json.py \
  --nc-dir data/nc \
  --out-dir static/grid
```

### 性能估算

- 年颗粒度：26 文件，处理时间 < 30s
- 月颗粒度：312 文件，处理时间 < 5min
- 均值计算：内存中完成（numpy nanmean），< 10s
- 输出总体积：约 50MB 原始（gzip 后约 14MB）

---

## 脚本二：区域统计 SQLite（`db/stats.db`）

生成 `db/stats.db` 有两条途径，产出的数据库 schema 完全相同：

| 途径 | 脚本 | 适用场景 | 状态 |
|------|------|----------|------|
| **路径 A**：netcdf × shape → SQLite | `scripts/netcdf_to_sqlite.py` | 无预计算 CSV，从原始格点数据自行空间聚合 | ✅ 已实现 |
| **路径 B**：预计算 CSV → SQLite | `scripts/csv_to_sqlite.py` | 数据同事提供了统计口径一致的预计算 CSV | ✅ 已实现 |

**选择依据**：优先路径 B。当 `data/csv/` 目录中有完整 CSV 文件时直接导入，保证统计口径与数据同事一致；否则退回路径 A，由本项目脚本完成空间聚合（口径可能存在差异）。

---

### 路径 A：netcdf × shape → SQLite（`scripts/netcdf_to_sqlite.py`）

对每个预设区域 × netcdf 格点数据做空间叠加计算，将结果写入 SQLite 宽表。表中只存储 `year` / `month` 两种原始粒度；`mean_all` / `mean_month` / `mean_season` 三种聚合值在查询时由 SQL `AVG + GROUP BY` 实时计算，不预存。

坐标系：`data/shapes/` 中的 GeoJSON 与 netcdf 格点均视为 WGS-84 直接使用（1° 格点粒度下 GCJ-02 偏移量可忽略，见 DEC-005）。

---

### 空间聚合策略（Strategy Pattern）

空间聚合逻辑抽象为 `RegionAggregator` ABC，两种实现通过 `--method` CLI 参数选择：

```python
class RegionAggregator(ABC):
    def prepare(self, region_geom, grid_lats: list, grid_lons: list) -> None:
        """每个区域调用一次，缓存权重/掩码，避免逐帧重复计算。"""
        ...

    @abstractmethod
    def aggregate(self, frame_2d: np.ndarray, var_unit: str) -> float:
        """将单帧二维格点数组聚合为标量。frame_2d shape: (lat, lon)。"""
        ...
```

**`AreaWeightedMean`（`--method area_weighted`，默认）**

用 geopandas/shapely 计算每个格点单元与区域多边形的面积重叠比例作为权重，对所有 var 做加权平均：

```python
weights = compute_overlap_weights(region_geom, grid_lats, grid_lons)  # shape (lat, lon)
value = np.nansum(frame_2d * weights) / np.nansum(weights[~np.isnan(frame_2d)])
```

**`PointInBoundary`（`--method point_in_boundary`）**

仅取中心点落在区域多边形内的格点，按 var 单位分派聚合算子：

```python
mask = points_in_polygon(region_geom, grid_lats, grid_lons)  # bool (lat, lon)
vals = frame_2d[mask & ~np.isnan(frame_2d)]
value = np.sum(vals) if var_unit == 'kg' else np.mean(vals)
```

**区域面积计算（`region_areas` 表）**

每种聚合方法在 `prepare()` 阶段一并计算区域有效面积，写入 `region_areas` 表：

| 方法 | area_m2 计算方式 |
|------|----------------|
| `AreaWeightedMean` | `Σ(dxy[i][j] × overlap_ratio[i][j])`，对所有与区域有面积交叉的格点加权求和 |
| `PointInBoundary` | `Σ(dxy[i][j])` for `mask[i][j] == True`，对中心点在边界内的格点求和 |

`dxy` 数组从 netcdf 文件中读取（与格点 JSON 导出时使用的同一数组，单位 m²）。

**var 单位与聚合算子对应关系**（`PointInBoundary` 使用）：

| 单位 | 算子 | 对应 var |
|------|------|---------|
| `kg` | SUM | SP, aveMv, aveMh, INv, OTv, INh, OTh, MC, GMh, GMv, CWR |
| `%` | MEAN | CEv, PEh |
| `day` / `hour` | MEAN | RCv, RCh |

---

### SQLite 数据库设计（宽表）

数据库文件路径：`db/stats.db`（生成后加入 `.gitignore`，不入版本库）

```sql
CREATE TABLE region_stats (
    region_id   TEXT    NOT NULL,
    granularity TEXT    NOT NULL CHECK (granularity IN ('year', 'month')),
    year        INTEGER NOT NULL,
    month       INTEGER,          -- NULL when granularity='year'
    SP          REAL,
    aveMv       REAL,
    aveMh       REAL,
    INv         REAL,
    OTv         REAL,
    INh         REAL,
    OTh         REAL,
    MC          REAL,
    GMh         REAL,
    GMv         REAL,
    CWR         REAL,
    CEv         REAL,
    PEh         REAL,
    RCv         REAL,
    RCh         REAL,
    PRIMARY KEY (region_id, granularity, year, month)
);

CREATE INDEX idx_region_gran ON region_stats (region_id, granularity, year, month);

-- 区域有效面积（供前端 kg→mm 单位换算使用）
-- 计算方式随空间聚合路径不同而异（见下方各路径说明）
CREATE TABLE region_areas (
    region_id TEXT PRIMARY KEY,
    area_m2   REAL NOT NULL
);
```

### 后端时间聚合 SQL 示例

后端直接对宽表做 SQL 聚合，无需预存派生数据：

```sql
-- mean_all：全期年均
SELECT AVG(SP) AS SP, AVG(CWR) AS CWR, ...
FROM region_stats
WHERE region_id = ? AND granularity = 'year'
  AND year BETWEEN ? AND ?;

-- mean_month：多年月气候态（按月号分组）
SELECT month, AVG(SP) AS SP, AVG(CWR) AS CWR, ...
FROM region_stats
WHERE region_id = ? AND granularity = 'month'
  AND year BETWEEN ? AND ?
GROUP BY month ORDER BY month;

-- mean_season：季节气候态
SELECT
  CASE
    WHEN month IN (3,4,5) THEN 'spring'
    WHEN month IN (6,7,8) THEN 'summer'
    WHEN month IN (9,10,11) THEN 'autumn'
    ELSE 'winter'
  END AS season,
  AVG(SP) AS SP, AVG(CWR) AS CWR, ...
FROM region_stats
WHERE region_id = ? AND granularity = 'month'
  AND year BETWEEN ? AND ?
GROUP BY season;
```

### 执行参数

```bash
# 默认方法（area_weighted）
uv run --project scripts python scripts/netcdf_to_sqlite.py \
  --nc-dir data/nc \
  --shape-dir data/shapes \
  --db-path db/stats.db

# 切换方法
uv run --project scripts python scripts/netcdf_to_sqlite.py \
  --nc-dir data/nc \
  --shape-dir data/shapes \
  --db-path db/stats_pointin.db \
  --method point_in_boundary
```

### 性能估算

- 总行数：2,704 行（8 区域 × 338 时间步）
- 预计总耗时：< 10 分钟（`prepare()` 每区域调用一次，权重缓存后逐帧复用）
- 数据库文件体积：< 1MB

---

### 路径 B：预计算 CSV → SQLite（`scripts/csv_to_sqlite.py`）

#### 输入数据规格

**目录结构：**

```
data/csv/
├── monthly/
│   ├── ali_NCEP_00to25_M_client.csv
│   ├── changdu_NCEP_00to25_M_client.csv
│   ├── lasa_NCEP_00to25_M_client.csv
│   ├── linzhi_NCEP_00to25_M_client.csv
│   ├── naqu_NCEP_00to25_M_client.csv
│   ├── rikaze_NCEP_00to25_M_client.csv
│   ├── shannan_NCEP_00to25_M_client.csv
│   └── xizang_NCEP_00to25_M_client.csv
└── yearly/
    ├── ali_NCEP_00to25_Y_client.csv
    ├── changdu_NCEP_00to25_Y_client.csv
    ├── lasa_NCEP_00to25_Y_client.csv
    ├── linzhi_NCEP_00to25_Y_client.csv
    ├── naqu_NCEP_00to25_Y_client.csv
    ├── rikaze_NCEP_00to25_Y_client.csv
    ├── shannan_NCEP_00to25_Y_client.csv
    └── xizang_NCEP_00to25_Y_client.csv
```

文件命名规则：`{region_id}_NCEP_00to25_{M|Y}_client.csv`，`M` 为月粒度，`Y` 为年粒度。每种粒度 8 个文件，region_id 与系统 `REGION_MAP` 完全对应。

**时间列**：`time` 列值格式为 `YYYY-MM-DDT00:00:00`。月粒度取年份和月份；年粒度取年份，month 写 `NULL`。

**导入的列**：

- **`region_stats` 表**（共 15 个 var 列）：`SP`、`aveMv`、`aveMh`、`INv`、`OTv`、`INh`、`OTh`、`MC`、`GMh`、`GMv`、`CWR`、`CEv`、`PEh`、`RCv`、`RCh`
- **`region_areas` 表**（1 列）：`dxy`——CSV 中每行值相同（区域总面积），取任意一行的第一个非空值写入 `area_m2`

忽略的列包括：`INw`、`OTw`、`GMw`、`AWR`、`PEv`、`PEw`、`Mv0`、`MvT`、`Mh0`、`MhT`、`Mw0`、`MwT`、`SE`、`ME`、方向分量（`INv_W/E/N/S` 等）、`data_source`、`period_unit`。

#### 执行方式

```bash
# 默认路径（csv-dir=data/csv，db-path=db/stats.db）—— 从项目根运行
uv run --project scripts python scripts/csv_to_sqlite.py

# 显式指定
uv run --project scripts python scripts/csv_to_sqlite.py \
  --csv-dir data/csv \
  --db-path db/stats.db
```

脚本先删除再重建 `region_stats` 表（幂等操作，可重复运行）。总行数与路径 A 相同（2,704 行），执行耗时 < 5 秒。

---

## 色卡配置

var 的色卡参数（colorScale、valueMin、valueMax）**不**在 meta.json 中，由前端 `frontend/src/config/vars.ts` 单独维护，与数据预生成流程解耦。

---

## 项目构建脚本（`Makefile`）

项目根目录的 `Makefile` 统一管理数据生成、前端构建与打包全流程。

### 主要 target

| Target | 功能 |
|--------|------|
| `make data-sqlite` | 路径 A：运行 `netcdf_to_sqlite.py`，从 netcdf 格点空间聚合（可通过 `METHOD=point_in_boundary` 覆盖算法） |
| `make data-sqlite-csv` | 路径 B：运行 `csv_to_sqlite.py`，从预计算 CSV 导入（需要 `data/csv/` 就绪） |
| `make data-grid` | 运行 `netcdf_to_json.py`，生成格点 JSON |
| `make shapes` | 将 `data/shapes/` 中文文件名按 region_id 重命名复制到 `static/shapes/` |
| `make frontend` | `pnpm build`，产物输出至 `static/web/` |
| `make package` | 组装分发目录 + 打 `.tar.gz` 压缩包（含 `bin/`、`app/`、`static/`、`db/`、`conf/`） |
| `make dev` | 同时启动 FastAPI dev server（8000）和 Vite dev server（5173） |
| `make clean` | 删除全部生成文件（`static/grid/`、`static/shapes/`、`static/web/`、`db/`、`dist/`） |

所有生成产物（`static/grid/`、`static/shapes/`、`static/web/`、`static/reports/`、`db/`、`dist/`）均在 `.gitignore` 中排除，不入版本库。

---

## 预生成执行顺序

```
1. shape 文件已就绪（data/shapes/，直接使用，视为 WGS-84）
2. 生成区域统计 SQLite（二选一）：
   - make data-sqlite-csv  （路径 B：从预计算 CSV 导入，需要 data/csv/ 就绪）
   - make data-sqlite      （路径 A：从 netcdf 格点空间聚合，需要 data/nc/ 就绪）
3. make data-grid      （生成格点 JSON 及 meta.json，需要 netcdf 原始数据）
4. 将 .docx 报告文件按命名规则放入 static/reports/
5. make frontend       （编译前端，需要 Node.js 环境就绪）
6. make package        （制作分发压缩包）
```
