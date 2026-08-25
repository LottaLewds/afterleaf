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

# Guard against the wrong browser answering the endpoint. Under WSL mirrored
# networking a browser listening inside WSL on the DevTools/bridge ports can
# intercept connections meant for Windows Chrome. A headless renderer uses a
# software rasterizer, so any timing it reports is meaningless.
endpoint_browser="$(curl --fail --silent --max-time 2 "$AFTERLEAF_CDP_ENDPOINT/json/version" | sed -n 's/.*"Browser": *"\([^"]*\)".*/\1/p' || true)"
if [[ "$endpoint_browser" == *Headless* ]]; then
  case "$(basename -- "${1:-}")" in
    profile-renderer.ts)
      if [[ "${AFTERLEAF_ALLOW_HEADLESS:-0}" != "1" ]]; then
        echo "Refusing to profile against a headless browser ($endpoint_browser)." >&2
        echo "Headless renders on a software rasterizer; frame timings are not representative." >&2
        echo "Run 'bun run chrome:profile:wsl' first, or set AFTERLEAF_ALLOW_HEADLESS=1 to override." >&2
        exit 1
      fi ;;
    *)
      echo "WARNING: headless browser in use ($endpoint_browser); timing results are not representative." >&2 ;;
  esac
fi

exec "$@"
