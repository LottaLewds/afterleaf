# Afterleaf CDP profiling

These tools drive a dedicated Windows Chrome from WSL2 through the Chrome
DevTools Protocol (CDP). They profile the real Windows GPU/browser stack while
the development server and scripts remain under WSL.

CDP grants complete control over its browser profile. The launcher therefore
uses the isolated `%TEMP%\afterleaf-codex-profile` profile. Do not sign into
personal accounts in that Chrome window.

## Before profiling

Start the Afterleaf development server yourself. The profiling scripts
deliberately never start or restart it.

Afterleaf does not configure a development port, so Vite selects its normal
available port. After Vite starts, it publishes its actual origin to the ignored
`.afterleaf-dev-url` file. The WSL CDP wrappers read and validate that file
automatically, then add `?profile=1`. If no active server can be discovered, the
wrappers stop with an actionable error instead of guessing a port.
`AFTERLEAF_GAME_URL` always takes precedence.

The development-only `profile=1` argument disables the normal pointer-unlock
pause/menu behavior. The Chrome launcher also disables background timer,
renderer, and occluded-window throttling. Keep the dedicated window visible,
restored, and focused for representative frame timing; a minimized window can
still stop producing frames.

## One-time Windows bridge setup

Chrome exposes unauthenticated CDP only on Windows loopback. Open PowerShell as
Administrator and bridge port `9223` to Chrome's loopback port `9222`:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9223 connectaddress=127.0.0.1 connectport=9222

New-NetFirewallRule -DisplayName "Afterleaf Chrome CDP Bridge 9223" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9223 -Profile Any -RemoteAddress LocalSubnet
```

The firewall rule accepts only local-subnet clients. The bridge persists across
restarts. Inspect it with:

```powershell
netsh interface portproxy show v4tov4
Get-NetFirewallRule -DisplayName "Afterleaf Chrome CDP Bridge 9223"
Get-Service iphlpsvc
```

## Start or reuse the dedicated browser

From the repository root:

```bash
bun run chrome:profile:wsl
```

If the dedicated profile is already open, reuse it. Close that dedicated
window before invoking the launcher when an actual browser restart is needed.
Override the URL or ports when necessary:

```bash
AFTERLEAF_GAME_URL='http://localhost:42069/?profile=1' \
AFTERLEAF_CHROME_DEBUG_PORT=9222 \
AFTERLEAF_CHROME_BRIDGE_PORT=9223 \
bun run chrome:profile:wsl
```

## Navigate and reload

The navigation script selects the page using the same automatically discovered
host and port as the launcher:

```bash
bun run cdp:navigate:wsl
```

To navigate elsewhere while preserving profiling mode:

```bash
AFTERLEAF_CDP_NAVIGATE_URL='http://localhost:42069/?profile=1' \
bun run cdp:navigate:wsl
```

Set `AFTERLEAF_CDP_TARGET` if more than one relevant page target is open.

## Measure settled rendering

Aim at the workload, wait for its assets to settle, keep the Chrome window
focused, then run:

```bash
AFTERLEAF_CDP_WARMUP_MS=1200 \
AFTERLEAF_CDP_SAMPLE_MS=10000 \
bun run cdp:profile:wsl
```

The JSON result includes average FPS, P50/P95/P99 frame time, 1% low FPS,
render calls, triangles, renderer resource counts, shader errors, viewport,
device pixel ratio, focus, and visibility. Compare changes with the same saved
world, camera pose, window size, device pixel ratio, and sample duration.

At 240 Hz, a healthy uncapped frame interval is about `4.17 ms`. Focus
emulation keeps the page active for automation, but it does not make a hidden
or minimized window a valid performance baseline.

## Collect warnings and shader/runtime errors

Collect new console warnings and exceptions without reloading:

```bash
bun run cdp:console:wsl
```

Reload first when validating startup and shader compilation:

```bash
AFTERLEAF_CDP_CONSOLE_RELOAD=true \
AFTERLEAF_CDP_CONSOLE_MS=10000 \
bun run cdp:console:wsl
```

## Direct use and environment variables

The WSL wrapper resolves the current Windows gateway and exports
`AFTERLEAF_CDP_ENDPOINT`. It also exports the discovered `AFTERLEAF_GAME_URL` so
target selection and navigation continue using the same Vite port. The
TypeScript tools can also run directly against a local browser:

```bash
AFTERLEAF_GAME_URL='http://localhost:42069/?profile=1' \
AFTERLEAF_CDP_ENDPOINT=http://127.0.0.1:9222 \
bun scripts/cdp/profile-renderer.ts
```

Useful variables:

| Variable                        | Default                         | Purpose                           |
| ------------------------------- | ------------------------------- | --------------------------------- |
| `AFTERLEAF_GAME_URL`            | Active discovered Vite URL      | Game URL and profiling query      |
| `AFTERLEAF_CDP_ENDPOINT`        | `http://127.0.0.1:9222`         | Browser discovery endpoint        |
| `AFTERLEAF_CDP_TARGET`          | Host from the resolved game URL | Target URL substring              |
| `AFTERLEAF_CDP_NAVIGATE_URL`    | Resolved game URL               | Navigation destination            |
| `AFTERLEAF_CDP_WARMUP_MS`       | `1200`                          | Settling time before FPS sampling |
| `AFTERLEAF_CDP_SAMPLE_MS`       | `5000`                          | FPS sample duration               |
| `AFTERLEAF_CDP_CONSOLE_MS`      | `5000`                          | Console collection duration       |
| `AFTERLEAF_CDP_CONSOLE_RELOAD`  | `false`                         | Reload before console collection  |
| `AFTERLEAF_CDP_SCREENSHOT_PATH` | `/tmp/afterleaf-cdp.png`        | Optional screenshot output        |

Avoid screenshots during routine profiling. Renderer counters, console output,
and bounded traces are usually sufficient; use a visual capture only when the
appearance cannot be verified directly in the dedicated window. Capture the
current viewport without changing its dimensions with:

```bash
bun run cdp:screenshot:wsl
```
