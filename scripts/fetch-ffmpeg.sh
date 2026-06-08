#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/resources/bin/darwin"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

# 使用 GitHub 官方发布版本，更可靠
FFMPEG_VERSION="6.1.1"

# 下载指定架构的二进制文件
download_binary() {
  local url="$1"
  local name="$2"
  local output_path="$OUT_DIR/$name"

  echo "下载 ${name}..."
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

# 下载 arm64 版本 (Apple Silicon)
echo "=== 下载 arm64 (Apple Silicon) 版本 ==="
download_binary "https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffmpeg-darwin-arm64" "ffmpeg-arm64"
download_binary "https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffprobe-darwin-arm64" "ffprobe-arm64"

# 下载 x64 版本 (Intel)
echo "=== 下载 x64 (Intel) 版本 ==="
download_binary "https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffmpeg-darwin-x64" "ffmpeg-x64"
download_binary "https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffprobe-darwin-x64" "ffprobe-x64"

# 验证所有下载的二进制文件
echo "=== 验证二进制文件 ==="
verify_binary "$OUT_DIR/ffmpeg-arm64"
verify_binary "$OUT_DIR/ffprobe-arm64"
verify_binary "$OUT_DIR/ffmpeg-x64"
verify_binary "$OUT_DIR/ffprobe-x64"

echo ""
echo "✓ FFmpeg 已就绪: $OUT_DIR"
echo "  架构信息:"
file "$OUT_DIR/ffmpeg-arm64"
file "$OUT_DIR/ffprobe-arm64"
file "$OUT_DIR/ffmpeg-x64"
file "$OUT_DIR/ffprobe-x64"
