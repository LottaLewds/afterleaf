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

## Checklist

### Draw calls

- [ ] TV-cave shelving units (~12 calls each, dozens of units): confirm the
      SOFT-scope pass collapses their internals into per-fixture batches.
      Census still showed 12 calls/unit after tiering landed; if their six
      materials are per-mesh instances, dedupe signatures or vertex-bake.
- [ ] Resident interior singletons (~238 calls / 232 unique materials): mostly
      one-off colored boxes. Bake `color` into a vertex-color attribute and
      merge per finish class (type + roughness + metalness + map) under one
      shared `vertexColors: true` material. Expected payoff: interior drops
      to double digits.
- [ ] User-model GLB props (31 calls each): merge static submeshes per model
      at load time, or instance repeated decorations when shelving becomes
      movable and is rebuilt as instanced models.
- [ ] Digital art frames (12 calls each): audit which faces ever change and
      batch the static backing/trim per frame size.

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
