# Content provider plugins

Afterleaf discovers content providers from manifests instead of importing them
from the application or Vite configuration. Adding a provider must not require
editing a registry, `vite.config.ts`, the library service, or the browser UI.

Provider code is trusted server code. It runs with the same filesystem,
network, and environment access as Afterleaf; the plugin API is an extension
boundary, not a security sandbox. Only install code you trust.

## Discovery and loading

A plugin is a directory containing `afterleaf-provider.json` and its server
entry module. Afterleaf scans these locations:

1. `src/content/providers/*` for built-in plugins;
2. `content-plugins/*` for local, ignored plugins;
3. each plugin directory, parent directory, or manifest path in the
   platform-delimited `AFTERLEAF_CONTENT_PLUGIN_PATHS` environment variable.

The registry validates all manifests and exposes their descriptors without
executing plugin code. It dynamically imports an entry module only when that
provider is selected for synchronization or sparse-page materialization. This
keeps credentials and remote clients out of browser bundles and avoids making
Vite a second provider composition root.

Provider entries run in a Bun subprocess rooted at the plugin directory. Both
JavaScript and TypeScript entries are supported. A cloned plugin can therefore
own its `package.json`, `node_modules`, `tsconfig.json`, relative imports, and
TypeScript path aliases without inheriting Afterleaf's project configuration.
The same runtime is used by library commands and sparse-page materialization,
so plugins do not depend on Vite or on Afterleaf-private path aliases such as
`~/`.

Afterleaf injects `@afterleaf/provider-sdk` as a virtual runtime package. It is
owned by the installed Afterleaf application and is not downloaded from or
published to a package registry. JavaScript and TypeScript plugins import the
same stable package name:

```ts
import {
  createRepresentativePagePlan,
  type LibraryProviderPluginModule,
} from "@afterleaf/provider-sdk";
```

The SDK exports the version-1 provider interfaces, normalized publication
schema types and constants, validation and normalization helpers, publication
identity inference, and representative-page planning. It does not expose the
rest of Afterleaf's application internals.

Each operation receives a fresh runtime and provider instance. Plugins should
keep durable authentication or synchronization state in their directory or an
external service rather than relying on module globals between operations.

Built-in providers are the exception to the project-root rule: their runtime is
rooted at the Afterleaf application so their existing development dependencies
remain resolvable. Provider source should still use relative imports for its
own files and `@afterleaf/provider-sdk` for host-owned contracts so the folder
can be moved to a separately hosted repository unchanged.

## Installing a local plugin

Clone a trusted plugin as one direct child of `content-plugins`:

```text
content-plugins/
  example-provider/
    afterleaf-provider.json
    package.json
    tsconfig.json
    src/plugin.ts
```

If it has dependencies, run `bun install` in `example-provider`. Afterleaf does
not install dependencies or run package lifecycle scripts during startup. A
future plugin manager can automate cloning, updating, and explicit dependency
installation without changing the manifest or runtime contract.

The development server discovers manifests when its configuration loads, so a
plugin cloned while it is already running appears after the next server start.

