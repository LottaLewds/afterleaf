# Afterleaf meta progression

> Status: proposed design  
> Scope: current one-floor game first; later floors are deferred

## Core decision

Afterleaf has no ultimately correct placement for a book. Meta progression must
therefore reward **coherent curation and visible restoration**, not agreement with
a hidden answer key.

Every book may fit several shelves. When metadata exists, tags and physical
properties can make one placement score better than another, but a high score
means “this shelf reads clearly,” not “the designer's intended coordinate was
found.” A library with zero tags must still support the complete progression.
Progress unlocks better ways to carry, find, and move books while leaving shelf
choice to the player.

The intended progression is:

```text
handle a few books
→ build satisfying shelves
→ spot related groups
→ move deliberate batches with a cart
→ restore and freely re-curate the shop
```

There is no grindable or spendable XP, timer, morning deadline, or upgrade that
automatically chooses and fills a shelf.

## Librarian reference

_Librarian: Tidy Up the Arcane Library!_ rewards correctly completed rows with
points for five upgradable spells. Those spells sort the held stack, find or
gather matching books, reveal the correct destination, and automatically shelve
books. Four hidden keys separately unlock movement and carrying upgrades. Its
first completion also unlocks a special stage.

The useful lesson is that visible cleanup should make the remaining job easier.
The warning is that its strongest chain—gather the exact series, reveal its exact
shelf, then auto-place it—can remove the sorting play itself. Players have also
reported that this chain dominates the other upgrades.

Afterleaf should borrow the capability curve but stop before destination solving
or automatic placement.

Sources:

