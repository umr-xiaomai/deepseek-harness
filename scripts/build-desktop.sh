#!/usr/bin/env sh
# One-click desktop packaging entry point for macOS and Linux.
# Usage: ./scripts/build-desktop.sh [options]
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "[ERROR] Python 3 was not found on PATH. Install Python 3 and retry." >&2
  exit 1
fi

exec "$PYTHON" scripts/build-desktop.py "$@"
