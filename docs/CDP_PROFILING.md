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

The development-only `profile=1` argument skips the adult-age gate so CDP runs
boot the shop unattended. The Chrome launcher also disables background timer,
renderer, and occluded-window throttling plus Windows native occlusion
tracking (`CalculateNativeWinOcclusion`), so the tab keeps rendering even when
other windows fully cover it.

Keep the dedicated window in its **normal** (not minimized) state while
profiling. A buried window renders at full display cadence; a _minimized_
window silently paces compositor frames near 75 fps regardless of the flags,
and a locked session or switched-off display floors pacing further (observed
near 60 fps). Frametime samples taken in those states are quantized by the
cadence floor and hide improvements below it, though large draw-call changes
still show as steps between floors; census counters stay fully valid.
Locking or covering the window cannot always be prevented, so profiling
scripts also run an automatic frame pump (see below).

## Unattended operation (buried window, locked session)

Profiling and console scripts register a tiny `Page.startScreencast` sink for
the duration of their run ("frame pump"). Registering as a compositor frame
consumer forces Chromium to keep producing real GPU-composited frames even
when no monitor displays them; captures are discarded after acknowledgment
(320x180 jpeg, every 30th frame), so the overhead next to the scene's own
submission cost is negligible and comparisons stay apples-to-apples.

Set `AFTERLEAF_CDP_FRAME_PUMP=off` on `cdp:profile:wsl` to opt out for purist
visible-window runs. The profiler reports `"framePumpActive"` in its JSON so
you can tell which mode produced a sample.

## Real Windows Chrome vs headless browsers

Frame-time, FPS, boot, and stutter numbers are only representative on the
real, GPU-composited Windows Chrome launched by `bun run chrome:profile:wsl`.
A headless Chromium (for example a Playwright instance inside WSL) renders
through a software rasterizer (SwiftShader/llvmpipe) with a different
compositor pipeline; its frametimes, shader-compile costs, and texture-upload
behavior bear no resemblance to the real stack. Use headless only for
non-timing work: console collection, navigation checks, scene census queries,
screenshots. The WSL wrapper refuses to run `profile-renderer.ts` against a
headless answerer (`AFTERLEAF_ALLOW_HEADLESS=1` overrides deliberately) and
warns for other tools.

Two failure modes end with the wrong browser answering the CDP endpoint;
both have occurred in practice:

1. **Mirrored-networking loopback shadowing.** Under WSL2 mirrored networking,
   a browser listening inside WSL on the DevTools port (`9222`) or bridge port
   (`9223`) can intercept connections meant for the Windows side — including
   the launcher's own readiness check. Before trusting any measurement,
   verify who is answering:

   ```bash
   curl -s "http://$(ip route show default | awk '{print $3; exit}'):9223/json/version" |
     grep -E '"Browser"|User-Agent'
   ```

   Real Windows Chrome reports `"Browser": "Chrome/..."` (never
   `HeadlessChrome/...`) and a `Windows NT` user agent. The launcher refuses
   to start against a headless answerer.

2. **Stale dedicated-profile instances.** When a chrome.exe with the dedicated
   profile directory is already running, a fresh launch joins that instance
   and silently drops `--remote-debugging-port`. The launcher stops stale
   instances of its exact profile before starting; if you started the
   dedicated window by hand, close it before invoking the launcher.

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

Aim at the workload, wait for its assets to settle, keep the dedicated window
in its normal state (it may sit behind other windows), then run:

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
emulation keeps the page active for automation. Compare samples taken in the
same window state: normal-state runs pace at display cadence, while a
minimized window paces near 75 fps and hides any improvement below that
floor even though the frame pump keeps frames arriving.

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

| Variable                        | Default                         | Purpose                                  |
| ------------------------------- | ------------------------------- | ---------------------------------------- |
| `AFTERLEAF_GAME_URL`            | Active discovered Vite URL      | Game URL and profiling query             |
| `AFTERLEAF_CDP_ENDPOINT`        | `http://127.0.0.1:9222`         | Browser discovery endpoint               |
| `AFTERLEAF_CDP_TARGET`          | Host from the resolved game URL | Target URL substring                     |
| `AFTERLEAF_CDP_NAVIGATE_URL`    | Resolved game URL               | Navigation destination                   |
| `AFTERLEAF_CDP_WARMUP_MS`       | `1200`                          | Settling time before FPS sampling        |
| `AFTERLEAF_CDP_SAMPLE_MS`       | `5000`                          | FPS sample duration                      |
| `AFTERLEAF_CDP_CONSOLE_MS`      | `5000`                          | Console collection duration              |
| `AFTERLEAF_CDP_CONSOLE_RELOAD`  | `false`                         | Reload before console collection         |
| `AFTERLEAF_CDP_FRAME_PUMP`      | `on`                            | `off` disables the screencast frame pump |
| `AFTERLEAF_CDP_SCREENSHOT_PATH` | `/tmp/afterleaf-cdp.png`        | Optional screenshot output               |

Screenshots are restricted. Automated agents must not capture screenshots
unless the user explicitly authorizes a specific capture; visual verification
belongs to the person at the machine, and the dedicated window is always
available for direct inspection. When the user does authorize one, capture the
current viewport without changing its dimensions with:

```bash
bun run cdp:screenshot:wsl
```

The same restriction applies to other visual side effects: prefer renderer
counters, console output, and bounded traces, which answer most questions
without touching presentation.
