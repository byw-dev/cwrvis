# 数据预生成流程设计 — cwrvis

> 文档版本：v1.0  
> 对应模块：`scripts/`

---

## 概述

所有原始数据来源于 netcdf 文件，通过离线脚本一次性预生成为系统运行时所需的静态文件。预生成完成后，运行时不再依赖原始 netcdf 文件。

---

## 输入数据规格

### netcdf 文件结构（约定）

年颗粒度文件（共 25 个，对应 2000–2024 年）：
```
文件名示例：cwr_annual_2010.nc
维度：lat（纬度）× lon（经度）
变量：40–50 个 data_var，每个 shape = (lat_size, lon_size)
```

月颗粒度文件（共 300 个，对应 2000-01 ~ 2024-12）：
```
文件名示例：cwr_monthly_2010_03.nc
维度：lat × lon
变量：同上
```

空间规格（中国区域，1度网格）：
```
lat 范围：约 18°N ~ 53°N，lat_size ≈ 36
lon 范围：约 73°E ~ 135°E，lon_size ≈ 63
坐标系：WGS-84
```

> **注意**：脚本需要从实际 netcdf 文件读取精确的 lat/lon 坐标数组，不得硬编码，以免与实际数据不符。

### shape 文件结构

来源：高德开放平台（已下载，存放于 `data/shapes/`）或甲方提供
格式：GeoJSON（FeatureCollection，含 `adcode`、`name` 等高德属性字段）
坐标系：**GCJ-02**（高德平台下载的文件已确认为 GCJ-02，无需转换）
数量：当前已有 8 个区域（西藏自治区全区 + 7 个地市）

当前 `data/shapes/` 文件列表：
- `西藏自治区.geojson`（省级边界）
- `拉萨市.geojson`、`日喀则市.geojson`、`昌都市.geojson`
- `林芝市.geojson`、`山南市.geojson`、`那曲市.geojson`、`阿里地区.geojson`

> 若甲方另行提供 shape 文件，须先确认坐标系；若为 WGS-84，需先转换为 GCJ-02 再放入 `data/shapes/`。

---

## 脚本一：netcdf → 格点 JSON（`scripts/netcdf_to_json.py`）

### 功能

将每个 netcdf 文件中的每个 data_var 提取为独立的 JSON 文件。

### 输出文件结构

```
/static/grid/
├── year/
│   ├── precipitation/
│   │   ├── 2000.json
│   │   ├── 2001.json
│   │   └── ...
│   ├── temperature/
│   │   └── ...
│   └── {var_name}/
│       └── ...
└── month/
    ├── precipitation/
    │   ├── 2000_01.json
    │   ├── 2000_02.json
    │   └── ...
    └── {var_name}/
        └── ...
```

### 单个 JSON 文件格式

```json
{
  "var": "precipitation",
  "granularity": "year",
  "year": 2010,
  "month": null,
  "lat_min": 18.0,
  "lat_max": 53.0,
  "lon_min": 73.0,
  "lon_max": 135.0,
  "lat_size": 36,
  "lon_size": 63,
  "data": [
    [12.3, 15.6, null, ...],
    [...],
    ...
  ]
}
```

说明：
- `data` 为二维数组，行对应纬度（从北到南），列对应经度（从西到东）
- 缺测值（NaN）统一用 `null` 表示
- 坐标信息（lat_min 等）从实际 netcdf 文件读取

### 执行参数设计

```bash
python scripts/netcdf_to_json.py \
  --nc-dir /data/netcdf/annual \
  --granularity year \
  --out-dir /data/static/grid \
  --vars precipitation temperature runoff \  # 不指定则处理全部 var
  --years 2000 2024 \                        # 年份范围，不指定则全部
  --workers 4                                # 并行进程数
```

### 性能估算

- 单文件单变量处理时间：< 0.1s
- 总切片数：约 16,250 个
- 预计总耗时：< 30 分钟（4进程并行）
- 输出总体积：约 800MB

---

## 脚本二：netcdf × shape → SQLite（`scripts/netcdf_to_sqlite.py`）

### 功能

将每个预设区域与 netcdf 格点数据做空间叠加计算，提取区域内格点的统计值（面积加权平均），存入 SQLite 数据库。

### 统计方法

对于每个区域，遍历其 shape 范围内的格点，按格点在区域内的面积占比加权平均。

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
-- 区域统计主表
CREATE TABLE region_stats (
    region_id   TEXT    NOT NULL,
    granularity TEXT    NOT NULL CHECK (granularity IN ('year', 'month')),
    year        INTEGER NOT NULL,
    month       INTEGER,
    var         TEXT    NOT NULL,
    value       REAL,
    PRIMARY KEY (region_id, granularity, year, month, var)
);

-- 区域元数据表
CREATE TABLE regions (
    region_id   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    name_en     TEXT,
    geojson     TEXT NOT NULL  -- 完整 GeoJSON Feature 字符串，用于前端渲染
);

-- 索引（加速按区域+颗粒度查询）
CREATE INDEX idx_region_gran ON region_stats (region_id, granularity, year, month);
```

### 执行参数设计

```bash
python scripts/netcdf_to_sqlite.py \
  --nc-dir-annual /data/netcdf/annual \
  --nc-dir-monthly /data/netcdf/monthly \
  --shape-dir data/shapes \            # 仓库内 GeoJSON 文件目录（GCJ-02）
  --db-path /data/static/db/stats.db \
  --vars precipitation temperature \  # 不指定则处理全部 var
  --workers 4
```

### 性能估算

- 单区域单时间步单变量：< 0.05s
- 总记录数：约 16 万行
- 预计总耗时：< 60 分钟（4进程并行，含 IO）
- 数据库文件体积：< 20MB

---

## var 元数据定义

var 的名称、单位、描述、色卡参数，通过独立配置文件管理，供前后端共用：

```
/static/meta/vars.json
```

格式：
```json
{
  "precipitation": {
    "label": "年降水量",
    "unit": "mm",
    "description": "区域年累计降水量",
    "colorScale": [
      { "value": 0,   "color": "#f7fbff" },
      { "value": 200, "color": "#6baed6" },
      { "value": 800, "color": "#08306b" }
    ],
    "valueMin": 0,
    "valueMax": 2000
  }
}
```

> 此文件由开发者手动维护，不由脚本自动生成。前端从此文件读取色卡配置，后端 `/api/v1/meta/vars` 接口返回此文件内容。

---

## 预生成执行顺序

```
1. shape 文件已就绪（data/shapes/，GCJ-02，高德来源）；若甲方另行提供，确认坐标系后转换为 GCJ-02 放入同目录
2. 手动编写 /static/meta/vars.json（色卡配置）
3. 执行 netcdf_to_sqlite.py（生成区域统计数据库）
4. 执行 netcdf_to_json.py（生成格点 JSON 切片）
5. 将同事提供的 .docx 报告文件按命名规则放入 /static/reports/
6. 检查文件完整性（脚本提供 --verify 模式）
```

---

## 文件完整性校验

两个脚本均支持 `--verify` 模式，不执行生成，只检查输出文件是否完整：

```bash
python scripts/netcdf_to_json.py --verify --out-dir /data/static/grid
# 输出：缺失文件列表，或 "All N files present. ✓"

python scripts/netcdf_to_sqlite.py --verify --db-path /data/static/db/stats.db
# 输出：各区域各颗粒度记录数统计
```
