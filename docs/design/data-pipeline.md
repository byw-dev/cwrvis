# 数据预生成流程设计 — cwrvis

> 文档版本：v1.1  
> 对应模块：`scripts/`

---

## 概述

所有原始数据来源于 netcdf 文件，通过离线脚本一次性预生成为系统运行时所需的静态文件。预生成完成后，运行时不再依赖原始 netcdf 文件。

---

## 输入数据规格

### netcdf 文件结构（实测）

年颗粒度文件（共 26 个，2000–2025 年，当前样例为其中 16 个）：
```
文件名示例：ResultGrid_Y_2000-01-01-00_2001-01-01-00.nc
维度：latitude × longitude
变量：16 个 data_var（SP, aveMv, aveMh, INv, OTv, INh, OTh, MC, GMh, GMv, CWR, CEv, PEh, RCv, RCh, dxy）
```

月颗粒度文件：
```
文件名格式：待与数据同事确认
维度：同上
变量：同上
```

空间规格（样例数据为西藏区域裁剪，1 度网格）：
```
latitude 范围：25.5°N ~ 39.5°N，lat_size = 15
longitude 范围：75.5°E ~ 99.5°E，lon_size = 25
格点数：375 点/切片
坐标系：WGS-84
```

> **注意**：以上空间规格来自当前样例文件，完整数据集范围待确认。脚本须从实际 netcdf 文件动态读取 lat/lon 坐标数组，不得硬编码。

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

### 设计决策：按 var 整体打包

每个输出文件包含**一个 var 在一种颗粒度下的全部时间步数据**，而非每个时间步单独一个文件。

原因：
- 格点数据很小（375 点/切片），HTTP 请求的 RTT 远大于传输时间
- 打包后前端切换 var 时只需一次请求，即可获取完整时间轴，播放期间零网络等待
- 总文件数从 3000+ 降至约 32 个（16 var × 2 颗粒度），运维简单
- 年颗粒度每文件含 26 帧（2000–2025），月颗粒度每文件含 312 帧（26年×12月）

### 输出文件结构

```
/static/grid/
├── year/
│   ├── SP.json          # var SP，全部年份数据
│   ├── aveMv.json
│   └── {var_name}.json
└── month/
    ├── SP.json          # var SP，全部月份数据
    ├── aveMv.json
    └── {var_name}.json
```

### JSON 文件格式

年颗粒度（`/static/grid/year/{var}.json`）：

```json
{
  "var": "SP",
  "granularity": "year",
  "lat_min": 25.5,
  "lat_max": 39.5,
  "lon_min": 75.5,
  "lon_max": 99.5,
  "lat_size": 15,
  "lon_size": 25,
  "timeline": [2000, 2001, 2002, 2003],
  "frames": [
    [[12.3, 15.6, null], [...]],
    [[11.1, 14.2, null], [...]],
    ...
  ]
}
```

月颗粒度（`/static/grid/month/{var}.json`）：

```json
{
  "var": "SP",
  "granularity": "month",
  "lat_min": 25.5,
  "lat_max": 39.5,
  "lon_min": 75.5,
  "lon_max": 99.5,
  "lat_size": 15,
  "lon_size": 25,
  "timeline": [
    { "year": 2000, "month": 1 },
    { "year": 2000, "month": 2 },
    ...
  ],
  "frames": [
    [[12.3, 15.6, null], [...]],
    [[11.1, 14.2, null], [...]],
    ...
  ]
}
```

说明：
- `frames[i]` 对应 `timeline[i]`，前端通过下标直接索引，无需遍历查找
- `frames[i]` 为二维数组，行对应纬度（从北到南），列对应经度（从西到东）
- 缺测值（NaN）统一用 `null` 表示
- 坐标信息从实际 netcdf 文件读取，每个文件头部携带，前端渲染时使用

### 执行参数设计

```bash
python scripts/netcdf_to_json.py \
  --nc-dir-annual /data/netcdf/annual \
  --nc-dir-monthly /data/netcdf/monthly \
  --out-dir /data/static/grid \
  --vars SP aveMv CWR \   # 不指定则处理全部 var
  --workers 4             # 并行进程数
```

### 性能估算

- 单文件（一个 var，年颗粒度，16 时间步）处理时间：< 1s
- 总输出文件数：约 32 个（16 var × 2 颗粒度）
- 预计总耗时：< 5 分钟
- 输出总体积：约 10MB 原始，gzip 压缩后约 4MB

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
  --vars SP aveMv CWR \  # 不指定则处理全部 var
  --workers 4
```

### 性能估算

- 单区域单时间步单变量：< 0.05s
- 总记录数：约 2 万行（8 区域 × 208 时间步 × 16 var）
- 预计总耗时：< 10 分钟（4进程并行）
- 数据库文件体积：< 5MB

---

## var 元数据定义

var 的名称、单位、描述、色卡参数，通过独立配置文件管理，供前后端共用：

```
/static/meta/vars.json
```

格式：
```json
{
  "SP": {
    "label": "降水量",
    "unit": "mm",
    "description": "区域年/月累计降水量",
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
4. 执行 netcdf_to_json.py（生成格点 JSON 文件）
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
