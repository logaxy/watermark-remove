#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# electron-builder 在 macOS 上 ${os} = darwin，脚本输出目录必须与此一致
OUT_DIR="$ROOT/resources/bin/darwin"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

# 使用 GitHub 官方发布版本，更可靠
FFMPEG_VERSION="6.1.1"

# 两种架构的下载地址
FFMPEG_ARM64_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffmpeg-darwin-arm64"
FFPROBE_ARM64_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffprobe-darwin-arm64"
FFMPEG_X64_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffmpeg-darwin-x64"
FFPROBE_X64_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b${FFMPEG_VERSION}/ffprobe-darwin-x64"

download_binary() {
  local url="$1"
  local name="$2"
  local arch_label="$3"
  local output_path="$OUT_DIR/$name"

  echo "下载 ${name} (${arch_label})..."
  echo "URL: ${url}"

  if curl -fL --retry 3 --retry-delay 2 -o "$output_path" "$url"; then
    chmod +x "$output_path"
    echo "✓ ${name} 下载成功"
  else
    echo "✗ ${name} 下载失败" >&2
    return 1
  fi
}

verify_binary() {
  local path="$1"
  local label="$2"
  if [ ! -f "$path" ]; then
    echo "错误: 二进制文件不存在: $path" >&2
    return 1
  fi
  if [ ! -x "$path" ]; then
    chmod +x "$path"
  fi
  # 只能运行验证当前架构的二进制，跨架构二进制仅检查文件存在
  local current_arch
  current_arch="$(uname -m)"
  if { [ "$current_arch" = "arm64" ] && [[ "$label" == *"arm64"* ]]; } || \
     { [ "$current_arch" = "x86_64" ] && [[ "$label" == *"x64"* ]]; }; then
    if ! "$path" -version >/dev/null 2>&1; then
      echo "错误: 二进制文件无法运行: $path" >&2
      return 1
    fi
    echo "  ✓ ${label} 运行验证通过"
  else
    echo "  → 跳过运行验证 (跨架构二进制: ${label}, 当前: ${current_arch})"
  fi
  return 0
}

CURRENT_ARCH="$(uname -m)"
echo "当前构建架构: ${CURRENT_ARCH}"
echo "目标输出目录: ${OUT_DIR}"
echo ""

# 下载 arm64 版本
echo "--- arm64 (Apple Silicon) ---"
download_binary "$FFMPEG_ARM64_URL" "ffmpeg-arm64" "arm64" || exit 1
download_binary "$FFPROBE_ARM64_URL" "ffprobe-arm64" "arm64" || exit 1

# 下载 x86_64 版本（Intel Mac 需要）
echo ""
echo "--- x86_64 (Intel Mac) ---"
download_binary "$FFMPEG_X64_URL" "ffmpeg-x64" "x86_64" || exit 1
download_binary "$FFPROBE_X64_URL" "ffprobe-x64" "x86_64" || exit 1

echo ""
echo "--- 验证二进制文件 ---"
verify_binary "$OUT_DIR/ffmpeg-arm64" "arm64"
verify_binary "$OUT_DIR/ffprobe-arm64" "arm64"
verify_binary "$OUT_DIR/ffmpeg-x64" "x86_64"
verify_binary "$OUT_DIR/ffprobe-x64" "x86_64"

echo ""
echo "✓ FFmpeg 已就绪: $OUT_DIR"
ls -la "$OUT_DIR"/ffmpeg-* "$OUT_DIR"/ffprobe-*
