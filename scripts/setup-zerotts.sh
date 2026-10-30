#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${ZEROTTS_BOOTSTRAP_PYTHON:-}" ]]; then
  runtime_python="$ZEROTTS_BOOTSTRAP_PYTHON"
elif [[ -x /opt/homebrew/bin/python3.12 ]]; then
  runtime_python=/opt/homebrew/bin/python3.12
else
  runtime_python=python3
fi
if [[ ! -x .zerotts-venv/bin/python ]]; then
  "$runtime_python" -m venv .zerotts-venv
fi
.zerotts-venv/bin/python -m pip install 'zerotts==0.1.5'
.zerotts-venv/bin/python scripts/zerotts_worker.py --prepare
