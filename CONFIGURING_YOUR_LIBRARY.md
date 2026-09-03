# Configuring Your Library

Afterleaf combines books from local folders and optional online providers into
one library. Your source files stay where they are. Afterleaf builds its own
catalog and optimized assets around them.

## Quick setup

Use the default folders inside `afterleaf-data/content`:

```text
afterleaf-data/content/
  comics/   # Left-to-right
  manga/    # Right-to-left
```

Or open **Options → Additional content locations** and add a folder as
**Comics** or **Manga**. Then choose **Scan new**.

You can also edit `afterleaf.library.json`:

```json
{
  "comicPaths": ["/media/Comics"],
  "mangaPaths": ["/media/Manga"]
}
```

Paths may be absolute or relative to the Afterleaf folder.

## How folders are scanned

Book roots are scanned recursively to any depth:

```text
/media/Manga/
  Author A/
    Book One.cbz
    Series/
      Book Two/
        001.jpg
        002.jpg
  Author B/
    Book Three.cbr
```

- Each CBZ, ZIP, CBR, or RAR archive is one book.
- A folder whose book content consists of images is one book.
- A folder containing nested books is an organizational folder, not a book.
  Loose images directly inside that organizational folder are ignored.
- Hidden folders and symbolic links are not followed.
- Folders and files matched by `.afterleaf-ignore` are skipped (see below).
- Supported images are AVIF, JPEG, PNG, and WebP.

### Ignoring folders with `.afterleaf-ignore`

Place a file named `.afterleaf-ignore` inside any folder you want the scanner
to skip without moving or deleting it. An empty file (or one containing only
blank lines and `#` comments) ignores that folder and everything below it,
like `.gdignore` or `.nomedia`:

```text
/media/Manga/
  unsorted/
    .afterleaf-ignore   # empty: skip unsorted and all of its books
    random-download.cbz
```

For finer control, add one pattern per line. Patterns work like a small,
hierarchical `.gitignore`: `#` starts a comment, `!` negates a match, a
trailing `/` matches directories only, a leading `/` anchors the pattern to
the folder containing the ignore file, and patterns without `/` match the file
or folder name at any depth below it. `*` matches any characters including
`/`, `?` matches a single character, and `[abc]` matches a character class.
Ignore files in subfolders add to (and may override with `!`) the rules from
their parents. Ignored directories are pruned, so a negated pattern cannot
re-include content below an ignored folder.

```text
# in /media/Manga/.afterleaf-ignore:
unsorted/
*.tmp
!keep-this.cbz
```

The same file filters book archives, image-folder books, posters, art-frame
images, TV videos, and models. Ignored archive books are removed from the
prepared catalog on the next **Scan new**, while ignored image folders keep
their on-disk `publication.json` but disappear from the library until the
ignore rule is removed.

Afterleaf writes `publication.json` into an image-folder book. That manifest
stores its stable ID, display title, metadata, and page order. Keep it with the
book when moving or renaming the folder. Unicode display titles are preserved;
the portable internal ID is separate from the displayed title.

An advanced, hand-written `publication.json` may define a book explicitly.
Nested books take priority over an outer manifest.

### Reading direction

- `comicPaths` and `content/comics` are left-to-right.
- `mangaPaths` and `content/manga` are right-to-left.
- The legacy `mediaPaths` setting does not specify a direction.
- `[LTR]` or `[RTL]` in a book name overrides an unspecified root.

Conflicting root and filename directions cause that book to be skipped.

## Library root markers

On its first successful scan, Afterleaf writes
`.afterleaf-library-root.json` inside each configured book root. The marker
identifies the mounted library; you never need to enter or remember its UUID.

After enrollment:

- A matching marker means the root is authoritative, even when empty.
- A missing or different marker locks library updates and preserves the active
  catalog. This prevents an unmounted drive from looking like mass deletion.
- Deleting the last book from a mounted, marked root intentionally removes that
  book on the next scan.

If you accidentally delete the marker, mount the intended storage, open
**Options → Additional content locations**, and choose **Re-enroll** beside the
root. Afterleaf writes a new marker; you do not need the old UUID.

**Re-enroll** is disabled, and the server refuses enrollment, when the folder
contains no supported books. This prevents an empty mountpoint from being
accepted while the real drive is disconnected. An empty new root cannot be
enrolled; add a book first. If a marker is lost after the root has been emptied,
restore at least one real book before re-enrolling.

## Scan actions

