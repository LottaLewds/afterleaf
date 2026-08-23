# Library Restructure Plan

## Motivation

- The three-folder split (`content/`, `content-packs/`, `content-sources/`) confuses users, and `world-save.json` plus its backups live somewhere unexpected.
- Users want a simple export/import story: if every non-code file lives under one root, copying that folder is a complete backup.
- The per-snapshot asset pool (`assets/<snapshotId>/`) is populated by hard-link-or-copy (`src/content/seed.ts:824-839`). On filesystems without hard-link support (exFAT/FAT32 external drives, SMB/NAS mounts — common on Windows), the fallback silently performs full byte copies, which is how asset pools can grow to tens of GB.
- Snapshots are not a rollback feature: `RETAINED_SNAPSHOT_COUNT = 1` (`snapshotIndex.ts:12`) keeps exactly one revision, and activation immediately evicts its predecessor to garbage collection. They exist purely as a transaction mechanism during scans/imports.

## Decisions

| Decision              | Choice                                       |
| --------------------- | -------------------------------------------- |
| Migration             | Manual/scripted only (CLI migrate command)   |
| Asset pool            | Content-keyed paths; no linking required     |
| Snapshot history      | None; last-only, transactional as today      |
| Config file           | Moves into the data root                     |
| Don't-touch signaling | Plain directory names + generated README.txt |
| demo-v1 pack          | Deleted (verified: zero code references)     |

## Final layout

```
afterleaf-data/                      <- copy-paste this = complete export/import
├── README.txt                       <- generated at boot if missing; explains each dir
├── afterleaf.library.json           <- moved here from repo root (extra-path overrides)
├── content/                         <- USER-FACING (today's mental model, moved inward)
│   ├── comics/                      <- was content/books/comics (LTR)
│   ├── manga/                       <- was content/books/manga (RTL)
│   ├── tv/                          <- was content/channels
│   ├── posters/
│   ├── art-frames/
│   ├── models/
│   └── roms/
├── providers/                       <- machine-managed download caches
│   ├── nhentai/
│   ├── mangadex/
│   ├── weebcentral/
│   └── source-garbage/  scan-failures.log
└── game/                            <- app state; users normally never touch
    ├── publication-blacklist.json   <- elevated from library/ (world-save-class state)
    ├── world-save.json              <- was content/world-save.json
    ├── world-save-backups/          <- was content/world-state-backups
    └── .cache/                      <- fully regenerable; safe to delete to reclaim disk
        ├── prepared/                <- was content-sources/catalog (manifests + covers)
        └── library/                 <- was content-packs/library
            ├── index.json           (active catalog pointer, atomic-rename swap)
            ├── assets/              <- content-keyed pool (see Workstream A)
            └── revisions/           <- tiny JSON-only staging (catalog.json, reports)
```

### What each area is for

- `content/` — user's own media. Drop CBZ/CBR archives into `comics/` (left-to-right) or `manga/` (right-to-left); TV videos into `tv/`, and so on.
- `providers/` — machine-managed download caches for nhentai/mangadex/weebcentral. Deleting forces re-downloads.
- `game/.cache/prepared/` — machine-generated import records: one folder per book with a thin `publication.json` identity manifest (including a `file://` pointer back to the original archive) plus re-encoded front/back cover derivatives. Lets scans enumerate and shelve the library without opening every archive, and preserves book identity across archive renames/moves. Deleting it just forces a re-import.
- `game/.cache/library/` — the derived, optimized game files (asset pool + active catalog pointer). Fully regenerable by rescanning.
- `game/publication-blacklist.json` — discarded-publication IDs that scans must exclude. Elevated next to the world save because it is durable state, not derived data.

## Workstream A — Content-keyed asset pool (fixes Windows duplication)

The core fix. Today every revision builds its own `assets/<snapshotId>/` tree populated by hard-link-or-copy, which silently degrades to full copies on exFAT/FAT32/SMB.

