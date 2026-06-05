#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -d "$VENV" ]; then
  "$PYTHON_BIN" -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -r "$ROOT/worker/requirements.txt"

echo "Python worker 依赖已安装：$VENV/bin/python"
