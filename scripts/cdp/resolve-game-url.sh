#!/usr/bin/env bash

# Resolve the active Vite URL without requiring callers to know whether Vite
# fell back from its configured port.
afterleaf_resolve_game_url() {
  if [[ -n "${AFTERLEAF_GAME_URL:-}" ]]; then
    printf '%s\n' "$AFTERLEAF_GAME_URL"
    return
  fi

  local script_dir repository_root url_file discovered_origin
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  repository_root="$(cd -- "$script_dir/../.." && pwd)"
  url_file="$repository_root/.afterleaf-dev-url"

  if [[ -r "$url_file" ]]; then
    IFS= read -r discovered_origin <"$url_file" || true
    if [[ "$discovered_origin" =~ ^https?:// ]] &&
      curl --fail --silent --max-time 1 "$discovered_origin" >/dev/null 2>&1; then
      printf '%s/?profile=1\n' "${discovered_origin%/}"
      return
    fi
    printf 'Ignoring stale Afterleaf development URL in %s\n' "$url_file" >&2
  fi

  printf '%s\n' \
    'Unable to discover Afterleaf. Start the Vite server or set AFTERLEAF_GAME_URL.' >&2
  return 1
}
