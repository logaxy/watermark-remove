#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/resources/bin/mac"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

# 使用 GitHub 官方发布版本，更可靠
FFMPEG_VERSION="6.1.1"
ARCH="$(uname -m)"

if [ "$ARCH" = "arm64" ]; then
  # Apple Silicon
  FFMPEG_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffmpeg-darwin-arm64"
  FFPROBE_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffprobe-darwin-arm64"
else
  # Intel
  FFMPEG_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffmpeg-darwin-x64"
  FFPROBE_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffprobe-darwin-x64"
fi

download_binary() {
  local url="$1"
  local name="$2"
  local output_path="$OUT_DIR/$name"

  echo "下载 ${name} (${ARCH})..."
  echo "URL: ${url}"

  # 使用 -L 跟随重定向
  if curl -fL --retry 3 --retry-delay 2 -o "$output_path" "$url"; then
    chmod +x "$output_path"
    echo "✓ ${name} 下载成功"
  else
    echo "✗ ${name} 下载失败" >&2
    exit 1
  fi
}

# 验证二进制文件
verify_binary() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "错误: 二进制文件不存在: $path" >&2
    return 1
  fi
  if [ ! -x "$path" ]; then
    chmod +x "$path"
  fi
  # 测试运行
  if ! "$path" -version >/dev/null 2>&1; then
    echo "错误: 二进制文件无法运行: $path" >&2
    return 1
  fi
  return 0
}

download_binary "$FFMPEG_URL" "ffmpeg"
download_binary "$FFPROBE_URL" "ffprobe"

verify_binary "$OUT_DIR/ffmpeg"
verify_binary "$OUT_DIR/ffprobe"

echo "✓ FFmpeg 已就绪: $OUT_DIR"
echo "  - ffmpeg version: $($OUT_DIR/ffmpeg -version | head -1)"
