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

## Snapshot after CRT static merge (2026-08)

Same world and window state as the baseline above.

| Metric               | Value                                               |
| -------------------- | --------------------------------------------------- |
| Visible scene meshes | 493 (was 889)                                       |
| TV-cave draw calls   | 126 across 42 units (was 504)                       |
| Render calls (spawn) | ~234 (was 259)                                      |
| Frametimes           | p50 8.30ms - unchanged this view                    |
| Casing triangles     | lossless merge (-36 tris/unit = removed knob strip) |

## Checklist

### Draw calls

- [ ] Resident interior singletons (~107 calls / 101 unique materials): mostly
      one-off colored boxes. Bake `color` into a vertex-color attribute and
      merge per finish class (type + roughness + metalness + map) under one
      shared `vertexColors: true` material. Expected payoff: interior drops
      to double digits. Now the largest remaining bucket.
- [ ] book-atlas-batch still renders as 55 separate calls; investigate
      whether those batches can consolidate further or become instanced.
- [ ] User-model GLB props (31 calls for the largest): the static-merge
      helper built for CRTs (`~/game/staticModelBatching`) can be adopted by
      user-model televisions/props once skinned/animated subgraphs are
      safely excluded.
- [ ] Digital art frames (12 calls each): audit which faces ever change and
      batch the static backing/trim per frame size.
- [ ] Arcade cabinet (17 calls / 11 materials): candidate for the same
      static-merge treatment.

### Frame pacing / stutter

- [ ] Precompile shaders during boot with `renderer.compileAsync(scene,
camera)` after first paint; rotating the camera currently reveals new
      material variants and stutters until programs cache.
- [ ] Decide the shadow story deliberately: `shadowMap.enabled = true`
      (PCFSoft) but no light sets `castShadow`. Either wire the ceiling
      spotlight knowingly (tight angle, small map) or disable shadowMap and
      bake contact shading into textures.

### GPU-side levers (only if we ever become GPU-bound)

- [ ] Revisit `antialias: true` and devicePixelRatio clamping on the renderer;
      both are pure quality knobs today because triangles are trivial.

### Process

- [ ] Re-measure after each checklist item; the first target is p50
      below 4.17ms so the scene can hold 240fps on this panel.
- [ ] When movable shelving lands as instanced models, retire its per-fixture
      batches and exclusion-list entries rather than accumulating special
      cases in `#interiorBatchSoft`.

## Done

- [x] Hide fully-transparent raycast proxies (shelf/sign targets) - ~600
      zero-visual draw calls removed; Raycaster ignores `.visible`.
- [x] Deep recursive BatchedMesh pass over `night-shop-interior` with
      material-signature dedupe and HARD/SOFT exclusion tiers.
- [x] Books instanced (55 batches / 857 instances).
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
