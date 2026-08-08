# Content seeding

`content:seed` builds deterministic, runtime-ready Afterleaf packs from local
source catalogs. Source catalogs and generated packs are ignored by Git.

## Synchronize a local nHentai catalog

Preview the current default selection (20 `big breasts` results, English first
with Japanese allowed) without downloading images:

```sh
bun run content:sync:nhentai
```

Review the reported gallery IDs and diagnostics. To materialize the selection in
the ignored local catalog, rerun the command with writing enabled:

```sh
bun run content:sync:nhentai --write
```

The command requires an explicit allowed remote language tag. It prioritizes
English, allows Japanese, and skips Chinese, other, or unknown-language results
instead of relabeling them. Disk scans apply the same check to legacy nHentai
manifests. Add opt-in blocked tags, a different query, or a cookie file kept
outside shell history as needed:

```sh
bun run content:sync:nhentai \
  --query 'tag:"big breasts" -tag:schoolgirl' \
  --blocked-tags schoolgirl \
  --languages english,japanese \
  --limit 20 \
  --cookie-file /path/to/nhentai-cookie.txt \
  --user-agent 'Mozilla/5.0 (...)' \
  --write
```

No tag is blocked unless supplied with `--blocked-tags`.

The sync uses nhentai's current public API v2 and a descriptive default
user-agent. If Cloudflare rejects an API request, a local
[FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) instance can provide
the HTTP 403 fallback:

```sh
docker run -d \
  --name=flaresolverr \
  -p 127.0.0.1:8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest

bun run content:sync:nhentai \
  --flaresolverr-url http://127.0.0.1:8191/v1
```

Direct requests remain the fast path. After an API 403, the sync asks
FlareSolverr to solve the request, then reuses the returned cookies and browser
user-agent for later API and image downloads. Keep the resolver bound to
localhost because its endpoint is unauthenticated. If the sync and resolver run
in separate containers, they should share the same outbound IP so the clearance
cookies remain valid.

A Cookie header can also be supplied through `--cookie-file` with its matching
User-Agent passed through `--user-agent`. Keep credentials outside the repository.

The default destination is `content-sources/nhentai`. Each publication uses the
stable `nhentai-<gallery-id>` identity. Repeat runs compare metadata fingerprints,
skip complete unchanged entries without fetching their pages, atomically repair
or replace changed entries, add newly visible galleries, and never delete older
entries. `.nhentai-sync.json` records the last merge report.

Provider results are stored in the local content catalog and excluded from
version control. Afterleaf has no bundled content fallback: use local
CBZ/ZIP/CBR/RAR imports, image folders, or an installed provider to populate the
library.

After syncing, create a runtime-ready snapshot through the ordinary pipeline:

```sh
bun run content:seed \
  --catalog content-sources/nhentai \
  --tags big-breasts \
  --languages english,japanese \
  --limit 20 \
  --seed afterleaf-big-breasts-v1 \
  --out content-packs/big-breasts-v1
```

The application-owned coordinator splits local discovery from network
acquisition. Import local archives and image folders and rescan everything under
`content-sources` without contacting nHentai:

```sh
bun run library:scan --write
```

Fetch 20 unseen galleries, skipping complete local and blacklisted IDs while
paging, then update pooled assets and activate a fresh catalog revision:

```sh
bun run library:fetch-more \
  --write \
  --cookie-file /path/to/nhentai-cookie.txt \
  --user-agent 'Mozilla/5.0 (...)'
```

The in-app tag blacklist is an acquisition filter: **Fetch more** skips remote
publications with matching tags, while publications already downloaded remain
eligible for every library revision. Removing existing matching publications
is a separate, explicit discard or source-library cleanup operation.

Each run writes a small catalog under `content-packs/library/revisions/<id>` and
atomically advances `content-packs/library/index.json`. Immutable book assets
live in `content-packs/library/assets`; unchanged publications retain their
existing asset paths, while new or updated publications and affected shelf
atlas shards are written under the new revision ID. A failed download, asset
update, or activation leaves the previous catalog active. Retired catalog and
asset directories are moved out of the serving path and garbage-collected by an
isolated process. The coordinator reports its `syncing`, `seeding`, and
`activating` phases plus publication-level additions, updates, removals, and
unchanged entries.