JavaScript plugins need no SDK installation. For TypeScript editor and
type-checker resolution, a plugin installed at the standard path can point the
bare package name at the host-owned declarations without adding a dependency:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "paths": {
      "@afterleaf/provider-sdk": ["../../src/content/providers/publicSdk.ts"]
    },
    "strict": true
  }
}
```

That relative path is intentionally installation-layout specific: the plugin
repository is cloned directly under Afterleaf's `content-plugins` directory.
A future plugin manager can generate this mapping or a local declaration link.
Plugin repositories that also type-check outside an Afterleaf installation can
keep a small versioned declaration shim for development; runtime imports should
still use `@afterleaf/provider-sdk`.

## Manifest

Use `docs/schemas/afterleaf-provider.schema.json` for editor and generator
validation. A minimal manifest looks like this:

```json
{
  "$schema": "../../docs/schemas/afterleaf-provider.schema.json",
  "apiVersion": 1,
  "kind": "afterleaf-content-provider",
  "entry": "plugin.js",
  "descriptor": {
    "contentKinds": ["commercial-volume"],
    "defaultBlockedTags": [],
    "defaultLanguages": ["english"],
    "defaultQuery": "",
    "id": "example-manga",
    "name": "Example Manga",
    "queryHelp": "Search by title or creator.",
    "queryLabel": "Title search",
    "queryPlaceholder": "Search titles",
    "requiresLanguageTag": true,
    "summary": "Manga from the Example API"
  }
}
```

IDs are stable, lowercase portable identifiers. The descriptor is the source
for generic UI: query labels, language defaults, shared blacklist defaults,
and technical capabilities. Keep provider-specific credentials
in environment variables or ignored local configuration—not in the manifest.

## Entry module

The entry exports `createProvider(context)`. Its returned descriptor must match
the manifest, and `sync` is required. `materializePage` is optional unless the
provider writes sparse publications.

```js
export const createProvider = ({descriptor, pluginDirectory}) => ({
  descriptor,
  async sync(options) {
    // Search, normalize, optionally write, then return a provider-neutral report.
  },
  async materializePage(request) {
    // Return the original bytes for request.pageNumber (one-based).
  },
});
```

`pluginDirectory` is provided for resolving plugin-owned, non-secret assets.
TypeScript plugins should satisfy `LibraryProviderPluginModule` from
`@afterleaf/provider-sdk`. The runtime provides that package; it must not be
listed as a registry dependency.

## Supported content

API version 1 supports paginated publications representable by Afterleaf's
normalized schema: anthologies, commercial volumes, doujinshi, and magazines.
That covers manga, comics, art books, scanned books, and similar page-based
media. Raw EPUB, prose, audio, and video need a future content capability; a
provider should not disguise them as pages merely to fit this API.

The core owns normalized manifests, blacklist and language preferences,
catalog scanning, atomic catalog revisions, persistent derived assets, runtime
asset serving, and UI state. A revision references immutable assets in the
shared library pool; adding publications does not copy or relink every existing
book into a new directory.
The provider owns remote search semantics, API validation, authentication,
rate limits, retries, metadata mapping, and source-specific diagnostics.

## Acquisition defaults

Use `createRepresentativePagePlan(pageCount)` from
`@afterleaf/provider-sdk`. It selects pages `1, 2, 3, N`, deduplicating short
publications. The first three pages form a contiguous initial preview; page
`N` is the back cover. Keep the full remote `pageCount` and implement
`materializePage` so the reader can lazily request every page by its true
one-based number. Afterleaf may also use this source-level capability during
Import & Scan to perform host-owned migrations. Providers return the requested
source bytes; they do not detect, version, or implement Afterleaf migrations.
Afterleaf registers and orders those migrations centrally, then validates and
atomically persists each successful manifest update.

Providers should use interfaces intended for programmatic access and observe
the source's API terms and rate limits. Keep parsing isolated, bounded,
retryable, and covered by synthetic fixtures.

### Concurrent discovery and acquisition

Providers that can download resolved publications while continuing paginated
search should use `createConcurrentAcquisitionPipeline` from
`@afterleaf/provider-sdk`. The pipeline serializes metadata preparation, bounds
concurrent acquisition, preserves discovery order in its outcomes, drains
started work on failure, and exposes a `started` handle for producer
backpressure. Provider-specific search, filtering, limits, progress messages,
and manifest construction stay in the plugin.

Call `markStarted()` when an acquisition reaches the expensive work that the
search producer may overlap, and always `await pipeline.drain()` before writing
the final sync ledger. Use `pipeline.abort(error)` when discovery itself fails;
this discards queued work while allowing already-started acquisitions to
settle. A dry run should not enqueue acquisitions.

## Local catalog rules

A provider should:

1. derive stable publication and group IDs from remote identities;
2. write through a same-filesystem staging directory and atomically commit;
3. use the shared representative-page helper for the initial cache;
4. include `source.provider`, `remoteId`, `sourceUrl`, `retrievedAt`, and a
   deterministic metadata hash in `publication.json`;
5. preserve available source and license metadata, using `unspecified` when
   those fields are unavailable;
6. normalize tags and include the selected language when the manifest enables
   `requiresLanguageTag`;
7. preserve complete unchanged entries and repair interrupted/incomplete ones;
8. treat `write: false` as a network-light preview and never mutate disk;
9. keep downloaded content, credentials, cookies, and live API fixtures out of
   version control.

## Tests and acceptance

Inject clients or `fetch` and use synthetic responses. Cover malformed remote
data, retries and rate limits, preference filtering, stable IDs, dry runs,
atomic replacement, interrupted staging directories, unchanged reruns,
short-publication page deduplication, and stale sparse-page metadata. A plugin
is complete when `bun check` passes and it can be installed without a core or
Vite source change.

Coding agents working under `src/content/providers` also receive the scoped
instructions in `src/content/providers/AGENTS.md`.
