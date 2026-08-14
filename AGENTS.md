You are an expert in SolidJS and reactive systems. You are also an expert in three.js.

Code conventions:

- Avoid using the non-null assertion operator `!` when possible, prefer re-writing the code to handle the null case.
- Don't remove my comments when you make changes
- When importing from local code, use `~/` instead of relative imports.
- Prefer performant code
- Prefer dependency injection (e.g., taking in isolated Accessors as arguments/props instead of entire objects)
- Prefer all modern ES6 features
- Prefer `this.someFn?.();` over `if (this.someFn) { this.someFn(); }`
- Prefer single line `if` statements when the body of the conditional is simple, for example, `if (dmg > 0) this.takeDmg(dmg);`
- Rather than wrapping something in `if (someVar) { ... }`, prefer `if (!someVar) return;` early returns where possible/sensible to decrease the level of indentation
- Avoid deeply nested ternaries; prefer a POJO lookup or an accessor/helper function instead
- Not everything has to be reactive, this is a game after all
- Our focus is on top performance
- Try to make things reactive with SolidJS reactivity when it makes sense. As you change code, try to change very imperative things to reactive things.
- Avoid explicit class-level getters and setters, preferring to just expose the solid signals or store directly
- Avoid using CSS modules; use TailwindCSS in this project!
- For class composition, prefer a shared `cn(...)` helper when you need conditional Tailwind classes or caller-provided class overrides; keep plain string literals for fully static class lists.
- When using event listeners, prefer `abortController` creation and using `{signal: abortController.signal}` for cleanup
- Look at existing code to discover patterns in the codebase
- Before making any file modification, first commit the current working tree state (skip the commit if the tree is clean). If the project is not a git repository (no `.git`), notify the user instead of committing.
- Run `bun check` (which autofixes, formats, type checks, and run tests) after groups of changes to verify your work
- Do not start or restart dev servers unless I explicitly ask for it. I will run my own servers when I want browser verification.
- Do not add, suggest, or prioritize reduced-motion branches or reduced-motion handling in this project unless I explicitly ask for it.
- In SolidJS, prefer `<Show when={thing()}>{(thing) => ...}</Show>` for conditionals in JSX
- In general, try to use an icon from our icon pack (solid-icons) instead of hardcoding an SVG inline in the HTML.
- Instead of typing `children: ...` in props, use `ParentComponent<Props>` from solid
- Prefer `export const Component = () => {...}` over `export function Component { ... }`
- Prefer `<Show when={props.foo}>...</Show>` over `{props.foo && ...}`
- Run `bun check` at the repository root after your changes; it does `bun format`, `bun lint`, `bun type-check`, unit tests, and the production build in that order
- Run `bun check:ci` in CI or when you want a verify-only pass; it uses the non-autofix formatter and linter
- If you see a constant has inexplicably changed, especially a tuning, balance, color, or visual constant, chances are that I have modified it while you were coding. Mention it if relevant, but don't immediately change it back unless it clearly conflicts with the requested fix.
- Use import { DEV } from "solid-js" for client‑only dev‑only checks (warnings, logging, etc.).
- Use import.meta.env.DEV when the check must respect build mode on both server and client (filtering, gating routes, CSP, etc.).
- Afterleaf will never be SSR'd.
- When moving code, move it to the final path and update imports directly. Do not leave root-level compatibility re-exports behind unless the user explicitly asks for them.
- Do not paper over third-party dependency packaging/runtime problems with local shims, transitive-package aliases, or Vite config hacks. If a library exposes CommonJS/ESM interop issues or similar bundler incompatibilities, prefer a compatible dependency or a root-cause fix; discuss before adding bundler aliases or shims.

# SolidJS Rules

## Mental Model

- MUST: Treat components as setup functions that run ONCE, not render functions.
- MUST: Place reactive work in primitives (`createMemo`, `createEffect`, `<Show>`, `<For>`), not component body. Sometimes, simple `() => { ... }` is fine for a reactive primitive and preferred as a simple accessor, we can optimize it later too.
- MUST: Access signals only inside reactive contexts (JSX expressions, effects, memos).

## Reactivity

