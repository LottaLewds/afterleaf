# Afterleaf PC

> Status: deferred until the [television](TV.md) is complete  
> Scope: a real, navigable browser rendered onto an in-world CRT in Electron

## Core decision

The PC uses a separate, sandboxed Electron `WebContents` with offscreen rendering.
It loads a remote page as its top-level document and presents the compositor's
shared GPU texture on a Three mesh.

The PC must not use a `NativeImage`, bitmap readback, canvas copy, screenshot
loop, or any other GPU-to-CPU-to-GPU path. The first prototype starts with
Electron's shared-texture path. If the platform cannot provide that path, the PC
fails closed with an unsupported/no-signal screen instead of silently enabling a
CPU-copy fallback.

HTML-in-Canvas and `HTMLTexture` remain useful for a browser-hosted, same-origin
fictional OS, but they are not the Electron PC's rendering backend.

## Why Electron changes the design

The remote site is the top-level page in its own `WebContents`, not an iframe in
the game page. Consequently, iframe embedding restrictions such as
`X-Frame-Options` and CSP `frame-ancestors` do not apply to navigation. The
remote page retains Chromium's normal same-origin boundary; Afterleaf does not
need to disable it or inspect the remote DOM.

Electron's offscreen renderer can return a shared compositor texture containing
the complete page, including normal cross-origin content. That texture can be
sampled by the CRT material and therefore participates in Three depth,
occlusion, curvature, and post-processing.

Some protected media, authentication providers, anti-bot systems, and device
APIs may still reject an embedded Chromium environment. Supporting arbitrary
URLs means best-effort browser compatibility, not a promise that every site will
work.

## Frame pipeline

The intended zero-copy path is:

```text
sandboxed offscreen WebContents
  -> Electron paint event with OffscreenSharedTexture
  -> import and transfer the shared texture to the game renderer
  -> VideoFrame
  -> THREE.VideoFrameTexture
  -> CRT screen material
```

Use `webPreferences.offscreen.useSharedTexture: true`. Electron's shared-texture
APIs are experimental, so the prototype must verify the exact handle import,
transfer, and release sequence on every supported operating system before PC work
continues.

Frame ownership is explicit:

- hold at most the current frame and one incoming replacement;
- discard superseded frames rather than queueing latency;
- do not release Electron's offscreen texture until the imported reference is
  valid;
- release every Electron shared texture promptly;
- close the previous `VideoFrame` after Three has consumed its replacement; and
- stop offscreen painting while the PC is powered off or the game is disposed.

The renderer should react to produced frames rather than polling screenshots.
Static pages naturally produce no new frames. Initial PC resolution and frame
rate will be selected during the prototype and then profiled with a playing video,
an animated page, and a static page.

Relevant Electron documentation:

- [Offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)
- [Offscreen shared textures](https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture)
- [Shared texture transfer](https://www.electronjs.org/docs/latest/api/shared-texture)

## Input

The screen mesh remains a normal Three interaction target. While the player is
using the PC:

1. release pointer lock and enter a focused computer mode;
2. raycast the screen and convert its UV coordinate into WebContents pixels;
3. forward mouse movement, buttons, and wheel input with
   `webContents.sendInputEvent()`;
4. forward keyboard input only while computer mode owns focus; and
5. restore game input and pointer lock when the player exits.

The browser cursor can be represented in Three or drawn by the remote page. Text
selection, IME, clipboard behavior, popups, context menus, drag-and-drop, and
file pickers need explicit product decisions rather than unrestricted desktop
integration.

## Spatial browser audio

The PC's WebContents must not emit a second, non-spatial copy through the system
output. Capture audio from its `WebFrameMain` as a `MediaStream`, pass that stream
to the game renderer, and connect it to `THREE.PositionalAudio` at the PC speaker
position.

The audio stream and video frames have independent lifetimes. Navigation may
replace or temporarily silence the page without rebuilding the Three audio
object. The prototype must verify muting, stream replacement, autoplay behavior,
and cleanup before enabling video sites by default.

Relevant Electron documentation:

- [Display-media request handling](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)

## Security boundary

Remote content is untrusted even when it is rendered onto a fictional computer.
The browsing WebContents uses:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- `webSecurity: true`;
- no preload script unless a later requirement justifies a narrow, validated
  bridge;
- a dedicated session partition;
- HTTPS-only remote navigation;
- deny-by-default permission request and permission check handlers;
- blocked unsolicited windows, downloads, external protocol launches, and local
  file access; and
- validated IPC sender identities for every game/browser message.

Do not strip remote security headers, disable site isolation, enable insecure
content, expose Electron APIs to a page, or use `webSecurity: false`. Loading a
page as the top-level WebContents already solves the iframe restriction without
weakening Chromium's same-origin policy.

See Electron's [security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
before implementing navigation.

## Browser chrome and state

Afterleaf owns the physical monitor, address controls, loading indicator, error
screen, and navigation buttons. The remote WebContents owns only page content.
This keeps trusted controls outside untrusted DOM and lets the screen show a safe
interstitial before navigating to a submitted URL.

The PC may persist its current URL, history policy, volume, and power state, but
must not place cookies, credentials, or remote page data in the world save. Those
belong exclusively to the dedicated Electron session.

## Deferred prototype sequence

Do not begin this sequence until the television establishes the physical CRT,
screen material, interaction conventions, and positional-audio tuning:

1. Package Afterleaf in Electron using the repository's existing Electron
   conventions.
2. Render a static same-origin page through the shared GPU texture path.
3. Prove frame replacement and resource release without CPU pixel access.
4. Render a remote HTTPS page with the full security boundary enabled.
5. Forward raycast-derived mouse input and focused keyboard input.
6. Capture the WebContents audio and route it exclusively through
   `PositionalAudio`.
7. Test navigation, video playback, failure states, process crashes, and cleanup.
8. Profile all supported platforms before exposing arbitrary URL entry.
