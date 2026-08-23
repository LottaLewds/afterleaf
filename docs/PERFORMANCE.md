# Afterleaf performance

Working checklist for scene performance work. Measure before and after every
change with the CDP tooling in `docs/CDP_PROFILING.md` (`bun run cdp:census:wsl`
for the draw-call breakdown, `bun run cdp:profile:wsl` for frametimes).
Compare runs with the same camera pose, world save, window size, device pixel
ratio, and sample duration. The permanent bottom-right FPS HUD mirrors
`renderCalls`-adjacent numbers live.

## Baseline snapshot (2026-08, after proxy hiding + deep batching)

| Metric              | Value                             |
| ------------------- | --------------------------------- |
| Draw calls          | 258 idle (was 704)                |
| Frametimes          | p50 8.30ms - 2x the 4.17ms budget |
| Triangles           | ~86k                              |
| Renderer geometries | 916 (was 1500)                    |
| Textures            | 252                               |

The display is 240Hz: the per-frame budget is 4.17ms. A p50 of 8.30ms
means we are CPU/draw-call bound at roughly half the target framerate -
not vsync-capped. Other Three.js titles reach ~240fps on this machine,
so the headroom exists once submission cost drops.

## Snapshot after draw-call consolidation rounds (2026-08)

Definitive normal-state samples (window restored, display awake, 12s runs):

| Metric                  | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| Visible scene meshes    | ~420-520 by view (was 889 at baseline)                               |
| Render calls            | 186-216 typical views (was ~259 flat)                                |
| Wall-facing pose        | 239.99 fps - vsync-capped even at 207 calls                          |
| Content-heavy poses     | p50 8.30ms = two 240Hz ticks (~120 fps); user saw ~180 fps mid-range |
| TV-cave draw calls      | 126 across 42 units (was 504)                                        |
| Book atlas batches      | 11 - one per atlas page (was 55)                                     |
| Arcade cabinet          | 11 calls (was 17)                                                    |
| Non-animated user props | 3 calls each (was 9)                                                 |
| Resident interior       | vertex-baked; poster raycast overlays preserved                      |
| Shadow maps             | disabled (no casting lights exist)                                   |
| Shader precompile       | `compileAsync` at start + 4s second pass                             |

At 240 Hz, intervals quantize into 4.17ms ticks: frames that finish inside
one tick read as p50 4.2ms, frames just over read as 8.3ms. Even a
wall-facing pose (207 calls) holds vsync-capped 240fps - the submission
budget fits one tick in light poses. Content-heavy poses straddle two
ticks; the cave room remains the honest benchmark for further work.

Two regressions were caught by visual inspection during this round and
fixed; both are lessons for future batching work:

- Buckets must render with the bucket's own material. Storing the first
  member's original material made baked buckets ignore their vertex colors
  and paint walls white.
- `colorWrite`/`depthWrite`-off raycast-only overlays (106 poster surfaces)
  must never be swept or hidden: batching them painted shared materials
  over the wallpaper and hid poster placement targets.

Attribution experiment (hide-a-system-then-sample through CDP): dropping
the 55 book batches alone moved p50 from 16.6ms to the ~12.5ms compositor
floor while locked - draw-call count remains the dominant CPU lever.

## Checklist

### Draw calls

- [ ] Resident interior: the remaining ~46 paired single-quad sign/spine
      labels carry unique per-item canvas textures (dynamic - `#setSign`
      repaints them), so consolidating them means a runtime texture-atlas
      with per-cell repaint. This is the known lever for pushing heavier
      views from two 240Hz ticks to one; worth it only if those views still
      matter after playing with current numbers.
- [ ] Animated user-model GLB props (31 calls for the largest): deliberately
      excluded from static merging because AnimationMixer-driven node
      transforms would freeze. Options: merge only their non-animated
      subtrees, or re-rig as skinned batches.
- [ ] Digital art frames (~12 calls total): each frame is already minimal
      (one backing box + dynamic display), so the only consolidation left is
      cross-frame backing batching - but frames are movable props, which
      would need per-instance matrix syncing for a handful of calls.
      Deliberately skipped.
- [ ] Arcade cabinet's remaining 11 calls are unique-textured parts; would
      need an atlas to consolidate. Low priority.

### Frame pacing / stutter

- [ ] Validate the shader precompile passes on a fresh boot: rotating the
      camera into the TV cave and theatre should no longer stutter while
      programs cache (`compileAsync` at start plus a second pass at +4s for
      late async prop models).
- [ ] Shadow story decided for now: `shadowMap.enabled = false` because no
      light sets `castShadow`, so nothing regressed visually. All mesh
      cast/receive flags are preserved; wiring the ceiling spotlight later
      is a one-flag change plus a shadow-camera tuning pass. Contact shading
      stays baked into textures meanwhile.

### GPU-side levers (only if we ever become GPU-bound)

- [ ] Revisit `antialias: true` and devicePixelRatio clamping on the renderer;
      both are pure quality knobs today because triangles are trivial.

### Process

- [x] Clean normal-state re-measure complete (see snapshot): lighter views
      hold the single-tick target; heavier views sit just over it, with the
      sign-atlas documented as their remaining lever.
- [ ] When movable shelving lands as instanced models, retire its per-fixture
      batches and exclusion-list entries rather than accumulating special
      cases in `#interiorBatchSoft`.

## Done

- [x] Hide fully-transparent raycast proxies (shelf/sign targets) - ~600
      zero-visual draw calls removed; Raycaster ignores `.visible`.
- [x] Deep recursive BatchedMesh pass over `night-shop-interior` with
      material-signature dedupe and HARD/SOFT exclusion tiers.
- [x] Books instanced (55 batches / 857 instances), then consolidated:
      accent color and spine direction moved off uniforms onto per-instance
      geometry attributes (`bookAccent`, `bookSpineSign`), so one material
      per atlas page serves every book and the 55 batches collapsed to 11 -
      one per atlas index - with zero shader errors and identical tint math.
- [x] TV-cave CRT units: the "12 calls/unit" was never architecture content -
      they are spawned `ShopTelevision` GLB props outside the interior pass,
      each with 8 casing parts, an independent screen, and a vestigial
      invisible control strip. Fixes: strip removed on model TVs
      (`controls: false`, screen clicks already drive power), and static
      casings merge into shared per-material meshes via
      `~/game/staticModelBatching` (canonical geometry built once per URL,
      plain raycastable Mesh per unit so targeting/pickup is untouched).
      Result: 12 calls/unit -> 3 (2 merged casings + independent screen);
      screens keep per-unit VideoTexture and RectAreaLights. A future global
      `InstancedMesh` over the same merged geometries could reach ~2 calls
      for all casings if more headroom is needed.
- [x] Static merge helper adopted beyond CRTs: non-animated user-model props
      merge at spawn (animated models keep their node graphs), and the arcade
      cabinet merges its trim around the live TVScreen (17 -> 11 calls).
- [x] Resident interior vertex-color bake: untextured color-only materials
      clone their geometry once, bake `material.color` into a `color`
      attribute, and share one white `vertexColors` material per finish
      class (type + side + shading + roughness + metalness + attribute set),
      collapsing one-off colored boxes into shared batches. Zero shader
      errors. Two regressions it briefly caused - buckets ignoring their
      shared material, and raycast-only overlays being swept - were caught
      by visual inspection and fixed (see snapshot notes).
- [x] Shader precompile: `renderer.compileAsync(scene, camera)` fires after
      the first paint and again four seconds later so late-loading prop
      materials compile before the player looks at them.
- [x] Shadow maps disabled (see checklist note); was enabled with zero
      casting lights, costing program permutations for nothing.
