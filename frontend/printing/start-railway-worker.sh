#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
config=data/railway-worker.env
if [ ! -f "$config" ]; then
  echo "Missing $config. Copy data/railway-worker.env.example and set the Railway worker token." >&2
  exit 1
fi

set -a
. "./$config"
set +a
exec node printing/worker.mjs "$@"
