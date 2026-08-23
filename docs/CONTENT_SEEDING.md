# Content acquisition

The commands here prepare local source catalogs for the library scanner. Use
the in-game **Scan new** action (or `bun run library:scan --write`) to build the
optimized library from them.

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

### nHentai search expressions

The **Fetch more** dialog and `--query` accept nHentai search expressions.
Separate expressions with spaces to combine them, and quote values containing
spaces. Prefix any expression with `-` to exclude its matches instead of
requiring them.

The expressions most useful for Afterleaf acquisition are:

| Include expression           | Exclude expression            | Filter                        |
| ---------------------------- | ----------------------------- | ----------------------------- |
| `tag:"full color"`           | `-tag:"full color"`           | Tag                           |
| `artist:"artist name"`       | `-artist:"artist name"`       | Artist                        |
| `parody:"series name"`       | `-parody:"series name"`       | Parody or source series       |
| `character:"character name"` | `-character:"character name"` | Character                     |
| `group:"group name"`         | `-group:"group name"`         | Group or circle               |
| `pages:20`                   | `-pages:20`                   | Page count (`N`)              |
| `favorites:1000`             | `-favorites:1000`             | Favorites count (`N`)         |
| `title:"some title"`         | `-title:"some title"`         | English or display title text |
| `jtitle:"Japanese title"`    | `-jtitle:"Japanese title"`    | Japanese title text           |

nHentai also accepts the following expressions, but Afterleaf normally does
not need them:

| Include expression   | Exclude expression    | Filter                    | Why it is usually redundant                                                                             |
| -------------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `language:english`   | `-language:english`   | Language                  | The fetch dialog already selects allowed languages, and the importer validates every result's language. |
| `category:doujinshi` | `-category:doujinshi` | Category                  | This provider is registered for doujinshi acquisition.                                                  |
| `uploaded:30d`       | `-uploaded:30d`       | Upload age in days (`Nd`) | Afterleaf requests newest-first results and stops at its configured search-page limit.                  |

For example, require two tags:

```text
tag:"big breasts" tag:"full color"
```

Search a title while excluding a tag and language:

```text
title:"some title" -tag:schoolgirl -language:chinese
```

Combine creator and publication filters:

```text
artist:"artist name" character:"character name" -parody:"series name"
```

Search Japanese title text with count filters:

```text
jtitle:"Japanese title" pages:20 favorites:1000
```

The leading `-` belongs before the whole expression (`-tag:schoolgirl`, not
`tag:-schoolgirl`). Afterleaf passes expressions containing `:` through to the
provider. Plain input without `:` is normalized as one tag, so use explicit
prefixes when combining fields.

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

The default destination is `afterleaf-data/providers/nhentai`. Each publication uses the
stable `nhentai-<gallery-id>` identity. Repeat runs compare metadata fingerprints,
skip complete unchanged entries without fetching their pages, atomically repair
or replace changed entries, add newly visible galleries, and never delete older
entries. `.nhentai-sync.json` records the last merge report.

Provider results are stored in the local content catalog and excluded from
version control. Afterleaf has no bundled content fallback: use local
CBZ/ZIP/CBR/RAR imports, image folders, or an installed provider to populate the
library.

The application-owned coordinator splits local discovery from network
acquisition. Rescan the local library and provider caches under
`afterleaf-data/providers` without contacting nHentai:

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

Each run writes a small catalog revision under
`afterleaf-data/game/.cache/library/revisions/<id>` and atomically advances
`afterleaf-data/game/.cache/library/index.json`. Book assets live in the
content-keyed pool at `afterleaf-data/game/.cache/library/assets`: every
derivative's filename embeds a hash of its bytes, so unchanged publications
never get rewritten, linked, or copied on any filesystem — including Windows
drives formatted exFAT/FAT32 that do not support hard links. The pool holds
only the shelf and inspect textures (covers, spines, shelf atlases); interior
reader pages are streamed from `providers/` or local archives on demand, so
the pool stays small regardless of how many pages your library contains. A
failed download, asset update, or activation leaves the previous catalog
active. Assets orphaned by changed or removed books are quarantined and
garbage-collected by an isolated process after the next successful activation.
The coordinator reports its `syncing`, `seeding`, and
`activating` phases plus publication-level additions, updates, removals, and
unchanged entries.

Removing a publication permanently from future scans is a separate operation;
it never downloads or implicitly scans:

```sh
bun run library:blacklist --publication-id nhentai-12345
bun run library:blacklist --list
```

The atomically written, server-side list lives at
`afterleaf-data/game/publication-blacklist.json` and survives catalog
activation.

The in-app trashcan also retires matching app-managed source directories. A
managed archive inside the Afterleaf project is removed with its prepared
catalog entry. Media referenced from outside the project through
`afterleaf.library.json` is only blacklisted and removed from Afterleaf's local
cache; the external archive or image folder is never deleted.

The application automatically selects the active catalog revision in
`afterleaf-data/game/.cache/library/index.json` on startup. During local development and
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

## Import archive publications

Put one publication in each `.cbz`, `.zip`, `.cbr`, or `.rar` file beneath
`afterleaf-data/content/comics` for left-to-right books or
`afterleaf-data/content/manga` for right-to-left books. Archive names supply the same language and magazine
inference hints as image-folder names.

The `comics` and `manga` direction applies recursively. Files placed directly
directly under `afterleaf-data/content` have unspecified reading direction. External archive roots
can use `comicPaths` or `mangaPaths` in `afterleaf.library.json` to apply the
same direction to every publication below that root. An explicit `[LTR]` or
`[RTL]` filename hint is also accepted; a conflict between the filename and
direction directory rejects that archive.

CBR/RAR input supports RAR 4 and RAR 5. Encrypted and multi-volume archives are
not supported.

**Import & scan** in the Escape menu is the normal workflow and requires no
separate import command. Its CLI equivalent is `bun run library:scan --write`.
To preflight a set manually without writing anything:

```sh
bun run content:import-cbz \
  --archives afterleaf-data/content \
  --out afterleaf-data/game/.cache/prepared \
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
`afterleaf-data/game/.cache/library/index.json`.

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

`content:prepare` creates the sidecar manifests consumed by the library scanner. Its
root contains one directory per publication; images inside each publication may
be nested in folders such as `pages/`.

```text
afterleaf-data/game/.cache/prepared/
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
  --root afterleaf-data/game/.cache/prepared \
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
afterleaf-data/game/.cache/prepared/
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
