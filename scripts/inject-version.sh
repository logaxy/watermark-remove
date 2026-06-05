#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 从 package.json 读取版本
VERSION=$(cat "$ROOT/package.json" | grep '"version"' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')

# 如果有 GIT_TAG 环境变量，优先使用
if [ -n "${GIT_TAG:-}" ]; then
  VERSION="${GIT_TAG#v}"
fi

echo "Injecting version: $VERSION"

# 创建版本信息文件
cat > "$ROOT/dist/version.json" << EOF
{
  "version": "$VERSION",
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gitCommit": "${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}",
  "gitBranch": "${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}"
}
EOF

echo "Version info written to dist/version.json"
