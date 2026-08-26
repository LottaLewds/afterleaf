# Refactor checklist

Behavior-preserving cleanup plan from the game-code architecture scan. Keep gameplay, input precedence, save compatibility, and rendering behavior unchanged unless a test documents an intentional change.

## Guardrails

- [x] Add characterization tests before changing interaction, book lifecycle, or save behavior.
- [x] Prefer pure decision helpers and narrow capability slices over passing the entire `ShopScene`.
- [x] Run `bun check` after each coherent refactor group.
- [x] Avoid broad class splitting when a function extraction or shared resolver removes the complexity.
- [x] Leave `ShopTelevision` and most of `ShopPhysicsWorld` alone unless a focused change requires them; they are large but comparatively cohesive.

The characterization boundary now includes the interaction view, scanner, input
routing, target-state transitions, book state/physics transitions, catalog
arrivals, and current/legacy save shapes.

## 1. Remove dead reader paths

- [x] Confirm that no external consumer depends on the old reader implementation.
- [x] Delete `src/game/BookInspectScene.ts`.
- [x] Delete `src/components/BookInspectViewport.tsx`.
- [x] Delete `src/components/PublicationReader.tsx`.
- [x] Verify that `App` → `ShopViewport` remains the only active reading path.

These files are unused within the repository and account for approximately 1,980 lines.

## 2. Consolidate interaction state

- [x] Add focused tests for interaction-mode and target-precedence behavior before refactoring:
  - [x] `GameStateEmitter`: prompts and interaction rows agree in every mode.
  - [x] `InteractionScanner`: arcade, television, prop, sign, frame, poster, and book precedence remains stable.
  - [x] `ShopInputController`: action and wheel routing remains stable.
  - [x] Carrying, inspection, placement, pointer-lock, and arcade-session transitions clear stale targets.
- [x] Introduce one explicit interaction view/resolver containing the active mode, target, prompt, and available actions.
- [x] Make `GameStateEmitter` consume that resolver instead of maintaining separate prompt and interaction-mode chains.
- [x] Extract `InteractionScanner` target-clearing and target-candidate helpers; keep the raycast precedence in one readable pipeline.
- [x] Split `ShopInputController.handleActionDown` by mode or command group.
- [x] Split `ShopInputController.handleWheel` into inspection, placement, carried-prop, carried-book, media, and shelf handlers.
- [x] Fold `ShopInteractionCoordinator` into the shared interaction command layer; `createShopInteractionCommands` is now a closure over its narrow host.
- [x] Fold the thin `ShopTargetingController` into the target-state layer; `createShopTargetState` owns its side effects and reset behavior.

The interaction orchestration methods are now below the configured complexity threshold; remaining hotspots are cohesive domain methods listed in the complexity section.

## 3. Reduce extraction-generated host ceremony

- [x] Move shared data types such as `MovablePropRecord`, `ShelfTargetSelection`, `SpineShelfDefinition`, `ShopInteraction`, and `ShopGameSnapshot` from `ShopScene.ts` into a neutral `shopTypes.ts` module.
- [x] Replace repetitive host factories in `ShopScene` with grouped capability slices for world, books, media, and input; targeting remains a stateful boundary because its construction order is intentional.
- [x] Keep accessors only for values that genuinely change; pass stable runtime objects directly where safe.
- [x] Remove the double accessor around `MovablePropLifecycleHost.tvScreenLighting`.
- [x] Remove the double accessor around `ShopInputHost.onMediaChannelCreateRequest`.
- [x] Re-run the complexity scan and compare total source lines after the host cleanup.

The refactor removes approximately 1,980 unused reader lines, and `ShopScene.ts`
is 155 net lines shorter relative to the refactor baseline despite the new
capability grouping and tests.

Do not replace dependency injection with a monolithic `ShopScene` reference; the goal is fewer adapters with clearer, narrower dependencies.

## 4. Simplify book lifecycle and presentation

- [x] Add tests for carry, drop, throw, shelve, discard, catalog replacement, arrival, and save restoration through the state, physics, command, roster, and save characterization suites.
- [x] Extract the repeated post-carry mutation refresh sequence from `BookCarryActions`.
- [x] Separate catalog/save decisions from rendering and physics synchronization in `ShopBookLifecycle.syncBooks`.
- [x] Split `ShopBookPresentation.animate` into inspection, physics-book, shelf-preview, and loose-book paths.
- [x] Keep the existing physics and texture ownership boundaries while reducing host lookups.

## 5. Isolate save migration

- [x] Add tests for current saves and each supported legacy save shape.
- [x] Move TV-cave, legacy trash-can, and pre-seeding migration logic into `worldSaveMigration.ts`.
- [x] Keep `ShopWorldPersistence` focused on compatibility checks, save adoption, scheduling, and persistence.
- [x] Define a save-version cutoff before removing legacy migration behavior; retain the current legacy field migrations until the next world-save schema version is shipped and migrated.

## 6. Split movable-prop responsibilities only when needed

- [x] Add focused tests around movable-prop registration and physics registration, with save migration and world-physics suites covering restoration and built-in-prop persistence boundaries.
- [x] Separate stable movable-prop registry record construction from spawn/model-loading operations in `movablePropRegistry.ts`.
- [x] Keep placement and persistence sessions explicit inside the lifecycle; do not split special television, arcade, ceiling-light, and trash-can behavior into abstractions that hide their side effects.
- [x] Keep genuinely distinct spawn kinds explicit; use the existing asset-id branches because their side effects differ.

## 7. Complexity ratchet

- [x] Add `eslint/complexity` to `.oxlintrc.json` with `variant: "modified"`.
- [x] Drive the interaction hotspots below complexity 30.
- [x] Drive remaining game functions below complexity 20 where practical.
- [x] Change the game-code rule to error after the game baseline reached the threshold.
- [x] Add tests alongside the interaction, save, command, and registry reductions so the metric does not encourage behavior-changing shortcuts.

The configured `src/game` complexity scan is clear at `max: 20` with an error
level rule. Existing non-game content and build-pipeline hotspots remain outside
this game-specific ratchet and were not behaviorally changed.

## Small cleanup while touching nearby code

- [x] Remove stale orphan comments left behind in `ShopScene.ts` and `movablePropSystem.ts`.
- [x] Extract the duplicated shelf-book candidate collection in `InteractionScanner`.
- [x] Replace the `INTERACTION_DISTANCE` alias with the correctly named constant or document why the two distances must remain coupled.
- [x] Review the redundant MangaDex status comparison separately from the game refactor; simplify it to the equivalent single lower-bound check and cover retry/non-retry behavior.
- [x] Review and remove the existing non-null warnings separately from the game refactor.
