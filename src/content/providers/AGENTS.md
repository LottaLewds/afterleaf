# Content provider implementation instructions

When adding or changing an Afterleaf content provider:

1. Read `docs/CONTENT_PROVIDERS.md`, `publicSdk.ts`, `types.ts`, `sdk.ts`, and
   one existing provider before editing code.
2. Add a self-contained provider directory with `afterleaf-provider.json` and
   an entry exporting `createProvider(context)`. Do not edit a registry, the
   Vite config, HTTP routes, or UI to register it.
3. Prefer an official documented API. Keep remote DTO parsing inside the
   provider and validate every untrusted response before using it.
4. Use `createRepresentativePagePlan(pageCount)` for the default local sample.
   Keep initial `assets.pages` contiguous at pages 1, 2, and 3; use page N as
   `assets.back`; and retain the full `pageCount`. The plan may include
   transient interior dimension samples that are not stored as preview assets.
   Lazily materialize other pages by their true one-based number.
5. Treat `defaultQuery`, `defaultLanguages`, and `defaultBlockedTags` as UI
   defaults. Honor the final values in `LibraryProviderSyncOptions`; do not
   silently re-add defaults the user removed.
6. Use stable remote-derived IDs, deterministic metadata hashes, staging plus
   atomic rename, bounded concurrency, source-aware retry delays, and clear
   diagnostics. A dry run must not write.
7. Keep credentials in provider-prefixed environment variables or ignored
   local files. Never add secrets, downloaded publications, or live remote
   responses to the repository.
8. Use synthetic fixtures and injected clients/fetchers. Test malformed data,
   filtering, short page counts, retries, dry runs, interrupted writes,
   unchanged reruns, and sparse-page metadata mismatches.
9. A version-1 plugin must produce paginated publications supported by
   `PublicationKind`. Propose a new versioned capability instead of forcing
   unrelated media such as audio, video, or raw EPUB into this contract.
10. Run `bun check` from the repository root after the implementation.
