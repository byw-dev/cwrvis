# 后端 API 设计 — cwrvis

> 文档版本：v1.0  
> 对应模块：`backend/`

---

## 概述

后端使用 FastAPI 实现，职责极简：

1. 提供区域统计数据查询接口（读取 SQLite）
2. 提供报告文件下载接口（按命名规则定位预生成 docx）
3. 提供元数据接口（var 列表、区域列表）

格点 JSON 文件由 Nginx 直接托管，后端不参与。

---

## 项目结构

```
backend/
├── main.py              # FastAPI 应用入口，挂载路由
├── config.py            # 配置（读取环境变量）
├── database.py          # SQLite 连接管理
├── routers/
│   ├── stats.py         # /api/v1/stats
│   ├── report.py        # /api/v1/report
│   └── meta.py          # /api/v1/meta
├── schemas.py           # Pydantic 响应模型
└── requirements.txt
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

查询指定区域在指定时间范围内的统计数据。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `region_id` | string | ✅ | 区域标识符，对应 regions 表 |
| `granularity` | string | ✅ | `year` 或 `month` |
| `year_start` | int | ✅ | 起始年份，范围 2000–2024 |
| `year_end` | int | ✅ | 结束年份，≥ year_start |
| `var` | string | ✅ | var 名称，可重复传入多个 |

**响应示例**（granularity=year）：
```json
{
  "ok": true,
  "data": {
    "region_id": "region_a",
    "granularity": "year",
    "vars": {
      "precipitation": [
        { "year": 2000, "month": null, "value": 523.4 },
        { "year": 2001, "month": null, "value": 489.1 },
        ...
      ],
      "temperature": [
        { "year": 2000, "month": null, "value": 12.3 },
        ...
      ]
    }
  }
}
```

**响应示例**（granularity=month）：
```json
{
  "ok": true,
  "data": {
    "region_id": "region_a",
    "granularity": "month",
    "vars": {
      "precipitation": [
        { "year": 2020, "month": 1, "value": 23.1 },
        { "year": 2020, "month": 2, "value": 18.4 },
        ...
      ]
    }
  }
}
```

**SQL 实现（核心逻辑）**：
```sql
SELECT year, month, var, value
FROM region_stats
WHERE region_id = ?
  AND granularity = ?
  AND year BETWEEN ? AND ?
  AND var IN (?, ?, ...)
ORDER BY year, month, var;
```

**参数校验**：
- `granularity` 必须为 `year` 或 `month`
- `year_start` 和 `year_end` 在 [2000, 2024] 范围内
- `year_end >= year_start`
- `var` 列表不得为空，且每个值必须在已知 var 列表中
- `region_id` 必须存在于 regions 表

---

### GET `/api/v1/report/download`

下载预生成的报告文件。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `region_id` | string | ✅ | 区域标识符 |
| `granularity` | string | ✅ | `year` 或 `month` |
| `start` | string | ✅ | 年颗粒度传年份字符串如 `2000`；月颗粒度传 `2000_01` |
| `end` | string | ✅ | 同上 |

**文件命名规则**：
```python
filename = f"{region_id}_{granularity}_{start}_{end}.docx"
filepath = REPORT_DIR / filename
# 示例：region_a_year_2000_2024.docx
#        region_b_month_2020_01_2023_12.docx
```

**处理逻辑**：
1. 拼接文件路径
2. 检查文件是否存在，否则返回 404
3. 返回文件流，设置正确的 Content-Disposition 头

**响应**：
- 成功：`200 OK`，`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- 文件不存在：`404`，JSON 错误体

---

### GET `/api/v1/meta/vars`

返回所有 data_var 的元数据。

**响应**：
```json
{
  "ok": true,
  "data": {
    "precipitation": {
      "label": "年降水量",
      "unit": "mm",
      "description": "区域年累计降水量",
      "colorScale": [...],
      "valueMin": 0,
      "valueMax": 2000
    },
    ...
  }
}
```

实现：直接读取 `/static/meta/vars.json` 文件内容并返回。

---

### GET `/api/v1/meta/regions`

返回所有预设区域的元数据，包含 GeoJSON 几何用于前端渲染。

**响应**：
```json
{
  "ok": true,
  "data": [
    {
      "region_id": "region_a",
      "name": "华北地区",
      "name_en": "North China",
      "geojson": {
        "type": "Feature",
        "geometry": { ... },
        "properties": { "region_id": "region_a", "name": "华北地区" }
      }
    },
    ...
  ]
}
```

实现：查询 SQLite `regions` 表，解析 geojson 字段返回。

---

## 配置管理

`backend/config.py`：
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    db_path: str = "/data/static/db/stats.db"
    static_root: str = "/data/static"
    report_dir: str = "/data/static/reports"
    meta_vars_path: str = "/data/static/meta/vars.json"

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## 启动与进程管理

开发环境：
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

生产环境（systemd，见 `deploy/` 目录）：
```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
```

生产环境使用 2 个 worker 足够（后端几乎无 CPU 计算）。

---

## CORS 配置

开发阶段允许所有来源；生产部署后前后端同域（Nginx 反代），无需配置 CORS。

---

## requirements.txt

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
pydantic-settings>=2.0.0
python-multipart>=0.0.9
```

无需 SQLAlchemy、numpy、xarray 等重型依赖，运行时后端极轻量。
