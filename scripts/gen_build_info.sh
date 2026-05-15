#!/usr/bin/env bash
# 生成 build_info.json，写到 backend/build_info.json
# 由 Makefile 在 make dev / make package 之前调用
# 用法：VERSION=0.1.0 bash scripts/gen_build_info.sh

set -e

VERSION="${VERSION:-0.1.0}"
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_FULL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if git status --porcelain 2>/dev/null | grep -q .; then
    DIRTY=true
    VERSION_STR="${VERSION}-${COMMIT}-dev"
else
    DIRTY=false
    VERSION_STR="${VERSION}-${COMMIT}"
fi

OUT="backend/build_info.json"
cat > "$OUT" << JSON
{
  "version": "${VERSION_STR}",
  "version_base": "${VERSION}",
  "commit": "${COMMIT}",
  "commit_full": "${COMMIT_FULL}",
  "dirty": ${DIRTY},
  "branch": "${BRANCH}",
  "build_time": "${BUILD_TIME}"
}
JSON

echo "[build-info] ${VERSION_STR}  (${BUILD_TIME})" >&2
