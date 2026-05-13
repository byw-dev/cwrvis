# 数据预生成流程设计 — cwrvis

> 文档版本：v1.3  
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
# 默认路径（nc-dir=data/nc，out-dir=output/static/grid）
uv run python scripts/netcdf_to_json.py

# 指定路径
uv run python scripts/netcdf_to_json.py \
  --nc-dir data/nc \
  --out-dir /data/static/grid
```

### 性能估算

- 年颗粒度：26 文件，处理时间 < 30s
- 月颗粒度：312 文件，处理时间 < 5min
- 均值计算：内存中完成（numpy nanmean），< 10s
- 输出总体积：约 50MB 原始（gzip 后约 14MB）

---

## 脚本二：netcdf × shape → SQLite（`scripts/netcdf_to_sqlite.py`）

### 功能

将每个预设区域与 netcdf 格点数据做空间叠加计算，提取区域内格点的面积加权平均值，存入 SQLite 数据库。

### 统计方法

```python
# 伪代码
for region in regions:
    for nc_file in nc_files:
        for var in vars:
            weights = compute_overlap_weights(region.geometry, nc_grid)
            value = np.nansum(data[var] * weights) / np.nansum(weights)
            db.insert(region_id, granularity, year, month, var, value)
```

### SQLite 数据库设计

数据库文件路径：`/static/db/stats.db`

```sql
CREATE TABLE region_stats (
    region_id   TEXT    NOT NULL,
    granularity TEXT    NOT NULL CHECK (granularity IN ('year', 'month')),
    year        INTEGER NOT NULL,
    month       INTEGER,
    var         TEXT    NOT NULL,
    value       REAL,
    PRIMARY KEY (region_id, granularity, year, month, var)
);

CREATE TABLE regions (
    region_id   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    name_en     TEXT,
    geojson     TEXT NOT NULL
);

CREATE INDEX idx_region_gran ON region_stats (region_id, granularity, year, month);
```

### 执行参数设计

```bash
uv run python scripts/netcdf_to_sqlite.py \
  --nc-dir data/nc \
  --shape-dir data/shapes \
  --db-path /data/static/db/stats.db
```

### 性能估算

- 总记录数：约 2 万行（8 区域 × 328 时间步 × 15 var）
- 预计总耗时：< 10 分钟
- 数据库文件体积：< 5MB

---

## 色卡配置

var 的色卡参数（colorScale、valueMin、valueMax）**不**在 meta.json 中，由前端 `frontend/src/config/vars.js` 单独维护，与数据预生成流程解耦。

---

## 预生成执行顺序

```
1. shape 文件已就绪（data/shapes/，GCJ-02）
2. uv run python scripts/netcdf_to_sqlite.py（生成区域统计数据库）
3. uv run python scripts/netcdf_to_json.py（生成格点 JSON 及 meta.json）
4. 将 .docx 报告文件按命名规则放入 /static/reports/
```
