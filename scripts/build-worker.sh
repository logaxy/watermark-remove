#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$ROOT/worker"
OUT_DIR="$ROOT/resources/bin/mac"
BUILD_DIR="$ROOT/build/worker"

mkdir -p "$OUT_DIR" "$BUILD_DIR"

setup_arch_venv() {
  local arch="$1"
  local arch_venv="$BUILD_DIR/venv-$arch"

  if [ ! -d "$arch_venv" ]; then
    echo "创建 $arch Python 虚拟环境..."
    if [ "$arch" = "x86_64" ]; then
      arch -x86_64 /usr/bin/python3 -m venv "$arch_venv"
    else
      python3 -m venv "$arch_venv"
    fi
  fi

  if [ "$arch" = "x86_64" ]; then
    arch -x86_64 "$arch_venv/bin/python" -m pip install --upgrade pip >/dev/null
    arch -x86_64 "$arch_venv/bin/python" -m pip install -r "$WORKER_DIR/requirements.txt" pyinstaller >/dev/null
  else
    "$arch_venv/bin/python" -m pip install --upgrade pip >/dev/null
    "$arch_venv/bin/python" -m pip install -r "$WORKER_DIR/requirements.txt" pyinstaller >/dev/null
  fi
}

build_arch() {
  local arch="$1"
  local arch_dir="$BUILD_DIR/$arch"
  local arch_venv="$BUILD_DIR/venv-$arch"

  setup_arch_venv "$arch"
  mkdir -p "$arch_dir"

  echo "构建 Python Worker ($arch)..."
  (
    cd "$WORKER_DIR"
    if [ "$arch" = "x86_64" ]; then
      arch -x86_64 "$arch_venv/bin/pyinstaller" \
        --noconfirm --clean \
        --distpath "$arch_dir/dist" \
        --workpath "$arch_dir/build" \
        worker.spec
    else
      "$arch_venv/bin/pyinstaller" \
        --noconfirm --clean \
        --distpath "$arch_dir/dist" \
        --workpath "$arch_dir/build" \
        worker.spec
    fi
  )
}

CURRENT_ARCH="$(uname -m)"
WORKER_BINS=()

if [ "$CURRENT_ARCH" = "arm64" ]; then
  build_arch arm64
  WORKER_BINS+=("$BUILD_DIR/arm64/dist/watermark-worker")
  if arch -x86_64 /usr/bin/true 2>/dev/null; then
    build_arch x86_64
    WORKER_BINS+=("$BUILD_DIR/x86_64/dist/watermark-worker")
  fi
elif [ "$CURRENT_ARCH" = "x86_64" ]; then
  build_arch x86_64
  WORKER_BINS+=("$BUILD_DIR/x86_64/dist/watermark-worker")
else
  build_arch "$CURRENT_ARCH"
  WORKER_BINS+=("$BUILD_DIR/$CURRENT_ARCH/dist/watermark-worker")
fi

if [ "${#WORKER_BINS[@]}" -gt 1 ]; then
  lipo -create "${WORKER_BINS[@]}" -output "$OUT_DIR/watermark-worker"
  echo "已生成 Universal Worker: $OUT_DIR/watermark-worker"
else
  cp "${WORKER_BINS[0]}" "$OUT_DIR/watermark-worker"
  echo "已生成 Worker: $OUT_DIR/watermark-worker"
fi

chmod +x "$OUT_DIR/watermark-worker"
echo "Worker 构建完成"
