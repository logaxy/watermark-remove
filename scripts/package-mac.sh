#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 安装 Node 依赖"
npm install

echo "==> 构建前端与主进程"
npm run build

echo "==> 注入版本信息"
bash scripts/inject-version.sh

echo "==> 下载 FFmpeg"
bash scripts/fetch-ffmpeg.sh

echo "==> 下载中文字体"
bash scripts/fetch-font.sh

echo "==> 构建 Python Worker (Universal)"
bash scripts/build-worker.sh

echo "==> 打包 macOS 应用"
npx electron-builder --mac --publish never

echo "==> 验证打包后的应用结构"
DMG_PATH=$(ls release/*.dmg 2>/dev/null | head -1)
if [ -n "$DMG_PATH" ]; then
  MOUNT_POINT="/tmp/watermark-verify-$RANDOM"
  mkdir -p "$MOUNT_POINT"
  hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

  APP_PATH=$(find "$MOUNT_POINT" -name "*.app" -maxdepth 2 | head -1)
  if [ -n "$APP_PATH" ]; then
    BIN_DIR="$APP_PATH/Contents/Resources/bin"
    echo "检查 bin 目录: $BIN_DIR"
    if [ -d "$BIN_DIR" ]; then
      ls -la "$BIN_DIR"
      echo "✓ 应用结构验证通过"
    else
      echo "✗ 警告: bin 目录不存在"
    fi
  fi

  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  rm -rf "$MOUNT_POINT"
fi

echo "==> 完成，产物位于 release/"