- MUST: Call signals as functions: `count()` not `count`.
- MUST: Use functional updates when new state depends on old: `setCount((prev) => prev + 1)`.
- MUST: Keep signals atomic (one per value) — one big state object loses granularity.
- MUST: Use derived functions `() => count() * 2` for cheap/infrequent derivations.
- MUST: Use `createMemo(() => ...)` for expensive/frequent derivations — caches result.
- MUST: Use `createEffect` for side effects only (DOM, localStorage, subscriptions).
- MUST: Call `onCleanup(() => ...)` inside effects for subscriptions/intervals/listeners.
- MUST: Use path syntax for store updates: `setStore("users", 0, "name", "Jane")`.
- MUST: Wrap store props in arrow for `on()`: `on(() => store.value, fn)` not `on(store.value, fn)`.
- MUST: When a `createEffect` is manually subscribing to specific dependencies, prefer `on(...)` instead of reading signals only to establish tracking. Example: prefer `createEffect(on(visiblePostCount, () => { ... }))` over `createEffect(() => { visiblePostCount(); ... })`.
- SHOULD: Use `{ equals: false }` for trigger signals that always notify.
- SHOULD: Use `batch(() => { ... })` when updating multiple signals outside event handlers.
- SHOULD: Use `on(dep, fn)` for explicit effect dependencies.
- SHOULD: Use `untrack(() => value())` to read without subscribing.
- SHOULD: Use `createStore({ ... })` for nested objects with fine-grained reactivity.
- SHOULD: Use `produce(draft => { ... })` for complex store mutations.
- NEVER: Derive state via `createEffect(() => setX(y()))` — use memo or derived function.
- NEVER: Place side effects inside `createMemo` — causes infinite loops/crashes.

## Props

- MUST: Access props via `props.title`, not destructuring.
- SHOULD: Wrap in getter if needed: `const title = () => props.title`.
- SHOULD: Use `splitProps(props, ["keys"])` to separate local from pass-through props.
- SHOULD: Use `mergeProps(defaults, props)` for default values.
- SHOULD: Use `children(() => props.children)` only when transforming, otherwise `{props.children}`.
- NEVER: Destructure props `({ title })` — breaks reactivity.

## Control Flow

- MUST: Use `<For each={items()}>` for object arrays — item is value, index is signal.
- MUST: Use `<Index each={items()}>` for primitives/inputs — item is signal, index is number.
- MUST: Use `<Suspense fallback={...}>` for async, not `<Show when={!loading}>`.
- MUST: Access resource states via `data()`, `data.loading`, `data.error`, `data.latest`.
- SHOULD: Use `<Show when={cond()} fallback={...}>` for conditionals.
- SHOULD: Use `<Show when={val}>` callback for type narrowing: `{(v) => <div>{v().name}</div>}`.
- SHOULD: Use `<Switch>/<Match>` for multiple conditions.
- SHOULD: Use `createResource(source, fetcher)` for reactive async data.
- SHOULD: Use `<ErrorBoundary fallback={(err, reset) => ...}>` for render errors.
- NEVER: Use `.map()` in JSX — use `<For>` or `<Index>`.
- NEVER: Rely on ErrorBoundary for event handler or setTimeout errors — use try/catch.

## Identity & Ownership

- MUST: Treat `<Show keyed>`, `<For>` item references, and other identity-sensitive control flow as ownership/lifecycle boundaries. A changed identity can dispose and recreate the entire child owner, including effects and imperative resources.
- MUST: Use non-keyed `<Show>` by default. Use `keyed` only when a semantic entity/session change intentionally requires teardown and reconstruction.
- MUST: Key expensive or stateful subtrees with a stable semantic identity (for example, an entity ID or explicit session token), not a freshly allocated wrapper object.
- MUST: Preserve reference identity when a memo feeds an identity-sensitive consumer and the semantic entity has not changed. Return the previous value, reconcile stable objects, or expose separate atomic accessors instead of rebuilding `{...}` or `[...]` containers.
- NEVER: Write `<Show keyed when={condition() ? {value: value()} : null}>` or an equivalent fresh object/array key. The allocation remounts the subtree whenever the expression reevaluates.
- SHOULD: Keep expensive imperative runtimes such as Three scenes, physics worlds, and game sessions mounted. Freeze, hide, or reconfigure them through narrow accessors unless teardown is explicitly required.
- MUST: Remember that `onCleanup` belongs to its reactive owner: cleanup inside an effect runs before that effect reruns, while cleanup in a component owner runs when conditional/keyed control flow disposes that owner.
- SHOULD: Ensure objects passed to `<For>` retain stable references across updates. If the UI represents stable slots rather than object identity, use `<Index>` or another slot-based model.

## JSX & DOM

- MUST: Use `class` not `className`.
- MUST: Combine static `class="btn"` with reactive `classList={{ active: isActive() }}`.
- MUST: Use `onClick` for delegated events; `on:click` for native (element-level).
- MUST: Condition inside handler since events are not reactive: `onClick={() => props.onClick?.()}`.
- MUST: Read refs in `onMount` or effects — refs connect after render.
- MUST: Call `onCleanup` inside directives for cleanup.
- SHOULD: Use `on:click` for `stopPropagation`, capture, passive, or custom events.
- SHOULD: Use `style={{ color: color(), "--css-var": value() }}` for inline styles.
- SHOULD: Type refs as `let el: HTMLElement | undefined` with guard.
- SHOULD: Use `use:directiveName={accessor}` for reusable DOM behaviors.
- NEVER: Mix reactive `class={x()}` with `classList`.
