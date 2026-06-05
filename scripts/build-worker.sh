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

rm -f "$OUT_DIR/watermark-worker" "$OUT_DIR/watermark-worker-arm64" "$OUT_DIR/watermark-worker-x64"

CURRENT_ARCH="$(uname -m)"

if [ "$CURRENT_ARCH" = "arm64" ]; then
  build_arch arm64
  cp "$BUILD_DIR/arm64/dist/watermark-worker" "$OUT_DIR/watermark-worker-arm64"
  echo "已生成 arm64 Worker: $OUT_DIR/watermark-worker-arm64"
  if arch -x86_64 /usr/bin/true 2>/dev/null; then
    build_arch x86_64
    cp "$BUILD_DIR/x86_64/dist/watermark-worker" "$OUT_DIR/watermark-worker-x64"
    echo "已生成 x64 Worker: $OUT_DIR/watermark-worker-x64"
  else
    echo "警告: 当前环境无法构建 x86_64 Worker，Intel Mac 将无法使用"
  fi
elif [ "$CURRENT_ARCH" = "x86_64" ]; then
  build_arch x86_64
  cp "$BUILD_DIR/x86_64/dist/watermark-worker" "$OUT_DIR/watermark-worker-x64"
  echo "已生成 x64 Worker: $OUT_DIR/watermark-worker-x64"
else
  build_arch "$CURRENT_ARCH"
  cp "$BUILD_DIR/$CURRENT_ARCH/dist/watermark-worker" "$OUT_DIR/watermark-worker-$CURRENT_ARCH"
fi

chmod +x "$OUT_DIR"/watermark-worker-* 2>/dev/null || true
echo "Worker 构建完成"
