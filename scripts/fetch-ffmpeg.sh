#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/resources/bin/mac"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

FFMPEG_URL="https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
FFPROBE_URL="https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"

download_and_extract() {
  local url="$1"
  local name="$2"
  local zip_path="$TMP_DIR/${name}.zip"

  echo "下载 ${name}..."
  curl -fL --retry 3 --retry-delay 2 -o "$zip_path" "$url"
  unzip -oq "$zip_path" -d "$TMP_DIR"
  install -m 755 "$TMP_DIR/$name" "$OUT_DIR/$name"
}

download_and_extract "$FFMPEG_URL" "ffmpeg"
download_and_extract "$FFPROBE_URL" "ffprobe"

echo "FFmpeg 已就绪: $OUT_DIR"
