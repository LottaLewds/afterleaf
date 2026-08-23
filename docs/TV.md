# Afterleaf television

> Status: first playable implementation
> Scope: local video channels rendered on a physical in-shop television

## Core decision

Build the television before the PC. The television plays local video files from
named channels, renders them through a Three `VideoTexture`, and emits their
audio through `PositionalAudio` attached to the television.

Remote video URLs can be downloaded into an existing channel through the local
content adapter.

## Content layout

Television content lives under `afterleaf-data/content/tv`. Each immediate child directory
is one channel, and each supported video file directly inside it is one program.

```text
content/
  channels/
    after-hours-anime/
      city-pop-opening.mp4
      magical-girl-promo.mp4
    security-feed/
      loading-dock-01.mp4
      loading-dock-02.mp4
    shop-ads/
      membership-drive.webm
      midnight-sale.mp4
```

The directory name is the stable channel ID. The initial display label can be
derived by replacing hyphens and underscores with spaces and capitalizing the
words. A future `channel.json` may add presentation metadata, but it is not
required for the first version.

Initial supported containers are `.mp4` and `.webm`, matched case-insensitively.
The content scanner ignores hidden files, unsupported extensions, nested
directories, empty channels, and paths that escape the channel root.

The video files are local content, not source assets. They remain outside the
JavaScript bundle and are gitignored by default.

## Adding custom channels

No manifest or code change is required. To add a channel:

1. Open `afterleaf-data/content/tv`. Create the
   directory if it does not exist.
2. Create one immediate child directory for the channel. Prefer a stable,
   lowercase, hyphenated name such as `late-night-anime`; it becomes the channel
   ID and displays as “Late Night Anime.”
3. Put one or more `.mp4` or `.webm` files directly inside that channel
   directory.

For example:

```text
afterleaf/
  content/
    channels/
      late-night-anime/
        episode-01.webm
        station-ident.mp4
```

While Afterleaf is running, the television discovers the channel or new videos
within approximately three seconds. The server and game do not need to be
restarted. Adding a video does not interrupt the current program; it becomes
eligible for the channel's next shuffled selection. Removing the currently
playing file advances the television to another available program.

For large files, copy to an unsupported temporary suffix such as
`episode-02.webm.part`, then rename it to `episode-02.webm` after the copy
finishes. This prevents the television from trying to play a partially copied
file.

While aiming at either television, paste an HTTP or HTTPS video URL to import it
into that television's currently selected channel. The local adapter delegates
URL support to `yt-dlp`, so named extractors and the generic extractor follow
the installed `yt-dlp` version. The import downloads one non-live video, ignores
playlists, and has no Afterleaf file-size or duration limit.

Press `N` while aiming at a television to create a channel. Name it in the
dialog, then paste its first video URL there. The successful download creates
the channel folder and tunes that television to the imported video.

`yt-dlp` and `ffmpeg` must be available on `PATH`. Install and keep yt-dlp
current in your preferred Python environment:

```sh
python -m pip install --upgrade --pre "yt-dlp[default,curl-cffi]"
```

`curl_cffi` supplies browser-like TLS impersonation for sites that fingerprint
requests, including YouTube. It does not require Chrome or browser cookies.
Verify it is available with `yt-dlp --list-impersonate-targets`.

On Windows, first check `python --version`. Only if Python is unavailable,
install it from PowerShell:

```powershell
winget install --exact --id Python.Python.3.13 --source winget
```

After installing Python, close and reopen PowerShell so the new command is
available. Skip that installation and restart when Python already works. With
Python available, install yt-dlp:

```powershell
python -m pip install --upgrade --pre "yt-dlp[default,curl-cffi]"
```

Close and reopen PowerShell again before starting Afterleaf. Confirm that
`yt-dlp --list-impersonate-targets` lists concrete browser targets. Do not also
install the standalone `yt-dlp.yt-dlp` winget package: it can take precedence on
`PATH` while lacking the Python installation's optional dependencies.

Downloads are staged in `afterleaf-data/content/tv/.imports`, which the channel index
excludes until finalization. A completed
`.mp4` or `.webm` is hard-linked into the selected channel in one atomic
operation, and a numeric suffix preserves both programs if its filename already
exists. The normal catalog refresh makes the new program eligible for playback
within approximately three seconds. The television that received the paste
switches to the imported program immediately if it is still tuned to that
channel when the download completes; changing to another channel preserves its
current playback.

Keep these constraints in mind:

- only immediate channel directories and video files are scanned;
- nested directories, hidden files, empty channels, and other extensions are
  ignored;
- the `.mp4` or `.webm` container must contain codecs supported by the target
  Chrome version—the filename extension does not transcode a video; and
- Custom videos under `afterleaf-data/content/tv` are local content.

## Channel discovery

Browser code cannot enumerate a directory. Afterleaf therefore needs a narrow
content adapter that scans `afterleaf-data/content/tv` and exposes:

1. a deterministic channel manifest; and
2. read-only, same-origin URLs for the video files.

Development and local preview can expose this through Vite middleware, following
the existing local-library adapter pattern. A packaged Electron build can expose
the same logical URLs through an application protocol. The game consumes one
manifest shape regardless of host:

