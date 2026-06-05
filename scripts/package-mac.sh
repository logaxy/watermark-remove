#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 安装 Node 依赖"
npm install

echo "==> 构建前端与主进程"
npm run build

echo "==> 下载 FFmpeg"
bash scripts/fetch-ffmpeg.sh

echo "==> 下载中文字体"
bash scripts/fetch-font.sh

echo "==> 构建 Python Worker (Universal)"
bash scripts/build-worker.sh

echo "==> 打包 macOS 应用"
npx electron-builder --mac --publish never

echo "==> 完成，产物位于 release/"