1. **Key assets by derivation, not revision**: paths become `assets/publications/<pubId>/<role>-<hash8>.webp` (same sub-structure as today — `pages/`, `alternates/` — with a short metadataHash embedded in filenames; atlases keyed by member-hash likewise). An unchanged publication means an identical path already exists, so zero writes are needed and no linking is required — works on every filesystem.
2. **Write directly into the pool** for new/changed publications — no staging/promotion dance. Failed scans leave only orphaned files, which GC removes.
3. **Delete** the `reuseAsset`/`hardLinkUnavailable` link-fallback logic and the `promoteLibraryAssetSet` promotion step (`libraryAssetPool.ts`). Retire-unreferenced becomes a simple diff between active-catalog referenced paths and pool contents; the garbage-dir + detached-GC choreography stays.
4. **Keep** the atomic `index.json` flip and last-only retention exactly as-is — snapshots remain purely transactional.
5. Catalog asset URLs become stable across revisions (no `assets/<snapshotId>` prefix), which also improves browser cache hits.
6. Optional cleanup while there: give `src/tv/videoImport.ts:198`'s bare `link()` the same copy fallback for cross-device imports.

## Workstream B — Re-point all path resolution

Update the constants/resolvers in `vite.config.ts` (~lines 138-217): `libraryDirectory`, `acquisitionDirectory`, `tvChannelsDirectory`, `postersDirectory`, `artFramesDirectory`, `modelsDirectory`, `worldSavePath`, `worldStateBackupDirectory`, plus cache paths nested inside them. Also:

- Default `--out` targets in `archiveCli.ts` / `prepareCli.ts`; default roots and registry-marker logic in `libraryMedia.ts`.
- `readAfterleafLibraryConfig`: load from `afterleaf-data/afterleaf.library.json`, fall back to the legacy repo-root location.
- Boot-time README.txt generation into the data root.
- `.gitignore` updates.

## Workstream C — Migration CLI

A `migrate-library` command in the existing `src/content/cli.ts` harness:

1. Detects the legacy layout (any of the old dirs present).
2. Moves each dir into place — plain `rename()` when same volume, else copy-with-progress; never deletes sources before arrival succeeds.
3. Relocates `afterleaf.library.json`; leaves `content-packs/demo-v1` behind with a "safe to delete" note (or removes it with `--force`).
4. Prints an old→new report; refuses to overwrite non-empty destinations.
5. Docs: rewrite the folder sections of `README.md` and `CONFIGURING_YOUR_LIBRARY.md`.

## Workstream D — Tests

Update path expectations in `libraryConfig.test.ts`, `archive.test.ts`, `libraryMedia.ts` fixtures, `service.test.ts`, `snapshotIndex.test.ts`. Add new tests:

- Content-keyed path stability across rescans.
- No-link-required behavior (simulate EXDEV-prone FS; assert zero `link()` calls).
- Migration CLI happy path and refusal cases.

## Execution order

Workstream A first (self-contained, biggest risk), then B + C together (path moves depend on A's new pool shape), D throughout. Run `bun check` at the repository root after each workstream.

## Addendum — Streaming reader pages and legacy pool re-key

Follow-up to Workstream A, implemented after the pool shipped:

- **Interior reader pages are no longer pooled.** The pool holds only shelf/inspect surface derivatives (`front`, `frontDetail`, `back`, `spine`), alternate page zeros, and the shelf atlases. Packed publications carry `pages: []` plus an always-present `pageCount`; `src/catalog.ts` already routes any page without a pooled asset to `/api/library/publications/<pubId>/pages/<n>`, which streams from `providers/` or reads directly out of local CBZ archives (re-encoding through the same ≤2048px webp derivative spec the pool used). This keeps `game/.cache/library/assets` roughly constant instead of growing with every downloaded book.
- **The back cover renders at the back-atlas cell height** (576px) since it now doubles as the back-shelf atlas source; there is no separate pooled `backDetail`. Inspect mode falls back to the small `back` texture for the back cover.
- **Legacy revision-scoped assets are re-keyed in place during reuse** (`rekeyLegacyPublicationAssets` in `seed.ts`): files still living under `assets/<snapshotId>/publications/...` are renamed into their canonical content-keyed names (hashing the file bytes, so a future seed derives identical names without re-encoding). Pooled pages/back details are dropped from the entry, and asset retirement plus the detached garbage collector reclaim the emptied per-snapshot trees after activation — no standalone migration CLI is required; the next normal library scan heals everything.
- **nhentai sync defaults to sparse previews** (3 initial pages + back page, matching the other providers); earlier CLI runs that fell through to the all-pages default are the reason some galleries were fully downloaded.
