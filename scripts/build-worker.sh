#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$ROOT/worker"
OUT_DIR="$ROOT/resources/bin/darwin"
BUILD_DIR="$ROOT/build/worker"

mkdir -p "$OUT_DIR" "$BUILD_DIR"

setup_arch_venv() {
  local arch="$1"
  local arch_venv="$BUILD_DIR/venv-$arch"

  if [ ! -d "$arch_venv" ]; then
    echo "创建 $arch Python 虚拟环境..."
    if [ "$arch" = "x86_64" ]; then
      # 尝试使用 Rosetta 创建 x86_64 环境
      if arch -x86_64 /usr/bin/true 2>/dev/null; then
        arch -x86_64 /usr/bin/python3 -m venv "$arch_venv"
      else
        echo "警告: 当前环境不支持 x86_64 构建，跳过"
        return 1
      fi
    else
      python3 -m venv "$arch_venv"
    fi
  fi

  if [ "$arch" = "x86_64" ]; then
    if arch -x86_64 /usr/bin/true 2>/dev/null; then
      arch -x86_64 "$arch_venv/bin/python" -m pip install --upgrade pip >/dev/null
      arch -x86_64 "$arch_venv/bin/python" -m pip install -r "$WORKER_DIR/requirements.txt" pyinstaller >/dev/null
    else
      return 1
    fi
  else
    "$arch_venv/bin/python" -m pip install --upgrade pip >/dev/null
    "$arch_venv/bin/python" -m pip install -r "$WORKER_DIR/requirements.txt" pyinstaller >/dev/null
  fi
}

build_arch() {
  local arch="$1"
  local arch_dir="$BUILD_DIR/$arch"
  local arch_venv="$BUILD_DIR/venv-$arch"

  if ! setup_arch_venv "$arch"; then
    echo "✗ 无法设置 $arch 构建环境，跳过"
    return 1
  fi

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

# 检测是否在 CI 环境
IS_CI="${CI:-false}"

# 在 CI 环境下，检测是否为 Apple Silicon Mac
# GitHub Actions 的 macos-latest 可能是 Apple Silicon，但 Rosetta 2 可能不可用或工作不正常
if [ "$IS_CI" = "true" ] && [ "$CURRENT_ARCH" = "arm64" ]; then
  echo "CI 环境检测到 Apple Silicon Mac"
  # 尝试检测 Rosetta 2 是否真正可用（不只是安装）
  if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
    echo "警告: CI 环境中 Rosetta 2 不可用，将只构建 arm64 架构"
    # 在 CI 环境下如果只构建一个架构，仍然继续，不标记为失败
    if build_arch arm64; then
      cp "$BUILD_DIR/arm64/dist/watermark-worker" "$OUT_DIR/watermark-worker-arm64"
      echo "✓ 已生成 arm64 Worker: $OUT_DIR/watermark-worker-arm64"
      chmod +x "$OUT_DIR"/watermark-worker-* 2>/dev/null || true
      echo ""
      echo "构建完成: 1 个架构成功 (x86_64 被跳过)"
      ls -la "$OUT_DIR"/watermark-worker-* 2>/dev/null || echo "未找到构建产物"
      exit 0
    else
      echo "✗ arm64 Worker 构建失败" >&2
      exit 1
    fi
  fi
fi

# 清理旧的构建
rm -f "$OUT_DIR/watermark-worker" "$OUT_DIR/watermark-worker-arm64" "$OUT_DIR/watermark-worker-x64"

CURRENT_ARCH="$(uname -m)"
BUILD_SUCCESS=0
BUILD_FAILED=0

# 优先构建当前架构
echo "当前架构: $CURRENT_ARCH"
if [ "$CURRENT_ARCH" = "arm64" ]; then
  if build_arch arm64; then
    cp "$BUILD_DIR/arm64/dist/watermark-worker" "$OUT_DIR/watermark-worker-arm64"
    echo "✓ 已生成 arm64 Worker: $OUT_DIR/watermark-worker-arm64"
    BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
  else
    echo "✗ arm64 Worker 构建失败" >&2
    BUILD_FAILED=$((BUILD_FAILED + 1))
  fi

  # 尝试构建 x86_64
  if arch -x86_64 /usr/bin/true 2>/dev/null; then
    if build_arch x86_64; then
      cp "$BUILD_DIR/x86_64/dist/watermark-worker" "$OUT_DIR/watermark-worker-x64"
      echo "✓ 已生成 x64 Worker: $OUT_DIR/watermark-worker-x64"
      BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
    else
      echo "✗ x86_64 Worker 构建失败" >&2
      BUILD_FAILED=$((BUILD_FAILED + 1))
    fi
  else
    echo "✗ 错误: Rosetta 2 不可用，无法构建 x86_64 Worker" >&2
    BUILD_FAILED=$((BUILD_FAILED + 1))
  fi

elif [ "$CURRENT_ARCH" = "x86_64" ]; then
  if build_arch x86_64; then
    cp "$BUILD_DIR/x86_64/dist/watermark-worker" "$OUT_DIR/watermark-worker-x64"
    echo "✓ 已生成 x64 Worker: $OUT_DIR/watermark-worker-x64"
    BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
  else
    echo "✗ x86_64 Worker 构建失败" >&2
    BUILD_FAILED=$((BUILD_FAILED + 1))
  fi

  # 在 Intel Mac 上通常无法构建 arm64
  echo "⚠ 提示: 在 Intel Mac 上无法构建 arm64 Worker"
else
  echo "未知架构: $CURRENT_ARCH"
  exit 1
fi

chmod +x "$OUT_DIR"/watermark-worker-* 2>/dev/null || true

echo ""
echo "构建完成: $BUILD_SUCCESS 个架构成功"
ls -la "$OUT_DIR"/watermark-worker-* 2>/dev/null || echo "未找到构建产物"

# CI 环境下，任何构建失败都退出
if [ "$IS_CI" = "true" ] && [ "$BUILD_FAILED" -gt 0 ]; then
  echo ""
  echo "✗ CI 环境检测到 $BUILD_FAILED 个架构构建失败，退出" >&2
  exit 1
fi