### Scan new

This is the normal, fast scan. It:

- scans local roots without loading, contacting, searching, or synchronizing an
  online provider;
- adds, updates, and removes books;
- recognizes unambiguous folder and archive moves;
- preserves stable publication IDs and shelf positions; and
- reuses generated assets for unchanged books.

Use it after changing local files or library paths.

### Deep scan and repair

The wrench button opens the deep-repair options. Every deep repair validates
and rebuilds each local publication and generated asset. The optional provider
actions are:

- **Update older provider metadata**, which may download a few representative
  pages only for cached books that need an upgrade; and
- **Re-download cached provider images**, which refreshes the preview and back
  cover of every cached remote book and is substantially slower.

Both options may contact providers, but neither searches for or adds new books.
Leave both unchecked for a local-only deep repair.

Deep repair is slower than **Scan new**. Use it when source files changed
without being detected, assets appear damaged, or a normal scan reports
persistent problems.

### Fetch more

**Fetch more** asks the selected online provider for unseen books, subject to
the current query, language, limit, and blocked tags. It then runs the shared
disk scan and activates one catalog revision. Newly downloaded books are
written in the current format during import; **Fetch more** does not run legacy
updates across other cached provider books.

Built-in providers currently include:

- **MangaDex** for regular manga;
- **WeebCentral** for English manga; and
- **nHentai** for adult doujinshi.

Additional trusted provider plugins may appear in the same selector. Provider
plugins run as trusted local code, not in a security sandbox. Install only
plugins you trust.

Fetched publications are stored in Afterleaf's managed content directories.
They remain cataloged if a provider is temporarily offline. Discarding one in
the shop blacklists its stable publication ID so later fetches do not restore
it.

## Moving, renaming, and deleting books

- Moving or renaming an image-folder book keeps its ID because its manifest
  moves with it.
- An archive move or rename keeps its ID when its content fingerprint matches
  exactly one missing archive.
- Ambiguous identical copies are not guessed as renames.
- Deleting a book from a completely scanned, marked root removes it from the
  game on the next scan.
- Changing a configured root from a child folder to its parent is supported;
  the parent is scanned recursively and existing manifests preserve identity.

Afterleaf may update metadata after a move, but unchanged covers, pages, and
shelf assets are reused. A preserved publication ID means the book does not
need to be shelved again as a new arrival.

## Common failure modes

| Problem                                      | What Afterleaf does                                               | What you should do                                                        |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Root is missing or its marker does not match | Locks updates and keeps the active catalog                        | Mount the expected storage; use **Re-enroll** only if the marker was lost |
| Root is marked and empty                     | Treats every former book in that root as deleted                  | Restore the books before scanning if this was not intentional             |
| Archive is corrupt or unreadable             | Reports and skips the failed import without deleting source media | Repair or replace the archive, then scan again                            |
| `publication.json` is malformed              | Protects the affected existing book from disappearing             | Fix or restore the manifest, then scan again                              |
| Two books use the same publication ID        | Skips the duplicate identity instead of merging books             | Give each manifest a unique stable ID                                     |
| Online provider is unavailable               | Fails the fetch without replacing the active catalog              | Retry later; local scanning does not require the provider                 |
| Rename match is ambiguous                    | Does not guess which existing book moved                          | Keep each book's manifest or rename one copy at a time                    |

Library activation is transactional. A failed scan does not replace the active
catalog with a partial result. Scanning never deletes source archives or page
images; cleanup is limited to Afterleaf's generated catalog, assets, and marker
state.

## Where Afterleaf stores data

Everything lives in one `afterleaf-data/` folder; copying it is a complete
backup.

- `afterleaf-data/content/comics` and `.../manga`: default local archive roots.
- `afterleaf-data/game/.cache/prepared`: generated manifests and prepared
  provider content. Regenerable.
- `afterleaf-data/game/.cache/library`: optimized assets and the active catalog
  pointer. Regenerable; safe to delete to reclaim disk space (rescan rebuilds).
- `afterleaf-data/game/publication-blacklist.json`: discarded publication IDs.
- `afterleaf-data/providers/<provider>`: downloaded provider caches.
- `.afterleaf-library-root.json`: the mount marker inside each configured book
  root.

Installs from before this layout can be moved with `bun run library:migrate`
(dry-run by default, add `--write`).

For provider development details, see
[`docs/CONTENT_PROVIDERS.md`](docs/CONTENT_PROVIDERS.md).
