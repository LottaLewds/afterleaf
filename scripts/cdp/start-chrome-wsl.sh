#!/usr/bin/env bash

set -euo pipefail

debug_port="${AFTERLEAF_CHROME_DEBUG_PORT:-9222}"
bridge_port="${AFTERLEAF_CHROME_BRIDGE_PORT:-9223}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/resolve-game-url.sh"
game_url="$(afterleaf_resolve_game_url)"
powershell_script="$(wslpath -w "$script_dir/start-chrome.ps1")"

if ! command -v powershell.exe >/dev/null; then
  echo "powershell.exe is unavailable; this launcher must run from WSL." >&2
  exit 1
fi

powershell.exe \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$powershell_script" \
  -DebugPort "$debug_port" \
  -BridgePort "$bridge_port" \
  -GameUrl "$game_url"

windows_host="$(ip route show default | awk '{print $3; exit}')"
if [[ -z "$windows_host" ]]; then
  echo "Chrome started, but the Windows host address could not be resolved." >&2
  exit 1
fi

cdp_endpoint="http://${windows_host}:${bridge_port}"
if ! curl --fail --silent --show-error --max-time 2 \
  "$cdp_endpoint/json/version" >/dev/null; then
  echo "Chrome started, but the WSL CDP bridge did not respond at $cdp_endpoint." >&2
  echo "See docs/CDP_PROFILING.md for the one-time Windows bridge setup." >&2
  exit 1
fi

printf 'Afterleaf CDP endpoint: %s\n' "$cdp_endpoint"
printf 'Use bun run cdp:profile:wsl or bun run cdp:console:wsl next.\n'
