# Afterleaf

> Codename: **Afterleaf**  
> Tagline: **Sort the stacks. Learn the shop. Stay after closing.**

## One-sentence pitch

After an overnight earthquake empties a two-floor Japanese adult manga shop onto
the floor, the player restores it one shelf at a time, learning the shop's
overlapping editorial logic and optionally opening every publication to read it.

## The useful part of the reference

[Librarian: Tidy Up the Arcane Library!](https://store.steampowered.com/app/4197610/)
turns a huge cleanup into a first-person categorization game: infer a book's
destination from its title and cover, complete rows, then unlock tools that make
the remaining work faster. Its stated full-game scale is 3,072 books.

Afterleaf should borrow the satisfying transformation from chaos to order, but
not make every book a disguised serial-number key. A specialist manga shop is
interesting because its taxonomy is inherently debatable. A yuri supernatural
comedy can reasonably live in the yuri bay, the supernatural bay, a publication
run, or a player-labeled feature display. The player is curating a legible store,
not finding the one coordinate chosen by the designer.

## Product position

This is an unhurried first-person organization game with an adult subject, not a
sex game with shelving between scenes. The covers, store texture, and readable
publications are the atmosphere and reward. The primary verbs are:

1. **Notice** — read signs, covers, spines, issue numbers, and shelf context.
2. **Handle** — pick up, rotate, stack, carry, inspect, and place books.
3. **Curate** — make coherent sections from books with overlapping themes.
4. **Restore** — turn obstructed aisles into a convincingly operational shop.
5. **Browse** — open any book and read it without leaving the fiction of the shop.

Afterleaf treats Japanese adult publishing as culture and inventory. Content
preferences belong to players and operators, so tag exclusions are explicit and
configurable rather than hard-coded into the catalog.

There is no combat, hunger system, or customer-management simulation. The earthquake has already happened; we do not need to simulate a
building shaking or turn a real disaster into spectacle.

## Design pillars

### 1. Organized by taste, not by answer key

Several arrangements should pass. The game scores the coherence of a bay and
the readability of the whole floor rather than comparing every book to a single
hidden target slot.

### 2. A tactile mess that visibly gets better

The player's strongest reward is environmental: floor area reappears, paths open,
magazine faces line up, handwritten shelf cards become readable, and the room's
sound changes from paper-strewn muffling to a quiet fluorescent hum.

### 3. A shop, not “Japan-flavored cyberpunk”

The space should feel practical and slightly overstocked: vinyl tile, fluorescent
fixtures, low suspended signs, narrow but navigable aisles, wire baskets, clear
book bags, price stickers, publisher dividers, sun-faded campaign posters, staff
recommendation cards, a counter crowded with ordinary retail equipment, and an
uncomfortably steep stair between floors.

Official Animate floor guides consistently put new releases and magazines near
the entrance, divide stock into explicit readership/format sections, and use
staff-recommended or adaptation-focused feature corners. Mandarake's Nakano map
similarly separates seinen/light novels, subculture/adult manga, magazines,
artbooks, and adult dōjinshi. Those are more useful layout references than a
generic image search:

- [Animate Kanazawa floor guide](https://www.animate.co.jp/en/shop/kanazawa/floor/)
- [Animate Gifu floor guide](https://www.animate.co.jp/en/shop/gifu/floor/)
- [Mandarake Nakano floor map](https://www.mandarake.co.jp/en/shop/image/map_nkn.pdf)

### 4. Every cover is physical; every page is available

Every placed book has a front, back, spine, thickness, trim size, and reading
direction. Every content-pack entry can include its complete page sequence. The
3D world only keeps shelf-resolution derivatives resident; reader-resolution
pages stream into the held book as it is opened and flipped.

## Player fantasy and tone

The player is the trusted closing-shift clerk. The owner has gone to inspect the
building and left a voice message: clear the aisles, recover the limited editions,
and put the shop back together.

The tone is intimate, observant, and a little mischievous. The shop should feel
lived-in rather than seedy, and the game should treat its fictional artists,
editors, circles, and readers as people with tastes rather than as punchlines.

The night is a suspended playspace: the clock does not advance and morning never
arrives. Progress is deliberately low-pressure:

- no countdown, calendar, customer opening, or time-failure state;
- soft evaluation with explanations, not a red failure screen;
- reading is always optional and never the only way to identify a category; and
- an instant privacy-shutter key pauses and replaces the game view with a neutral
  inventory screen.

## The two-floor shop

### Ground floor — current commercial stock

- entrance feature table and current-month releases;
- large-format monthly and bimonthly “Comic \_\_\_” magazines, mostly face-out;
- collected commercial volumes, mostly spine-out;
- publisher and imprint runs;
- checkout, wrapping station, baskets, and a small hold shelf;
- conspicuous age-restriction signage; and
- a partially blocked front aisle that forms the opening tutorial.

The ground floor teaches legible, high-confidence relationships: publication
runs, issue chronology, publisher marks, trim size, and new-versus-back issue.

### Upper floor — specialist and older stock

- dōjinshi organized by broad theme and circle;
- back issues and out-of-print stock;
- yuri, romance, fantasy, supernatural, comedy, office, historical, anthology,
  and other overlapping bays;
- player-labeled feature displays that may intentionally mix categories;
- used books whose visual condition may vary; and
- a cramped stockroom containing missing dividers and display stands.

The upper floor introduces ambiguous curation. Furniture still implies physical
format—large face-out racks are different from spine-out shelves—but thematic
labels belong to the player. Label holders start empty and accept one or two
controlled facet cards plus optional custom display text. Nothing makes the
player recover the designer's “correct” divider before they can organize.

The staircase is the main logistical constraint. Early on the player carries
only three loose books. A recovered tote, rolling basket, and dumbwaiter/book
chute progressively remove busywork without automating away the act of sorting.

## Core loop

1. Enter a cluttered zone and make a safe walking path.
2. Inspect obvious anchors: surviving publication runs and display furniture;
   assign a label when the intended section becomes clear.
3. Gather a small stack of related books or load them into a tote.
4. Place them in a likely bay; snap placement handles the millimeter work.
5. Read the bay's immediate feedback and adjust outliers.
6. Complete enough coherent bays to unlock the next tool or area.
7. Browse interesting books at any time.
8. Request an advisory evaluation when desired; it explains the floor's strengths
   and weak spots without revealing a canonical arrangement or advancing time.

The first ten minutes should go from “I cannot walk through this” to one pristine,
face-out magazine run. The next hour expands from deterministic publication runs
into thematic judgment.

## Handling model

### First-person controls

- primary action: take/place the aimed book;
- hold primary: grab a short contiguous shelf run or floor stack when a tool
  permits it;
- secondary action: rotate the held item or flip front/back;
- inspect: bring the book close and reveal metadata learned from its physical
  clues;
- open/close: articulate the covers and page blocks without leaving the 3D world;
- turn page: grab a generous invisible strip over the outer third of the active
  leaf, with the visible fore-edge/corner providing the affordance;
- reading zoom: first move the book close to the camera, then enlarge the open
  spread around its grip point for finer text;
- mouse wheel / controller shoulders: shift insertion position within a bay;
- tote action: put the held book into or take the next book from the tote; and
- focus: temporarily emphasize compatible nearby signs and matching series marks.

A held book follows a critically damped hand target. On approach, shelf slots
preview a translucent pose; placement snaps only after the book clears neighboring
volumes. Dropping remains possible, but precision physics is never required for
ordinary shelving.

Shelf-snap force is a handling-tuning value, not a paper-design decision. The
handling spike should find the weakest spring that reliably seats a book without
making it feel magnetized or dragging neighboring stock unnaturally.

### The books on the floor and shelves

The baseline is one simple dynamic Rapier rigid body and box collider for every
physical book. The authored opening scatter is saved as deterministic transforms,
and bodies are created already sleeping rather than dropped during scene load.
Shelved books also remain dynamic.

Rapier stops integrating sleeping dynamic bodies and automatically wakes them
when a moving body creates contact. Pulling a tightly packed volume can therefore
wake, tilt, and drop its unsupported neighbor. That small cascade is a desired
reward, not an error:

- [Rapier rigid-body sleeping](https://rapier.rs/docs/user_guides/javascript/rigid_body_sleeping/)

Only awake body transforms need to be copied into the render instances. Held or
thrown books enable CCD; settled books do not. We should test 72, 500, and 1,000
simple bodies before adding a physics-LOD system. Static/kinematic conversion is
an escape hatch justified by profiles, not the starting architecture.

## A non-deterministic sorting model

### Book facets

Each book carries weighted, partially visible facets:

- publication, imprint, circle, artist, and series;
- issue date and issue number;
- commercial volume, magazine, anthology, or dōjinshi;
- broad themes such as yuri, romance, comedy, fantasy, or supernatural;
- tone and intensity;
- new, back issue, used, limited, or feature-display eligibility;
- trim size, thickness, and binding direction; and
- condition and price band.

The data uses controlled internal IDs; display labels are localized separately.
Tags never need to be inferred from the page pixels at runtime.

### Shelf intent

The player authors each bay's semantic profile rather than discovering a hidden
designer label. A label can contain one primary facet, one optional secondary
facet, and freeform display text. Controlled facets drive evaluation; freeform
text is presentation and localization, so the game never has to interpret prose.

Every labeled bay has a profile rather than an allowlist:

- one or more promoted facets;
- facets that are acceptable but weaker;
- physical format constraints;
- a preferred ordering rule; and
- presentation slots such as face-out or spine-out.

Furniture fixes only the physical rules. The player decides whether a compatible
bay is labeled yuri, supernatural comedy, a publication family, a circle, or
something else. An unlabeled shelf can hold temporary stock but contributes
little to store legibility.

### Scoring

For a book `b` placed in bay `s`, start with:

```text
fit(b, s) =
  thematic affinity
  + publication / circle affinity
  + format fit
  + chronology and adjacency bonuses
  + presentation bonus
  - hard retail violations
```

The exact weights are tuning data, not embedded in UI code. A bay score combines:

- **coherence** — the average and worst-item fit;
- **continuity** — whether obvious issue/series runs are ordered;
- **legibility** — whether neighboring bays are meaningfully distinct;
- **presentation** — fill, facing, alignment, and use of feature slots; and
- **coverage** — how much eligible stock has been shelved.

The lowest-fit item matters so one excellent run cannot hide a random dump of
unrelated books. However, there is no penalty merely because another shelf could
have scored a particular book slightly higher.

### Duplicate stock

Face-out racks have depth. The front copy supplies the visible cover while
duplicate copies of the same issue can be stocked immediately behind it. A deep,
orderly run improves availability and visual fullness without consuming more
frontage. Mixing different publications within that depth stack is awkward.

On ordinary spine-out shelves, duplicates are adjacent copies and consume real
width. They can strengthen a publication block, but excessive duplicates create
overflow pressure. This makes duplicate behavior depend on the furniture rather
than a global bonus or penalty.

### Feedback without a spreadsheet

- A shelf-edge status card progresses from blank to “forming,” “clear,” and
  “excellent.”
- On inspection, an awkward book gets a plain-language observation such as
  “This is the only back issue in a current-month display.”
- Strong adjacency makes a subtle alignment sound and visually straightens the
  run.
- The end-of-floor receipt lists three concrete suggestions and never dumps the
  underlying weights.

### Small deterministic sub-puzzles still belong

A monthly magazine run is satisfying precisely because it has a chronological
answer. Likewise, a five-volume collected series should be ordered. These are
local punctuation inside a wider curation problem, not the rule for all stock.

## Reading a book

The physical 3D book is the primary reader. It must remain an object in the room,
not become a menu after the first spread:

1. Pick up and freely rotate the closed book.
2. Open either cover around the bound spine.
3. Hold the open spread at a natural reading distance.
4. Grab a page corner or fore-edge and pull it through an actual curved turn.
5. Move the book closer for the first zoom level.
6. Enlarge the book around the grip/inspection anchor for an additional reading
   zoom without changing the world's camera FOV.
7. Close or shelve it at the exact page last read.

On desktop, an inspection spring moves the book along the view axis while keeping
it within the near plane. In VR, the first zoom is literal hand motion toward the
headset. The second is an explicit inspection scale applied around the held
anchor; changing VR FOV is not a zoom mechanism.

### Runtime book rig

A readable book is promoted from its ordinary render instance into one reusable
articulated rig:

- a rigid world body provides the overall pose and collision envelope;
- front and back covers rotate around the spine with damped angular limits;
- left and right page blocks change thickness and wedge angle as pages cross the
  binding;
- one subdivided active-leaf mesh represents the page currently being turned;
- the two visible spread pages and both sides of the active leaf receive streamed
  page textures; and
- a small visual deformation rig adds limited paperback flex to the covers,
  spine, and page block.

We should not create one physical mesh or rigid body per paper page. The page
blocks provide mass and thickness; only the active leaf needs continuous curl.
At the end of a turn, page index and block thicknesses commit atomically, the
next texture set is bound, and the active mesh resets.

Releasing an open book triggers a short physically motivated closing recovery
before it returns to the ordinary rigid-body/instance representation. The last
page remains bookmarked. Persistently open dropped books are out of scope because
they require articulated world collision, more resting poses, and additional
save state.

### Page-turn deformation

The grabbed point defines the active leaf's target. A constrained curve from
spine to fore-edge supplies curl, lift, and slight torsion, and a TSL vertex
deformation maps the page grid over that curve. Page motion has three phases:

1. **peel** — the grabbed edge separates and curls while the spine edge remains
   fixed;
2. **cross** — curvature travels across the page as the hand/cursor crosses the
   binding; and
3. **settle** — hysteresis chooses the original or next spread and a damped spring
   lays the leaf onto its page block.

The same model runs forward and backward for right-to-left reading. Page paper
does not collide with every book in the room; its interaction is constrained to
the held book, hands/pointers, and a coarse cover/page-block envelope. Subtle
audio, controller haptics, and a tiny release flutter sell the contact better than
an unstable cloth solve.

### Paperback flop

Closed and open manga should not feel like wooden boxes. While a book is held, a
small XPBD/Verlet curve with a handful of stations follows grip position, gravity,
and angular acceleration. The rendered covers, spine, and page edges skin to that
curve with tight strain and bend limits. The result is a few percent of sag,
delayed cover motion, and a soft stop—not cloth.

The Rapier collider remains a rigid conservative envelope. The flex rig is visual
secondary motion and is active only for held/inspected books, so it does not turn
hundreds of sleeping volumes into soft bodies.

### Optional DOM reader

A full-screen Solid reader remains available as an accessibility and convenience
mode, not the default transition. It uses the same page stream, bookmarks, and
right-to-left ordering, and can offer larger text, predictable two-page layouts,
or input methods that are awkward in 3D.

Reader pages are loaded on demand with a small ahead/behind queue and an LRU
budget. Closing or shelving a book releases reader-resolution GPU textures after
a short grace period. The shelf atlas remains untouched.

## Future VR constraints

VR is not a supported mode. The architecture should still avoid decisions that
make a later WebXR experiment unnecessarily difficult. Desktop mouse and
controller input drive semantic `BookInteractionController` commands rather than
directly owning book transforms.

If VR is explored much later, the intended mapping is:

- one hand holds the book at any cover/page-block grip point;
- the other hand pinches the active leaf and supplies the page-turn target;
- two-handed grips can steady, rotate, or rescale inspection without changing
  world scale;
- the book can be brought naturally toward the headset for reading;
- collision/haptics distinguish page contact from cover contact; and
- tracked hands drive the same semantic commands as desktop input.

Three's `WebGPURenderer` exposes WebXR multiview when supported, but VR must get a
separate frame-time and texture-legibility test if it ever enters scope; desktop
results should not be treated as evidence of VR performance:

- [Three WebGPURenderer options](https://threejs.org/docs/pages/WebGPURenderer.html)

## Content-pack architecture

The game shell must not assume where publications came from. A pack is a folder
or archive containing a manifest and image assets.

Illustrative entry:

```json
{
  "schemaVersion": 1,
  "id": "moon-rabbit-2026-07",
  "kind": "magazine",
  "title": "Comic Moon Rabbit",
  "issue": {"year": 2026, "month": 7, "number": 18},
  "facets": {
    "publication:moon-rabbit": 1,
    "theme:yuri": 0.8,
    "theme:romance": 0.6,
    "tone:comedy": 0.3
  },
  "physical": {
    "trim": "B5",
    "thicknessMm": 14,
    "readingDirection": "rtl"
  },
  "assets": {
    "front": "front.webp",
    "back": "back.webp",
    "spine": "spine.webp",
    "pages": ["pages/001.webp", "pages/002.webp"]
  }
}
```

### Import pipeline

The pipeline accepts:

- an image directory plus a sidecar manifest;
- local CBZ/ZIP files; or
- a content-provider adapter.

It then:

1. validates paths, image dimensions, page order, and manifest values;
2. rejects encrypted archives, path traversal, decompression bombs, malformed
   images, missing required metadata, and duplicate IDs;
3. normalizes orientation and color space when an image needs conversion;
4. creates shelf-resolution front/back derivatives and a legible, title-rendered
   spine instead of cropping arbitrary cover art into a narrow strip;
5. builds mipmapped cover atlases or fixed-size texture arrays;
6. preserves runtime-ready WebP reader pages byte-for-byte when they are at most
   2048 pixels per axis and 2 MiB, while oversized or non-WebP pages are converted
   to quality-88 WebP in the original page order;
7. writes an immutable catalog with hashes;
8. produces a report of warnings rather than silently guessing metadata; and
9. emits a pack-local static cover/spine preview for visual auditing before the
   Three.js runtime exists.

Adapters return the same neutral records. The game never knows whether a pack
began as a directory, CBZ, creator drop, or provider response. This keeps the
runtime independent from any particular external catalog.

### Library workflow

The player-facing library separates local discovery from provider acquisition:

1. **Import & scan** discovers local archives and image folders, validates the
   combined source tree, excludes blacklisted IDs, and atomically activates a new
   immutable snapshot.
2. **Fetch more** asks the selected provider for unseen publications, commits each
   result through staging, and activates it through the same snapshot pipeline.

The acquisition dialog can remember whether to fetch after future age-confirmed
boots. Newly introduced catalog IDs take priority in the bounded physical shop
display and begin as loose stock across the floor. Ordinary refetches retain the
visible roster and its transforms; arrivals queue while loose work remains and
move into reusable slots as the player clears the batch.

A carried book can be discarded through the physical shop trashcan. The toss
begins only after the local service records its stable ID in the persistent
blacklist. Failure leaves the book in hand for a retry. Successful discards leave
their floor slot available for a new arrival and stay excluded from future scans
and provider results.

## Rendering architecture

Use Three's **`WebGPURenderer` with its WebGL 2 fallback**, not a bespoke
WebGL-only renderer. Three's universal renderer can automatically fall back to
WebGL 2 or be forced to that backend for comparisons. Keep backend benchmarks
available and avoid relying on an unmeasured WebGPU advantage.

The number of publications does not decide WebGL versus WebGPU. Texture
dimensions and residency do. Three's own texture guide estimates ordinary RGBA
texture memory around `width × height × 4 × 1.33` including mipmaps; a compressed
download is not necessarily a small GPU allocation. Relevant references:

- [Three WebGPURenderer guide](https://threejs.org/manual/en/webgpurenderer)
- [Three texture memory guide](https://threejs.org/manual/en/textures.html#memory-usage)
- [Three KTX2Loader documentation](https://threejs.org/docs/pages/KTX2Loader.html)

### World rendering

- Author the store as lightmapped GLB modules, merge static geometry by material,
  and reserve dynamic lights for a few important fixtures.
- Use one shared beveled book geometry per physical format.
- Render settled books with `InstancedMesh`, grouped by cover atlas/texture array
  and opaque material variant.
- Store transform, atlas cell, tint, thickness, wear, and selection state as
  instance data.
- Give pages and page edges a shared procedural material; unique pixels are only
  needed on front, back, and spine in the world.
- Use mipmaps and anisotropy deliberately because most covers are viewed at
  grazing angles.
- Start with WebP atlases for ease of iteration, then measure KTX2/Basis GPU
  textures once the asset set is representative.
- Use a pooled, non-instanced articulated rig only for the held/inspected book;
  its ordinary world instance is hidden until it is released.
- Do not create one material or one GPU texture per book.

At 256 × 384 RGBA plus mipmaps, one unique surface is roughly 0.5 MiB before GPU
compression. A thousand front and back covers would already approach a gigabyte.
That is why shelf atlases and small derivatives are architectural requirements,
not late optimization.

### Page streaming

- Do not upload unread interior pages to Three. Decode and upload the current
  spread, both sides of the active leaf, and a small look-ahead/behind queue.
- Choose reader texture resolution from projected pixel size with a capped
  high-resolution rung for close/VR inspection; never reload merely because the
  book moved a few centimeters.
- Cap decoded page memory independently from HTTP/disk cache.
- Revoke object URLs and release `ImageBitmap`s deterministically.
- Precompute thumbnails so browsing never decodes full pages.
- Keep publication packs on local disk in Electron; the renderer receives narrow
  asset URLs/handles rather than unrestricted filesystem access.

### Physics and interaction

- Use Rapier for the player capsule, every book body, held/drop collisions, carts,
  and display furniture.
- Represent shelves with simple compound colliders, not triangle meshes.
- Create authored book transforms as sleeping dynamic bodies and let contact
  islands wake naturally.
- Preserve a stable body-handle-to-instance-index mapping and update render
  matrices only for bodies Rapier reports as moved/awake.
- Drive a held book through a force/torque hand constraint rather than teleporting
  it kinematically through neighboring stock.
- Use simple box collision for the book body; cover/page articulation is local to
  the held rig.
- Raycast against coarse spatial cells first, then exact book bounds.
- Use fixed simulation steps and zero allocations in the frame loop.

### Startup and shader budget

Measure cold startup rather than hiding unbounded compilation behind a longer
loading screen.

Before first interaction, keep the material/pipeline set intentionally tiny:

1. lightmapped environment;
2. instanced opaque book;
3. articulated cover/page-block;
4. deforming active leaf;
5. simple highlight; and
6. one fixed shadow configuration, if dynamic shadows survive profiling.

Wear, selection, atlas cell, thickness, and other book differences are uniforms
or instance data, not material defines. Lighting configuration, sample count,
output format, skinning mode, and shadow participation remain stable so individual
books cannot manufacture pipeline variants.

Startup phases get separate performance marks:

```text
renderer init
→ core asset decode
→ core compileAsync
→ first representative frame
→ input ready
→ idle optional warmup
```

The persistent renderer and one retained representative of each core material
stay alive for the session. Representatives can live in a dedicated warmup scene
used by `compileAsync`; they do not need to pollute the production scene. Retaining
them prevents a temporary warmup object from disappearing and releasing the very
pipeline it was meant to prepare, without relying on Three's private `_pipelines`
or `_nodes` internals. Optional materials compile during idle time after the
player can already handle the first book.

## SolidJS architecture

Keep the expensive imperative runtime mounted. Solid components are setup owners,
not render loops.

Solid should own:

- menus, settings, subtitles, prompts, evaluation receipts, shelf-label editing,
  and the optional DOM reader;
- slow state such as selected book ID, current objective, tote contents, and
  reader page;
- content-pack validation/progress UI; and
- route/session ownership.

Three/Rapier should own:

- frame-by-frame transforms;
- movement, collision, ray queries, and hand springs;
- physical book articulation, page-turn deformation, and active page textures;
- instance pools and render resources; and
- transient highlight intensity.

Bridge them with narrow accessors and events. For example, the reader receives
`publicationId: Accessor<string | undefined>` rather than a whole mutable game
object. Per-book simulation data belongs in typed arrays or stable POJOs, not one
Solid signal per physical book.

Suggested runtime boundaries:

```text
Solid session owner
├── GameWorld (persistent Three + Rapier runtime)
│   ├── StoreEnvironment
│   ├── BookInstancePool
│   ├── ReadableBookRigPool
│   ├── ShelfSlotIndex
│   └── InteractionController
├── HUD / prompts / evaluation
└── OptionalDomReader (mounted only when explicitly requested)

Content service
├── Pack catalog metadata
├── Shelf-derivative cache
└── Reader-page LRU
```

## Data and save model

Use stable integer book IDs inside the runtime and stable string publication IDs
at content boundaries.

The save records:

- pack ID and immutable catalog hash;
- each physical copy's publication ID and current location;
- authored scatter transform or shelf/bay/slot;
- player-authored shelf facet labels and optional display text;
- recovered tools, opened paths, and evaluation history; and
- exact open-page bookmarks, stored separately so world-state resets do not erase
  them.

A save never embeds publication images. If a pack disappears or changes hash,
show a repair screen and preserve the unresolved placements rather than deleting
them.

## Design north star

The differentiator is not “thousands of explicit textures.” It is that every
book in a satisfying organization game can be picked up, flexed, opened, and
physically read—and the shop's taxonomy admits taste, disagreement, and
authorship.
