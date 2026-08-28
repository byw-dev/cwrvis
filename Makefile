# ==============================================================================
# cwrvis — 项目构建 Makefile
#
# 从项目根目录运行：make <target> [VAR=value ...]
#
# 首次 clone 后运行：make setup（初始化所有 Python / Node.js 环境）
#
# Python 环境（两套，互相独立）：
#   backend/.venv  ← cd backend && uv sync（FastAPI 运行时）
#   scripts/.venv  ← cd scripts && uv sync（数据预生成脚本）
# Node.js: 所有命令通过 pnpm 执行（corepack 管理版本，首次需 corepack enable）
# ==============================================================================

VERSION      ?= 0.1.0
NC_DIR       ?= data/nc
CSV_DIR      ?= data/csv
SHAPE_DIR    ?= data/shapes
COLORBAR_DIR ?= data/colorbars
METHOD       ?= area_weighted
NODE_VERSION := $(shell cat .nvmrc 2>/dev/null || echo lts/*)

# 从当前分支名自动推导变体（custom/xizang → xizang；其他分支 → 空）
_BRANCH  := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
_VARIANT := $(shell echo "$(_BRANCH)" | sed -n 's|^custom/||p')

# SVC_NAME：有变体时 cwrvis-{variant}，否则 cwrvis（master 默认）
SVC_NAME ?= $(if $(_VARIANT),cwrvis-$(_VARIANT),cwrvis)
PKG_NAME ?= $(SVC_NAME)
DIST_DIR := dist/$(PKG_NAME)-$(VERSION)

# 在非交互式 shell 中初始化 nvm 并切换到项目指定版本
NVM_INIT := . $${NVM_DIR:-$$HOME/.nvm}/nvm.sh && nvm use $(NODE_VERSION)

.PHONY: all setup data data-grid data-sqlite data-sqlite-csv data-reports colorbar-stats colorbars shapes frontend dev package package-offline _package-assemble clean help

# ---------------------------------------------------------------------------- #
# 默认目标                                                                       #
# ---------------------------------------------------------------------------- #

all: data shapes frontend  ## 生成全部离线数据 + 编译前端

# ---------------------------------------------------------------------------- #
# 初始化开发环境（首次 clone 后运行）                                             #
# ---------------------------------------------------------------------------- #

setup:  ## 初始化所有开发环境（首次 clone 后运行一次即可）
	@echo "==> [1/3] backend Python 环境（FastAPI 运行时）"
	cd backend && uv sync
	@echo "==> [2/3] scripts Python 环境（数据预生成脚本）"
	cd scripts && uv sync
	@echo "==> [3/3] frontend Node.js 环境"
	bash -c '$(NVM_INIT) && cd frontend && pnpm install'
	@echo "==> 完成。运行 'make dev' 启动开发服务器，'make data' 生成离线数据。"

# ---------------------------------------------------------------------------- #
# 数据生成                                                                       #
# ---------------------------------------------------------------------------- #

data: data-grid data-sqlite-csv shapes data-reports  ## 全部离线数据（grid + sqlite-csv + shapes + reports）

colorbar-stats: data-grid  ## static/grid/ → COLORBAR_DIR 下 4 个色卡量程统计 CSV
	uv run --project scripts python scripts/grid_colorbar_stats.py \
		--grid-dir static/grid \
		--out-dir $(COLORBAR_DIR)

colorbars:  ## 色卡量程 CSV → frontend/src/config/colorbars.ts（色卡预设量程）
	uv run --project scripts python scripts/generate_colorbars.py --csv-dir $(COLORBAR_DIR)
	@echo "==> 请将生成的 colorbars.ts 一并 commit 到 git"

data-reports:  ## 报告文档 → static/reports/（保留子目录，需先准备 data/docx/）
	@test -d data/docx || (echo "ERROR: data/docx/ 目录不存在，请先将甲方提供的报告文档放入该目录"; exit 1)
	mkdir -p static/reports
	rsync -a --include="*/" --include="*.docx" --exclude="*" data/docx/ static/reports/
	@echo "==> 报告文档已复制至 static/reports/"

data-grid:  ## netcdf → 格点 JSON（static/grid/）
	uv run --project scripts python scripts/netcdf_to_json.py \
		--nc-dir $(NC_DIR) \
		--out-dir static/grid

data-sqlite:  ## 路径 A：netcdf × shapes → 区域统计 SQLite（db/stats.db）；METHOD= 可覆盖算法
	uv run --project scripts python scripts/netcdf_to_sqlite.py \
		--nc-dir $(NC_DIR) \
		--shape-dir $(SHAPE_DIR) \
		--db-path db/stats.db \
		--method $(METHOD)

data-sqlite-csv:  ## 路径 B：预计算 CSV → 区域统计 SQLite（db/stats.db）；需要 data/csv/ 就绪
	uv run --project scripts python scripts/csv_to_sqlite.py \
		--csv-dir $(CSV_DIR) \
		--db-path db/stats.db

shapes:  ## data/shapes/ 中文名 → static/shapes/ region_id 命名
	mkdir -p static/shapes
	cp "$(SHAPE_DIR)/西藏自治区.geojson" static/shapes/xizang.geojson
	cp "$(SHAPE_DIR)/拉萨市.geojson"     static/shapes/lasa.geojson
	cp "$(SHAPE_DIR)/日喀则市.geojson"   static/shapes/rikaze.geojson
	cp "$(SHAPE_DIR)/山南市.geojson"     static/shapes/shannan.geojson
	cp "$(SHAPE_DIR)/林芝市.geojson"     static/shapes/linzhi.geojson
	cp "$(SHAPE_DIR)/昌都市.geojson"     static/shapes/changdu.geojson
	cp "$(SHAPE_DIR)/那曲市.geojson"     static/shapes/naqu.geojson
	cp "$(SHAPE_DIR)/阿里地区.geojson"   static/shapes/ali.geojson

# ---------------------------------------------------------------------------- #
# 前端                                                                           #
# ---------------------------------------------------------------------------- #

frontend:  ## 编译前端，产物输出至 static/web/
	bash -c '$(NVM_INIT) && cd frontend && pnpm install && pnpm build'

# ---------------------------------------------------------------------------- #
# 本地开发                                                                       #
# ---------------------------------------------------------------------------- #

dev:  ## 同时启动 FastAPI(:8000) 和 Vite(:5173)，Ctrl+C 一并退出
	@VERSION=$(VERSION) bash scripts/gen_build_info.sh
	@echo "Starting backend :8000 + frontend :5173  (Ctrl+C to stop both)"
	@trap 'kill %1 %2 2>/dev/null; exit 0' INT TERM; \
	 (cd backend && uv run uvicorn main:app --reload --port 8000) & \
	 (bash -c '$(NVM_INIT) && cd frontend && pnpm dev') & \
	 wait

# ---------------------------------------------------------------------------- #
# 打包                                                                           #
# ---------------------------------------------------------------------------- #

# 公共组装步骤（在线版和离线版共用）
_package-assemble:
	@echo "==> Assembling $(DIST_DIR)  (version=$(VERSION))"
	rm -rf $(DIST_DIR)
	mkdir -p $(DIST_DIR)/bin $(DIST_DIR)/logs $(DIST_DIR)/conf $(DIST_DIR)/deploy/systemd

	# 生成版本信息（写入 backend/build_info.json，rsync 时一并打入包）
	VERSION=$(VERSION) bash scripts/gen_build_info.sh

	# 后端源码 → app/（排除 .venv、__pycache__）
	rsync -a \
		--exclude='.venv' \
		--exclude='__pycache__' \
		--exclude='*.pyc' \
		--exclude='*.pyo' \
		backend/ $(DIST_DIR)/app/

	# 导出锁定依赖清单（带 hash，完整性校验）
	(cd backend && uv export --frozen --no-dev --format requirements-txt) \
		> $(DIST_DIR)/app/requirements.txt

	# 生成的静态资产 → static/（images/ reports/ 由外部管理，不打入包）
	rsync -a --exclude='images/' --exclude='reports/' static/ $(DIST_DIR)/static/

	# 数据库 → db/
	mkdir -p $(DIST_DIR)/db
	cp db/stats.db $(DIST_DIR)/db/stats.db

	# 配置模板 → conf/（install.sh 安装时处理首次/升级逻辑）
	cp conf/config.env.example $(DIST_DIR)/conf/

	# 运行脚本 → bin/（stop.sh 渲染服务名；start.sh 无需修改）
	cp bin/start.sh $(DIST_DIR)/bin/start.sh
	sed 's/cwrvis/$(SVC_NAME)/g' bin/stop.sh > $(DIST_DIR)/bin/stop.sh
	chmod +x $(DIST_DIR)/bin/start.sh $(DIST_DIR)/bin/stop.sh

	# 部署脚本（渲染 SVC_NAME 常量）→ 包根
	sed 's/^SVC_NAME="cwrvis"/SVC_NAME="$(SVC_NAME)"/' \
		deploy/install.sh > $(DIST_DIR)/install.sh
	chmod +x $(DIST_DIR)/install.sh

	# systemd service（渲染路径和描述，以 SVC_NAME 命名）→ deploy/systemd/
	sed 's|/opt/cwrvis|/opt/$(SVC_NAME)|g; s|Description=cwrvis |Description=$(SVC_NAME) |g' \
		deploy/systemd/cwrvis.service > $(DIST_DIR)/deploy/systemd/$(SVC_NAME).service

package: _package-assemble  ## 在线版分发包 → dist/PKG_NAME-VERSION.tar.gz（目标机须有 uv）
	mkdir -p dist
	cd dist && COPYFILE_DISABLE=1 tar -czf $(PKG_NAME)-$(VERSION).tar.gz $(PKG_NAME)-$(VERSION)/
	rm -rf $(DIST_DIR)
	@echo "==> dist/$(PKG_NAME)-$(VERSION).tar.gz  ready"

package-offline: _package-assemble  ## 离线版分发包 → dist/cwrvis-VERSION-offline.tar.gz（目标机须有 python3.11）
	set -e; \
	req_tmp=$$(mktemp 2>/dev/null || mktemp -t cwrvis-req.XXXXXX); \
	pip_tmp=$$(mktemp -d 2>/dev/null || mktemp -d -t cwrvis-pip.XXXXXX); \
	trap "rm -rf $$req_tmp $$pip_tmp" EXIT; \
	(cd backend && uv export --frozen --no-dev --format requirements-txt --no-hashes) > $$req_tmp; \
	uv venv $$pip_tmp --seed --clear -q; \
	$$pip_tmp/bin/pip install --upgrade pip --quiet; \
	$$pip_tmp/bin/pip download \
		--quiet \
		--python-version 3.11 \
		--platform manylinux_2_17_x86_64 \
		--platform manylinux_2_28_x86_64 \
		--only-binary :all: \
		--dest $(DIST_DIR)/app/wheels/ \
		-r $$req_tmp; \
	mkdir -p dist; \
	cd dist && COPYFILE_DISABLE=1 tar -czf $(PKG_NAME)-$(VERSION)-offline.tar.gz $(PKG_NAME)-$(VERSION)/
	rm -rf $(DIST_DIR)
	@echo "==> dist/$(PKG_NAME)-$(VERSION)-offline.tar.gz  ready"

# ---------------------------------------------------------------------------- #
# 清理                                                                           #
# ---------------------------------------------------------------------------- #

clean:  ## 删除全部生成文件（static/grid shapes web，db/，dist/）
	rm -rf static/grid static/shapes static/web static/reports
	rm -rf db
	rm -rf dist

# ---------------------------------------------------------------------------- #
# 帮助                                                                           #
# ---------------------------------------------------------------------------- #

help:  ## 显示此帮助
	@echo ""
	@echo "Usage: make <target> [VAR=value ...]"
	@echo ""
	@echo "Setup (run once after git clone):"
	@echo "  make setup                   初始化所有开发环境（backend + scripts + frontend）"
	@echo ""
	@echo "Data generation:"
	@echo "  make data                    全部离线数据（grid + sqlite-csv + shapes + reports）"
	@echo "  make data-grid               格点 JSON           →  static/grid/"
	@echo "  make data-sqlite-csv         路径 B: CSV 导入    →  db/stats.db（默认）"
	@echo "  make data-sqlite             路径 A: netcdf 聚合 →  db/stats.db"
	@echo "  make data-sqlite METHOD=point_in_boundary"
	@echo "  make colorbar-stats          格点统计 →  $(COLORBAR_DIR)/*.csv"
	@echo "  make colorbars               CSV 量程 → frontend/src/config/colorbars.ts"
	@echo "  make data-reports            报告文档复制     →  static/reports/"
	@echo "  make shapes                  GeoJSON 重命名   →  static/shapes/"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend                编译前端         →  static/web/"
	@echo ""
	@echo "Development:"
	@echo "  make dev                     FastAPI:8000 + Vite:5173（Ctrl+C 同时停止）"
	@echo ""
	@echo "Distribution:"
	@echo "  make package                 在线版（分支名自动推导变体）"
	@echo "    master 分支    → dist/cwrvis-VERSION.tar.gz"
	@echo "    custom/foo 分支 → dist/cwrvis-foo-VERSION.tar.gz"
	@echo "  make package VERSION=1.1.0"
	@echo "  make package-offline VERSION=1.1.0"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean                   删除全部生成文件"
	@echo ""