Removing a publication permanently from future scans is a separate operation;
it never downloads or implicitly scans:

```sh
bun run library:blacklist --publication-id nhentai-12345
bun run library:blacklist --list
```

The atomically written, server-side list lives at
`content-packs/library/publication-blacklist.json` and survives catalog
activation.

The in-app trashcan also retires matching app-managed source directories. A
managed archive inside the Afterleaf project is removed with its prepared
catalog entry. Media referenced from outside the project through
`afterleaf.library.json` is only blacklisted and removed from Afterleaf's local
cache; the external archive or image folder is never deleted.

The application automatically selects the active catalog revision in
`content-packs/library/index.json` on startup. During local development and
local `vite preview`, its Vite adapter resolves the catalog and shared asset
roots for every request while following later revision changes.
The Escape menu keeps **Import & scan** and **Fetch more** as distinct actions.
Import & scan is local only, imports or refreshes archives and image folders from
the default and `afterleaf.library.json` media paths, and shows its elapsed time
while rebuilding the combined local catalog. Fetch more uses a bounded,
same-origin localhost endpoint; its dialog can also remember an opt-in boot fetch.
Configure optional provider authentication on the server process rather than
sending it through the browser:

```sh
AFTERLEAF_NHENTAI_COOKIE_FILE=/path/to/nhentai-cookie.txt \
AFTERLEAF_NHENTAI_USER_AGENT='Mozilla/5.0 (...)' \
AFTERLEAF_FLARESOLVERR_URL=http://127.0.0.1:8191/v1 \
bun run dev
```

The bridge accepts no browser-supplied paths, query arguments, cookies, or
user-agent values. It prevents overlapping runs, invokes the fixed scan, fetch-more, or
blacklist command, and returns only revision/change counts. A physical discard
waits for blacklist persistence and managed-source retirement before tossing
the held book into the shop's trashcan. After activation, Solid retains the previous resource value while it
fetches the new catalog, so the running Three scene and Rapier world remain
mounted.

An individual non-library pack can still be selected explicitly:

```sh
AFTERLEAF_CONTENT_PACK=content-packs/big-breasts-v1 bun run dev
AFTERLEAF_CONTENT_PACK=content-packs/big-breasts-v1 bun run build
```

If the variable is absent or does not point to a valid `catalog.json`, the app
starts with an empty library. Production builds do not embed a content pack;
running one through local `vite preview` overlays the active local library
from disk without embedding it in the build. The library UI loads the selected
pack's catalog on startup. The library-operation endpoints exist only
on the local development host; a packaged Electron edition must expose the same
coordinator through a narrow preload/main-process bridge. The browser never
receives acquisition credentials; downloads run through the bounded local
coordinator.

## Import archive publications

Put one publication in each `.cbz`, `.zip`, `.cbr`, or `.rar` file beneath
`content/books/comics` for left-to-right books or `content/books/manga` for
right-to-left books. Archive names supply the same language and magazine
inference hints as image-folder names.

The `comics` and `manga` direction applies recursively. Files placed directly
under `content/books` have unspecified reading direction. An explicit `[LTR]` or
`[RTL]` filename hint is also accepted; a conflict between the filename and
direction directory rejects that archive.

CBR/RAR input supports RAR 4 and RAR 5. Encrypted and multi-volume archives are
not supported.

**Import & scan** in the Escape menu is the normal workflow and requires no
separate import command. Its CLI equivalent is `bun run library:scan --write`.
To preflight a set manually without writing anything:

```sh
bun run content:import-cbz \
  --archives content/books \
  --out content-sources/catalog \
  --tags big-breasts
```

