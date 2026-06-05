#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/resources/fonts"
TARGET="$OUT_DIR/NotoSansSC-Regular.otf"
FONT_URLS=(
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
  "https://github.com/notofonts/noto-cjk/releases/download/Sans2.004/03_NotoSansCJKsc-Regular.otf"
)
SYSTEM_FONT_CANDIDATES=(
  "/System/Library/Fonts/PingFang.ttc"
  "/System/Library/Fonts/STHeiti Light.ttc"
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
)

mkdir -p "$OUT_DIR"

if [ -f "$TARGET" ]; then
  echo "字体已存在: $TARGET"
  exit 0
fi

echo "下载中文字体..."
for url in "${FONT_URLS[@]}"; do
  if curl -fL --retry 3 --retry-delay 2 -o "$TARGET" "$url"; then
    echo "字体已就绪: $TARGET"
    exit 0
  fi
done

for font in "${SYSTEM_FONT_CANDIDATES[@]}"; do
  if [ -f "$font" ]; then
    cp "$font" "$TARGET"
    echo "已复制系统字体: $font -> $TARGET"
    exit 0
  fi
done

echo "警告: 未能下载或复制中文字体，贴纸中文可能显示为默认字体"
exit 0
