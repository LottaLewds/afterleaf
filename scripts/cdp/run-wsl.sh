#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/cdp/run-wsl.sh <command> [args...]" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/resolve-game-url.sh"
export AFTERLEAF_GAME_URL="$(afterleaf_resolve_game_url)"

windows_host="$(ip route show default | awk '{print $3; exit}')"
if [[ -z "$windows_host" ]]; then
  echo "Unable to resolve the Windows host address from WSL." >&2
  exit 1
fi

export AFTERLEAF_CDP_ENDPOINT="${AFTERLEAF_CDP_ENDPOINT:-http://${windows_host}:${AFTERLEAF_CHROME_BRIDGE_PORT:-9223}}"
exec "$@"
