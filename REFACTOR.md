# Refactor checklist

Behavior-preserving cleanup plan from the game-code architecture scan. Keep gameplay, input precedence, save compatibility, and rendering behavior unchanged unless a test documents an intentional change.

## Guardrails

- [ ] Add characterization tests before changing interaction, book lifecycle, or save behavior.
- [ ] Prefer pure decision helpers and narrow capability slices over passing the entire `ShopScene`.
- [ ] Run `bun check` after each coherent refactor group.
- [ ] Avoid broad class splitting when a function extraction or shared resolver removes the complexity.
- [ ] Leave `ShopTelevision` and most of `ShopPhysicsWorld` alone unless a focused change requires them; they are large but comparatively cohesive.

## 1. Remove dead reader paths

- [x] Confirm that no external consumer depends on the old reader implementation.
- [x] Delete `src/game/BookInspectScene.ts`.
- [x] Delete `src/components/BookInspectViewport.tsx`.
- [x] Delete `src/components/PublicationReader.tsx`.
- [x] Verify that `App` → `ShopViewport` remains the only active reading path.

These files are unused within the repository and account for approximately 1,980 lines.

## 2. Consolidate interaction state

- [ ] Add focused tests for interaction-mode and target-precedence behavior before refactoring:
  - [x] `GameStateEmitter`: prompts and interaction rows agree in every mode.
  - [x] `InteractionScanner`: arcade, television, prop, sign, frame, poster, and book precedence remains stable.
  - [x] `ShopInputController`: action and wheel routing remains stable.
  - [ ] Carrying, inspection, placement, pointer-lock, and arcade-session transitions clear stale targets.
- [x] Introduce one explicit interaction view/resolver containing the active mode, target, prompt, and available actions.
- [x] Make `GameStateEmitter` consume that resolver instead of maintaining separate prompt and interaction-mode chains.
- [x] Extract `InteractionScanner` target-clearing and target-candidate helpers; keep the raycast precedence in one readable pipeline.
- [x] Split `ShopInputController.handleActionDown` by mode or command group.
- [x] Split `ShopInputController.handleWheel` into inspection, placement, carried-prop, carried-book, media, and shelf handlers.
- [ ] Fold `ShopInteractionCoordinator` into the shared interaction command layer when its behavior is covered by tests.
- [ ] Fold the thin `ShopTargetingController` into the target-state layer when its side effects are covered by tests.

The interaction orchestration methods are now below the configured complexity threshold; remaining hotspots are cohesive domain methods listed in the complexity section.

## 3. Reduce extraction-generated host ceremony

- [x] Move shared data types such as `MovablePropRecord`, `ShelfTargetSelection`, `SpineShelfDefinition`, `ShopInteraction`, and `ShopGameSnapshot` from `ShopScene.ts` into a neutral `shopTypes.ts` module.
- [ ] Replace repetitive host factories in `ShopScene` with grouped capability slices for world, books, targeting, media, and input.
- [ ] Keep accessors only for values that genuinely change; pass stable runtime objects directly where safe.
- [ ] Remove the double accessor around `MovablePropLifecycleHost.tvScreenLighting`.
- [x] Remove the double accessor around `ShopInputHost.onMediaChannelCreateRequest`.
- [ ] Re-run the complexity scan and compare total source lines after the host cleanup.

Do not replace dependency injection with a monolithic `ShopScene` reference; the goal is fewer adapters with clearer, narrower dependencies.

## 4. Simplify book lifecycle and presentation

- [ ] Add tests for carry, drop, throw, shelve, discard, catalog replacement, arrival, and save restoration.
- [ ] Extract the repeated post-carry mutation refresh sequence from `BookCarryActions`.
- [ ] Separate catalog/save decisions from rendering and physics synchronization in `ShopBookLifecycle.syncBooks`.
- [x] Split `ShopBookPresentation.animate` into inspection, physics-book, shelf-preview, and loose-book paths.
- [ ] Keep the existing physics and texture ownership boundaries while reducing host lookups.

## 5. Isolate save migration

- [x] Add tests for current saves and each supported legacy save shape.
- [x] Move TV-cave, legacy trash-can, and pre-seeding migration logic into `worldSaveMigration.ts`.
- [x] Keep `ShopWorldPersistence` focused on compatibility checks, save adoption, scheduling, and persistence.
- [ ] Define a save-version cutoff before removing legacy migration behavior; do not delete compatibility code opportunistically.

## 6. Split movable-prop responsibilities only when needed

- [ ] Add tests around registration, spawning, placement, restoration, and special built-in props.
- [ ] Separate movable-prop registry operations from spawn/model-loading operations.
- [ ] Separate placement and persistence sessions from special television, arcade, ceiling-light, and trash-can behavior.
- [ ] Prefer a small factory/strategy lookup for genuinely distinct spawn kinds, without hiding their different side effects.

## 7. Complexity ratchet

- [x] Add `eslint/complexity` to `.oxlintrc.json` at warning level with `max: 30` and `variant: "modified"`.
- [x] Drive the interaction hotspots below complexity 30.
- [ ] Drive remaining game functions below complexity 20 where practical.
- [ ] Change the rule to error only after the existing baseline is below the threshold.
- [ ] Add tests alongside each complexity reduction so the metric does not encourage behavior-changing shortcuts.

The configured complexity scan is clear at the current `max: 30` threshold; the remaining ratchet work targets the stricter `20` threshold.

## Small cleanup while touching nearby code

- [ ] Remove stale orphan comments left behind in `ShopScene.ts` and `movablePropSystem.ts`.
- [x] Extract the duplicated shelf-book candidate collection in `InteractionScanner`.
- [x] Replace the `INTERACTION_DISTANCE` alias with the correctly named constant or document why the two distances must remain coupled.
- [ ] Review the redundant MangaDex status comparison separately from the game refactor.
- [x] Review and remove the existing non-null warnings separately from the game refactor.
