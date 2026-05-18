# 后端 API 设计 — cwrvis

> 文档版本：v1.2  
> 对应模块：`backend/`

---

## 概述

后端使用 FastAPI 实现，职责极简：

1. 提供区域统计数据查询接口（读取 SQLite）
2. 提供报告文件下载接口（按命名规则定位预生成 docx）
3. 提供元数据接口（区域列表）
4. 通过 `StaticFiles` 挂载托管格点 JSON、前端页面等静态资产

格点 JSON（`/grid/**`）、区域 GeoJSON（`/shapes/**`）、前端页面（`/`）均由 FastAPI `StaticFiles` 直接服务，不经过应用逻辑。`db/stats.db` 不挂载为静态路由，仅在代码内部访问。

---

## 项目结构

```
backend/
├── main.py              # FastAPI 应用入口，挂载路由与 StaticFiles（含 /shapes/）
├── config.py            # 配置（读取环境变量）+ REGION_MAP 定义
├── database.py          # SQLite 连接管理
├── routers/
│   ├── stats.py         # /api/v1/stats
│   ├── report.py        # /api/v1/report/download
│   └── meta.py          # /api/v1/meta/regions（硬编码区域列表）
├── schemas.py           # Pydantic 响应模型
└── pyproject.toml       # 依赖声明（uv 管理）
```

---

## 通用约定

**Base URL**：`/api/v1`

**统一响应结构**：

成功：
```json
{
  "ok": true,
  "data": { ... }
}
```

失败：
```json
{
  "ok": false,
  "error": "描述性错误信息"
}
```

**HTTP 状态码**：
- 200：正常
- 400：请求参数错误
- 404：资源不存在（区域、报告文件等）
- 500：服务端错误

---

## 接口详细设计

### GET `/api/v1/stats`

查询指定区域在指定时间范围内的统计数据。接口返回全部 15 个 var，无需传 var 过滤参数。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `region_id` | string | ✅ | 区域标识符 |
| `granularity` | string | ✅ | `year` / `month` / `mean_all` / `mean_month` / `mean_season` |
| `year_start` | int | ✅ | 起始年份，范围 2000–2025 |
| `year_end` | int | ✅ | 结束年份，≥ year_start；对三种 mean 粒度定义均值计算窗口 |

**响应结构**：`data` 为数组，每个元素为一个时间点的全部 var 数值；时间维度字段随 granularity 变化：

| granularity | 时间字段 | 帧数 |
|------------|---------|------|
| `year` | `year` | 26（或指定范围） |
| `month` | `year`, `month` | 312（或指定范围） |
| `mean_all` | ——（单行） | 1 |
| `mean_month` | `month`（1–12） | 12 |
| `mean_season` | `season`（`spring`/`summer`/`autumn`/`winter`） | 4 |

**响应示例**（granularity=year）：
```json
{
  "ok": true,
  "data": {
    "region_id": "xizang",
    "granularity": "year",
    "rows": [
      { "year": 2000, "SP": 1234.5, "CWR": 523.4, "aveMv": 88.1, "CEv": 45.2, ... },
      { "year": 2001, "SP": 1189.2, "CWR": 489.1, ... },
      ...
    ]
  }
}
```

**响应示例**（granularity=mean_season）：
```json
{
  "ok": true,
  "data": {
    "region_id": "xizang",
    "granularity": "mean_season",
    "rows": [
      { "season": "spring", "SP": 320.1, "CWR": 140.2, ... },
      { "season": "summer", "SP": 580.3, "CWR": 250.7, ... },
      { "season": "autumn", "SP": 290.4, "CWR": 120.5, ... },
      { "season": "winter", "SP":  80.1, "CWR":  35.2, ... }
    ]
  }
}
```

**SQL 实现（核心逻辑，见 `data-pipeline.md` 完整 SQL 示例）**：

- `year` / `month`：`SELECT year, month, SP, CWR, ... WHERE region_id=? AND granularity=? AND year BETWEEN ? AND ?`
- `mean_all`：`SELECT AVG(SP), AVG(CWR), ... WHERE granularity='year' AND year BETWEEN ? AND ?`
- `mean_month`：`AVG(...) GROUP BY month`，源数据 `granularity='month'`
- `mean_season`：**两步聚合**，见下方说明

**`mean_season` 两步聚合设计**

物理语义：先得到每年每季节的统计值，再跨年取均值。直接对月度数据 `AVG+GROUP BY season` 会使 kg 类变量数值偏低（约为季度总量的 1/3）。

```
第一步（CTE season_per_year）：
  对 region_stats（granularity='month'）按 (region_id, year, season) 分组
  ├── kg 列（SP/CWR/aveMv 等）：SUM()  → 该年该季度总量
  └── 非 kg 列（CEv/PEh/RCv/RCh）：AVG()  → 该年该季度均值

第二步（外层 SELECT）：
  对 CTE 结果按 season 分组，所有列做 AVG()  → 多年季节均值
```

季节定义（自然年，不跨历年）：

| 季节 | month |
|------|-------|
| spring | 3, 4, 5 |
| summer | 6, 7, 8 |
| autumn | 9, 10, 11 |
| winter | 1, 2, 12（同一自然年内） |

最后一年若冬季月份不完整（如缺 12 月），接受该不完整结果参与均值计算。

`KG_VARS` 列表定义在 `backend/config.py`，与 `scripts/netcdf_to_sqlite.py` 保持一致。

**参数校验**：
- `granularity` 必须为 5 个合法值之一
- `year_start` 和 `year_end` 在 [2000, 2025] 范围内，且 `year_end >= year_start`
- `region_id` 必须在 `REGION_IDS`（见 config.py）中

---

### GET `/api/v1/report/meta`