Add `--write` after reviewing the report only when using the importer directly.
English is the catalog-language fallback, Japanese is accepted through a
bracketed/trailing name hint, and Chinese/other recognized languages are
skipped. Language does not imply page layout. Reading direction is set by a
`comics/` or `manga/` direction directory, or by an explicit `[LTR]` or
`[RTL]` filename hint; otherwise it remains unspecified and the player's configured
default applies. Moving an unchanged imported archive into or between the
direction directories refreshes its direction and source path on the next
import while preserving edited publication metadata. Replacing an archive in
place refreshes its fingerprint, page count, and shelf sources on the next
**Import & scan** while also preserving edited metadata.

The importer also prepares each publication manifest, so `content:prepare` is
not needed afterward. To build and activate a local library snapshot containing
the imported publications, run:

```sh
bun run library:scan --write
```

The Escape-menu action loads the activated revision into the running shop as
soon as it completes. When using the CLI directly, refresh the application;
Afterleaf then selects the active revision from
`content-packs/library/index.json`.

Library revisions are incremental. Unchanged publication derivatives retain
their existing pooled paths without being copied or relinked. Removed or
blacklisted publications are omitted, and only atlas shards whose membership or
publication content changed are regenerated.

The importer does not call system archive commands or unpack whole publications.
It inspects ZIP or RAR headers and rejects:

- encrypted, symbolic-link, absolute, traversal, duplicate, and case-colliding
  entries;
- unsupported compression methods;
- more than 2,000 entries or 1,000 images;
- a source entry over 128 MiB, an archive over 2 GiB compressed/uncompressed,
  or an entry over a 200:1 compression ratio; and
- archives containing no AVIF, JPEG, PNG, or WebP entries.

With `--write`, only the first and last AVIF, JPEG, PNG, or WebP entries are
decoded to generate small front/back shelf sources. The local manifest records
the archive fingerprint, page count, and archive location. The original archive
remains in place and metadata such as `ComicInfo.xml` is never materialized.

Opening an unmaterialized reader page decompresses just that archive entry,
validates and converts it to a bounded WebP, and serves it through the local
sparse-page endpoint. RAR uses an isolated temporary single-entry extraction
that is removed immediately. Recent conversions use a bounded 128 MiB in-memory
LRU cache. They are returned with `Cache-Control: private, max-age=3600`, so the
browser can privately cache them for up to one hour. Afterleaf writes no
converted reader-page cache to its content storage.

## Prepare image folders

`content:prepare` creates the sidecar manifests expected by `content:seed`. Its
root contains one directory per publication; images inside each publication may
be nested in folders such as `pages/`.

```text
content-sources/catalog/
├── Comic Moon Rabbit 2026-07 [English]/
│   ├── cover.jpg
│   └── pages/{001.jpg,002.jpg,...}
└── Night Office 03 [Japanese]/
    └── {001.webp,002.webp,...}
```

**Import & scan** prepares and refreshes these manifests automatically. For an
optional CLI preflight, preview the inferred manifests with:

```sh
bun run content:prepare \
  --root content-sources/catalog \
  --tags big-breasts
```

Add `--write` to create the manifests when using this lower-level command.
Existing manifests are preserved unless `--write --force` is used; the UI scan
uses its own metadata-preserving image-list refresh.

English is the fallback language. Bracketed or trailing `English`/`Japanese`
hints override it, while recognized Chinese and other language hints are
skipped. `--language japanese` changes the fallback for a Japanese-only source
folder. Image paths use natural numeric ordering, so `2.jpg` precedes `10.jpg`.

The first magazine recognizers handle names such as:

- `Comic Kairakuten 2024-05 [English]` → family `comic-kairakuten`, issue
  `{year: 2024, month: 5}`;
- `COMIC ExE 40` → family `comic-exe`, issue `{number: 40}`.

These inferred fields are written as structured `groupId`, `kind`, and `issue`
metadata and are also reflected in normalized tags. The preparation report makes
every inference and skipped folder visible for review.

## Catalog layout

Each publication is a directory containing `publication.json` and its images:

```text
content-sources/catalog/
└── moon-rabbit-01/
    ├── publication.json
    └── pages/
        ├── 001.png
        ├── 002.png
        └── 003.png
```

The manifest is explicit about source metadata and technical capabilities.
`front`,
`back`, and `spine` are optional; the first page, last page, and binding-side
strip of the front are used when they are absent.

```json
{
  "schemaVersion": 1,
  "id": "moon-rabbit-01",
  "groupId": "moon-rabbit",
  "title": "Comic Moon Rabbit 01",
  "language": "english",
  "tags": ["big breasts", "magazine", "comedy"],
  "assets": {
    "pages": ["pages/001.png", "pages/002.png", "pages/003.png"]
  },
  "physical": {
    "trim": "B5",
    "thicknessMm": 12,
    "readingDirection": "ltr"
  }
}
```

Supported input image formats are AVIF, JPEG, PNG, and WebP. A publication may
contain at most 1,000 pages; individual sources are capped at 100 megapixels and
128 MiB. IDs are filesystem-safe lowercase slugs. Catalog traversal ignores
symlinks, and every resolved asset path must remain inside its publication
directory.

## Seed a 20-publication visual set

From the repository root:

```sh
bun run content:seed \
  --source local-catalog \
  --catalog content-sources/catalog \
  --tags big-breasts \
  --match all \
  --languages english,japanese \
  --limit 20 \
  --seed afterleaf-big-breasts-v1 \
  --out content-packs/big-breasts-v1
```

English matches are selected before Japanese matches. Chinese and other
languages are skipped and recorded in `seed-report.json`. Within each language,
the seed gives a stable order. The limit is applied only after manifests and
images validate, so malformed candidates do not consume slots.

Near-identical titles in the same language are associated as alternate editions
before the limit is applied. Matching ignores case, punctuation, leading zeroes
in numbers, the `Uncensored` edition marker, and bracketed supported-language
markers such as `[English]`, `[ENG]`, `[Japanese]`, and `[JPN]`, plus `[Digital]`.
Recognized markers are removed only after title text has begun; an initial
bracketed credit such as `[Horori]` remains part of the identity. An uncensored
edition is always chosen as the canonical publication. Its generated `tags` are
the union of the editions' tags, while `originalTags` remains the canonical
edition's own tag set and every `alternates` entry keeps that edition's ID,
title, original tags, provenance, and page-zero asset. Source manifests are
never rewritten by this association, so changing the title match restores
independent publications without retaining previously merged tags.

Use `--dry-run` to inspect the selection without writing. Existing output is
never replaced unless `--force` is passed; replacement uses a staging directory
and rename so an interrupted build does not leave a partial pack.

## Generated pack

```text
content-packs/big-breasts-v1/
├── catalog.json
├── preview.html
├── seed-report.json
├── atlases/
│   ├── front.webp
│   ├── back.webp
│   └── spine.webp
└── publications/<publication-id>/
    ├── front.webp
    ├── back.webp
    ├── spine.webp
    └── pages/*.webp
```

Shelf surfaces are fixed-size atlas cells. Front and back surfaces derive from
the source art; spine textures render the publication title on a deterministic
book-cloth treatment rather than cropping a sliver of the cover. Individual
spine derivatives preserve the aspect ratio of each publication's physical
thickness so their lettering is not compressed when mapped onto the book.
Runtime-ready WebP reader pages are copied byte-for-byte when they are no larger than 2048
pixels on either axis, no larger than 2 MiB, and need no orientation correction.
Other reader images preserve their aspect ratio and are normalized to quality-88
sRGB WebP capped at 2048 pixels. Catalog, atlas, and per-publication hashes make
repeated seeds auditable.
`preview.html` is a self-contained metadata/contact-sheet view that references
only those pack-local cover, spine, and atlas derivatives. Open it directly from
disk to evaluate the set without starting a dev server or decoding reader pages.
The current shop renders each book from its individual front and spine assets;
the atlases are generated for visual auditing and the later batched shelf
renderer, so they are not the texture source for the current mesh implementation.