- [Official Steam page](https://store.steampowered.com/app/4197610/)
- [Progress and leveling](https://librarian.gamedb.wiki/mechanics/progress-and-leveling/)
- [Abilities](https://librarian.gamedb.wiki/abilities/)
- [Keys and upgrades](https://librarian.gamedb.wiki/keys/)
- [Player discussion of overpowered magic](https://steamcommunity.com/app/4197610/discussions/0/568162255844215205/)

## Shelf satisfaction score

Each shelf or bay receives a live score with two parts.

**Presentation**, which is always available, considers:

- stable, non-overlapping placement;
- physical format and furniture fit;
- fullness, alignment, and face-out/spine-out presentation; and
- useful ordering for issue or series data when supplied.

**Semantic coherence**, which is optional, considers:

- affinity between its selected controlled tags and the books' weighted tags;
- cohesion among neighboring books;
- shared publication, series, creator, or normalized title metadata; and
- whether nearby shelves remain meaningfully distinct.

The lowest-affinity outlier should matter so a large good group cannot completely
hide a random dump. However, a book receives no penalty merely because it could
also score well elsewhere.

The composite score uses a visible 0–100 scale and four satisfaction bands:

```text
In Progress → Cohesive → Curated → Showcase
```

Band thresholds and factor weights remain tuning data, but the final numeric score
is available to the player. The score normalizes over the evidence available for
that shelf, so absent tags are not treated as zeroes. The shelf card explains one
useful observation, such as “This run has a cohesive supernatural theme” or “One
office-comedy volume breaks the otherwise chronological set.” It never says that
a book is on the wrong shelf.

Evaluation has no confirm or sign-off action. Shelf membership, relative order,
presentation, label, and catalog changes automatically mark the affected score
dirty and recompute it. This is continuous from the player's perspective but
event-driven internally; the result stays invisible until requested.

### Showing the score

The score should live on the physical sign above its shelf, not in a permanent
HUD:

- At rest, the sign shows only the player-authored shelf name and tags.
- Aiming at or inspecting the sign reveals a secondary line such as
  **Shelf satisfaction: 78 · Curated**.
- The advisory receipt can show the score and its presentation/semantic breakdown
  for players who want to optimize further.
- Settings may keep focused scores visible longer, but there is no default
  always-on score overlay across the room.

This makes exact feedback discoverable and spatial: the player looks at the shelf
whose arrangement they want to assess.

Missing metadata is neutral: it provides neither a bonus nor a penalty. Freeform
shelf text is presentation only. When controlled tags exist, the player may
select one primary and an optional secondary tag for scoring; the game does not
try to infer meaning from arbitrary shelf names.

## How progression is earned

The main progression resource is **Stocking XP**:

- Each physical copy awards 1 XP the first time it settles on any real shelf.
- The copy ID records that award, so removing and replacing it cannot farm XP.
- XP is never deducted when the player re-curates a shelf.
- Shelf scores do not affect XP.

Stocking XP is cumulative proof of work, not currency the player spends. Tools
unlock automatically at thresholds scaled to the active restoration batch. The
clipboard shows current XP and the next unlock; shelving a book can produce a
small `+1` on that shelf's sign without adding a permanent HUD counter.

Completion is stricter than XP. Previously awarded XP remains, but the shop is
restored only when every eligible active-batch copy is currently shelved and the
required paths are open.

Newly imported books enter the existing pending-arrival queue. They do not lower
the current batch's completion percentage or move a nearly finished goalpost.
When accepted as a new batch, their new copy IDs provide new Stocking XP.

## Proposed one-floor progression

Threshold percentages refer to the active cohort's book count. Small cohorts
enforce a minimum number of newly shelved books between unlocks so a two-book demo
does not grant the whole kit immediately.

| Milestone               | Requirement                                                     | Reward                                                                                                  |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Closing shift**       | Start the restoration                                           | Carry up to 3 loose books, inspect/read, label shelves, place books, and request evaluation             |
| **Getting started**     | Earn XP worth roughly 10% of the batch                          | **Stack Grip I:** carry up to 5 books                                                                   |
| **Stock taking shape**  | Earn XP worth roughly 25% of the batch                          | **Stock Scanner:** highlight nearby books similar to the held or aimed book                             |
| **A working aisle**     | Earn XP worth roughly 50% of the batch                          | **Stock Cart:** move a large manually selected batch around the floor                                   |
| **Stock under control** | Earn XP worth roughly 75% of the batch                          | **Stack Grip II:** carry up to 8 books and pick up a short contiguous shelf/floor stack                 |
| **Shop restored**       | Every active-batch copy is currently shelved and paths are open | Preserve all tools, unlock aftercare and the next queued arrival batch, and record the final evaluation |

Shelf satisfaction still supplies feedback, final evaluation, and player
satisfaction. It is deliberately not a source of XP or a hard gate on the
logistics kit or completion.

## Unlocks

### Stack Grip

Stack Grip is upgraded carrying capacity, not a separate magical hand. The held
stack remains ordered and physical enough that the player understands what they
are carrying.

- Base capacity: 3 books.
- Stack Grip I: 5 books.
- Stack Grip II: 8 books.
- Holding the pickup action on a contiguous shelf run or stable floor stack fills
  the remaining capacity after showing a preview.
- Every selected book must be physically reachable, and the pickup animation
  visibly moves the nearby books into the held stack.

Exact capacities are tuning values. The important change is fewer repetitive
trips without abstracting an entire shelf into one item.

### Stock Cart

The cart is the primary large-batch logistics reward.

- It holds roughly 24–30 ordinary books, subject to physical-size tuning.
- The player manually loads, pushes, parks, and unloads it.
- Stack Grip can make loading faster after the player chooses a group.
- It does not follow, teleport, sort its contents, or unload into shelves.
- A tipped or obstructed cart must be recoverable without losing books.

The cart improves throughput while preserving route planning and the visible
movement of stock through the shop.

### Stock Scanner

The scanner highlights possible relationships without moving any books. Pointing
it at the held or aimed book briefly outlines similar books where they physically
lie on the nearby floor or shelves. The player must walk to them and pick them up.

Similarity uses the strongest available evidence:

- weighted tags;
- publication, series, circle, artist, or creator metadata;
- normalized title and issue information; and
- physical format as a weak fallback.

The outline can communicate confidence rather than claiming an exact match. Its
range and line-of-sight limit keep the scanner focused on reading the current
mess, not solving the whole store. It never makes books float, pulls them through
other objects, reveals a correct destination, or shelves anything.

Because imported content can have arbitrary user-authored titles and metadata,
the same device also provides fuzzy text search over the active local catalog.

Searchable fields can include:

- title and alternate title;
- publication, series, circle, artist, or creator when supplied;
- issue number and date; and
- user-authored controlled tags.

Only title is expected to exist consistently. Empty optional fields do not reduce
search results or progression.

Results show catalog matches, cover thumbnails where privacy settings permit,
known metadata, and at most the last broad zone in which the player handled a
copy. The scanner does not reveal an exact world coordinate, interpret reader
pages, infer the meaning of freeform shelf text, or recommend one correct shelf.

With title-only content, fuzzy search still works and similarity can use normalized
title or format. If the device lacks enough evidence, it says so rather than
inventing a relationship. Progression never depends on a successful scan.

## Future floors

There is no second playable floor yet, so cross-floor logistics must not be part
of the current progression requirements.

When a second floor exists, the major spatial unlock should be a staff **freight
elevator**, not a dumbwaiter. Restoring it can be a late first-floor or early
second-floor milestone. It should carry the player and cart, remove repeated stair
trips, and preserve manual loading and shelf decisions. Until both floors and
their traversal are implemented, the elevator remains a future design note rather
than promised scope.

## Completion and profile persistence

“Shop restored” means every active-batch book is currently shelved and required
paths are open. Shelf scores shape the final evaluation but do not block
completion. Restoration does not require tags, a minimum satisfaction score, or a
canonical arrangement.

Completion does not end the night. It opens aftercare, where the player can:

- continue rearranging and improve shelf satisfaction for its own sake;
- browse or read any publication;
- accept a queued stock batch without invalidating the completed one; and
- preserve final evaluation receipts or arrangement snapshots.

Mechanical unlocks belong to the current world save. Bookmarks, catalog
discoveries, completed-batch records, and cosmetic receipts can live in a small
profile save. There are no permanent percentage bonuses or prestige resets.

## Implementation notes

- Recompute a shelf only after placement, removal, label, or catalog events; do
  not score every shelf every frame.
- Keep scoring weights in data and test multiple valid arrangements.
- Use stable controlled tag IDs internally even when titles and freeform text are
  entirely user-authored.
- Treat absent semantic metadata as neutral and keep presentation scoring
  independent from semantic scoring.
- Build fuzzy catalog search from normalized text fields; do not use image or page
  analysis at runtime.
- Store unlocked milestones, carrying capacity, total Stocking XP, and the set of
  copy IDs that have awarded XP in the versioned world save.
- Keep the active restoration batch stable across compatible catalog updates and  
  route new IDs through `pendingArrivalIds`.

## Decision

Afterleaf's meta progression rewards the creation of satisfying shelves and a
visibly restored shop. Tags can boost a placement, but missing tags never block
one and tags never establish a single correct destination. Upgrades increase
carrying capacity, highlight a local possible group without moving it, and move
manually loaded batches with a physical cart. They support the player's
curatorial intent; they do not replace it.