返回报告目录元数据：每个区域有哪些年份的报告实际存在于 `static/reports/`。
供前端导出模块初始化时调用，驱动区域和年份选项的渲染。

**实现说明**：
- 后端启动时扫描一次 `REPORT_DIR` 目录，结果缓存在模块级变量，运行期不重扫
- 只返回文件实际存在的条目，防止前端展示有名无实的选项

**响应**：
```json
{
  "ok": true,
  "data": {
    "xizang": { "name": "西藏自治区", "level": "province",   "years": [2000, 2001, "...", 2025], "has_multi": true },
    "lasa":   { "name": "拉萨市",     "level": "prefecture", "years": [2000, "...", 2025],        "has_multi": true }
  }
}
```
`years` 为整数列表，`has_multi` 表示是否存在多年汇总报告。

---

### GET `/api/v1/report/download`

下载预生成的报告文件。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `region_id` | string | ✅ | 区域标识符，必须在 `VALID_REGION_IDS` 白名单中 |
| `year` | string | ✅ | 四位年份字符串（`"2000"`～`"2025"`）或 `"multi"` |

**文件命名规则**（后端确定性拼接，不依赖用户输入直接构造路径）：
```python
# year 为四位数字
filename = f"{year}-Year_Evaluation_Report-{region_id}.docx"
# year 为 "multi"
filename = f"Multi-Year_Evaluation_Report-{region_id}.docx"

filepath = Path(REPORT_DIR) / region_id / filename
```

**安全控制**：
1. `region_id` 通过枚举白名单（`VALID_REGION_IDS`）校验，拒绝任何不在列表中的值
2. `year` 仅允许 `"multi"` 或匹配 `^\d{4}$` 的字符串，拒绝含路径分隔符的输入
3. 路径由已校验的两个分量拼接，无用户可控的自由字符串参与路径构造
4. 最终对 `resolved(filepath)` 做前缀断言：必须以 `resolved(REPORT_DIR)` 开头（纵深防御）

**处理逻辑**：
1. 校验 `region_id` 和 `year` 参数
2. 确定性拼接文件路径
3. 路径前缀断言
4. 检查文件存在，否则返回 404
5. `FileResponse` 返回，设置 `Content-Disposition: attachment`

**响应**：
- 成功：`200 OK`，`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- 参数非法：`400`，JSON 错误体
- 文件不存在：`404`，JSON 错误体

---

### GET `/api/v1/meta/regions`

返回所有预设区域的元数据列表（不含 GeoJSON 几何体；几何数据通过 `/shapes/**` 静态路径单独加载）。

**响应**：
```json
{
  "ok": true,
  "data": [
    { "region_id": "xizang",  "name": "西藏自治区", "level": "province",   "area_m2": 1.23e12 },
    { "region_id": "lasa",    "name": "拉萨市",     "level": "prefecture", "area_m2": 2.95e10 },
    { "region_id": "rikaze",  "name": "日喀则市",   "level": "prefecture", "area_m2": 1.82e11 },
    { "region_id": "shannan", "name": "山南市",     "level": "prefecture", "area_m2": 7.99e10 },
    { "region_id": "linzhi",  "name": "林芝市",     "level": "prefecture", "area_m2": 1.14e11 },
    { "region_id": "changdu", "name": "昌都市",     "level": "prefecture", "area_m2": 1.09e11 },
    { "region_id": "naqu",    "name": "那曲市",     "level": "prefecture", "area_m2": 3.52e11 },
    { "region_id": "ali",     "name": "阿里地区",   "level": "prefecture", "area_m2": 3.45e11 }
  ]
}
```

实现：以 `config.py` 中硬编码的 `REGION_IDS` 列表为基础，JOIN `stats.db` 的 `region_areas` 表追加 `area_m2` 字段。若 `region_areas` 中无该区域的记录（如 stats.db 尚未生成），`area_m2` 返回 `null`，前端应禁用 kg→mm 换算。响应中的面积数值仅为示例，实际值由离线脚本计算。

### 区域 GeoJSON 静态文件

区域几何数据以静态文件形式提供，由 FastAPI `StaticFiles` 挂载在 `/shapes/` 路径：

```
/shapes/xizang.geojson   → data/shapes/西藏自治区.geojson（部署时按 region_id 重命名）
/shapes/lasa.geojson     → data/shapes/拉萨市.geojson
...（其余地市同理）
```

**region_id 到文件名的映射**（定义在 `backend/config.py`）：

```python
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
```

部署时，`bin/start.sh` 或预处理步骤将 `data/shapes/` 中的 GeoJSON 文件按 region_id 重命名后复制到 `static/shapes/`。开发环境可通过软链或 Vite proxy 访问。

---

## 配置管理

`backend/config.py`：
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    db_path: str = "../db/stats.db"
    static_root: str = "../static"
    report_dir: str = "../static/reports"
    grid_dir: str = "../static/grid"
    port: int = 8000

    class Config:
        env_file = "../conf/config.env"

settings = Settings()
```

---

## 启动与进程管理

开发环境：
```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

生产环境通过分发包的 `bin/start.sh` 启动（见 `deployment.md`），内部使用：
```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

2 个 worker 足够（后端几乎无 CPU 计算）。

---

## CORS 配置

开发阶段允许所有来源；生产部署后前后端同域（Nginx 反代），无需配置 CORS。

---

## 依赖（`backend/pyproject.toml`）

```toml
[project]
name = "cwrvis-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111.0",
    "uvicorn[standard]>=0.29.0",
    "pydantic-settings>=2.0.0",
    "python-multipart>=0.0.9",
]
```

无需 SQLAlchemy、numpy、xarray 等重型依赖，运行时后端极轻量。
