import {describe, expect, test} from "bun:test";
import path from "node:path";

import {
  parseActiveLibraryAssetRequest,
  resolveActiveLibraryAssetPath,
  resolveActiveLibraryStorage,
} from "~/content/libraryUpdate/activeLibraryAssets";
import {
  isSparseLibraryPageUrl,
  parseSparseLibraryPageRequest,
} from "~/content/libraryUpdate/activeLibraryRoutes";

const snapshotDirectory = path.resolve("/library/snapshots/active");

describe("active library asset routing", () => {
  test("separates a pooled revision catalog from its shared asset root", () => {
    expect(
      resolveActiveLibraryStorage("/library", {
        activeSnapshotId: "revision-2",
        snapshots: [
          {
            catalogPath: "revisions/revision-2/catalog.json",
            directory: "revisions/revision-2",
            snapshotId: "revision-2",
          },
        ],
      }),
    ).toEqual({
      assetDirectory: path.resolve("/library"),
      catalogDirectory: path.resolve("/library/revisions/revision-2"),
      revisionId: "revision-2",
    });
    expect(
      resolveActiveLibraryStorage("/library", {
        activeSnapshotId: "legacy",
        snapshots: [
          {
            catalogPath: "snapshots/legacy/catalog.json",
            directory: "snapshots/legacy",
            snapshotId: "legacy",
          },
        ],
      })?.assetDirectory,
    ).toBe(path.resolve("/library/snapshots/legacy"));
  });

  test("resolves scoped catalog and publication requests inside the snapshot", () => {
    expect(parseActiveLibraryAssetRequest("/catalog.json?v=2")).toEqual({
      kind: "scoped",
      pathname: "/catalog.json",
    });
    expect(
      parseActiveLibraryAssetRequest(
        "/__afterleaf/active-library/catalog.json?v=3",
      ),
    ).toEqual({kind: "scoped", pathname: "/catalog.json"});
    const publicationRequest = parseActiveLibraryAssetRequest(
      "/__afterleaf/active-library/publications/book/pages/001.webp?afterleaf=snapshot-next",
    );
    expect(publicationRequest).toEqual({
      kind: "scoped",
      pathname: "/publications/book/pages/001.webp",
    });
    if (publicationRequest.kind !== "scoped") return;
    expect(
      resolveActiveLibraryAssetPath(
        snapshotDirectory,
        publicationRequest.pathname,
      ),
    ).toEqual({
      assetPath: path.resolve(
        snapshotDirectory,
        "publications/book/pages/001.webp",
      ),
      kind: "resolved",
    });
  });

  test("resolves persistent pooled assets independently of catalog revisions", () => {
    const libraryDirectory = path.resolve("/library");
    const request = parseActiveLibraryAssetRequest(
      "/__afterleaf/active-library/assets/revision-2/publications/book/front.webp",
    );
    expect(request).toEqual({
      kind: "scoped",
      pathname: "/assets/revision-2/publications/book/front.webp",
    });
    if (request.kind !== "scoped") return;
    expect(
      resolveActiveLibraryAssetPath(libraryDirectory, request.pathname),
    ).toEqual({
      assetPath: path.resolve(
        libraryDirectory,
        "assets/revision-2/publications/book/front.webp",
      ),
      kind: "resolved",
    });
  });

  test("leaves unrelated static requests outside the active snapshot scope", () => {
    expect(parseActiveLibraryAssetRequest("/favicon.ico")).toEqual({
      kind: "unscoped",
    });
  });

  test("rejects malformed or traversal-oriented scoped paths", () => {
    expect(
      parseActiveLibraryAssetRequest("/publications/%E0%A4%A.webp"),
    ).toEqual({kind: "invalid"});
    expect(
      parseActiveLibraryAssetRequest("/publications/%2E%2E%2Foutside.webp"),
    ).toEqual({kind: "invalid"});
  });
});

describe("sparse library page routing", () => {
  test("identifies sparse page URLs without treating local assets as remote", () => {
    expect(
      isSparseLibraryPageUrl(
        "/api/library/publications/nhentai-42/pages/4?afterleaf=next",
      ),
    ).toBe(true);
    expect(
      isSparseLibraryPageUrl(
        "/__afterleaf/active-library/publications/nhentai-42/pages/003.webp",
      ),
    ).toBe(false);
  });

  test("accepts only bounded publication page requests", () => {
    expect(
      parseSparseLibraryPageRequest(
        "/api/library/publications/nhentai-42/pages/4?afterleaf=next",
      ),
    ).toEqual({kind: "page", pageNumber: 4, publicationId: "nhentai-42"});
    expect(parseSparseLibraryPageRequest("/api/library/scan")).toEqual({
      kind: "unscoped",
    });
    expect(
      parseSparseLibraryPageRequest("/api/library/publications/%2E%2E/pages/4"),
    ).toEqual({kind: "invalid"});
  });
});
