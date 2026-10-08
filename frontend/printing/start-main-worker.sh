#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f data/main-worker.env ]; then
  set -a
  . data/main-worker.env
  set +a
fi
exec node printing/worker.mjs "$@"