```ts
type TvChannel = {
  id: string;
  label: string;
  videos: readonly {
    id: string;
    url: string;
  }[];
};
```

Manifest ordering is stable so changes are testable. Playback order is handled
separately by the channel player.

The manifest endpoint rescans the channel directory on every request. The TV
refreshes it every three seconds and reconciles changes by stable channel and
video IDs. Adding or removing a `.mp4` or `.webm` therefore does not require a
server or game restart, and unchanged current playback is not interrupted.

## Playback model

Keep one `HTMLVideoElement` alive for the television's lifetime. Create one
`VideoTexture` from it and connect it to the audio graph once. Changing programs
changes the element's `src`; it does not recreate the element, texture, or media
source node.

Each channel uses a shuffle bag:

- shuffle every video in the channel;
- play each entry once before refilling the bag;
- avoid replaying the previous entry first when a refilled bag has alternatives;
- advance automatically on `ended`;
- skip an entry that fails to load and continue to the next candidate; and
- stop with a visible no-signal state if every entry fails.

Changing channels creates a fresh bag for the selected channel and begins with a
random program. Channel selection and television power state may be persisted in
the world save later; persistence is not required for the first pass.

## Three rendering

The television is a normal world object with a dedicated screen mesh. The screen
material samples the `VideoTexture` and can apply CRT presentation without
affecting video decoding:

- curved-screen UV distortion;
- scanlines and phosphor mask;
- subtle chromatic separation;
- vignette and edge darkening;
- brightness flicker and rolling noise; and
- a no-signal/static state while off or unavailable.

The texture remains a real Three texture, so the screen participates in depth,
occlusion, tone mapping, and the shop's lighting. Avoid generating mipmaps for
live video. The initial resolution and frame rate should follow the source media;
we should tune content recommendations after profiling the first television.

Video sampling uses contain semantics for each television's physical glass. The
original shop television is 16:9; the model-backed CRT is 4:3, so 16:9 video is
letterboxed on that set. Narrower and wider formats receive pillarboxes or
letterboxes as needed. Content is never stretched or cropped to fill the glass.

## Spatial audio

The shop audio manager owns one `AudioListener` on the player camera, cached
audio decoding, and separate media, sound-effect, and future music buses. It
creates one `PositionalAudio` source at the television speaker position and
connects the persistent video element with `setMediaElementSource()` exactly
once. The media element must not also play directly to the default output, or the
player will hear spatial and non-spatial copies simultaneously.

Tune these properties in the scene rather than baking them into content:

- reference distance;
- maximum distance;
- rolloff factor and distance model;
- directional cone; and
- television volume.

Playback begins from an explicit player interaction so Chrome can resume the
audio context. Pausing or disposing the game pauses the video. Disposal releases
the video texture, disconnects the audio source, clears the media element source,
and removes its listeners.

## Interaction

The physical television needs interactions for:

- power on/off;
- previous/next channel; and
- skip current program.

The television has separate physical power, channel, and skip buttons. Aimed
buttons highlight individually and can be pressed with a left click; the button
visibly depresses and the power lamp reflects power state while its local
mechanical click plays through a short positional sound. While targeting any
screen or controls, `Q` changes to the previous channel, `E` changes to the next
channel, and `F` skips the current program. The mouse wheel scrubs an active
program backward or forward, starting at three seconds per notch and ramping
through 5, 10, 15, and 30 seconds while repeatedly wheeling in one direction.
Changing direction or pausing the wheel resets the ramp. Clicking the screen or
power button toggles the television's power. `M` mutes or unmutes only the aimed
television, allowing multiple powered sets to keep playing independently. Aiming
at the model-backed CRT cabinet and pressing `E` picks it up; `E` or `G` releases
it and `F` throws it. Its dynamic body can rest on the floor, tables, shop
fixtures, or other televisions, and its transform is persisted in the world
save. The prompt identifies the current channel, while program filenames remain
developer information unless later metadata supplies a title.

## Implementation order

1. Add channel scanning, validation, and manifest tests.
2. Expose channel media through the local development adapter.
3. Implement the persistent video element, shuffle bags, and failure handling.
4. Add `VideoTexture` playback to a simple screen mesh.
5. Route playback exclusively through `PositionalAudio`.
6. Add the television cabinet, controls, no-signal state, and CRT shader.
7. Profile playback, texture upload, audio, and disposal before increasing visual
   complexity or adding preloading.

The first version deliberately uses one video element. If program transitions
produce an objectionable gap, a later two-element implementation may preload the
next program while keeping both media source nodes persistent.

## Audio manager and future shop music

“Jukebox” refers to the audio-manager pattern already used by Waifu Weave, Kanji
Survivors, and Harem Havoc, not a literal in-shop jukebox. Afterleaf's shop audio
manager follows the same useful boundaries: one context and listener, cached
decoding, explicit media/SFX/music buses, resumable user-gesture startup, and
centralized disposal.

Future ambient shop music should use the manager's music bus and coexist with TV
media and positional effects. Track selection, persistence, crossfades, and
ducking the music while standing near an active television remain later work.
