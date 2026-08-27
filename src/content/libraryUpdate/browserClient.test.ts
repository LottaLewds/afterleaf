import {describe, expect, test} from "bun:test";

import {
  BrowserLibraryOperationError,
  blacklistPublication,
  browseLibraryLocation,
  fetchMorePublications,
  loadBlacklistedPublications,
  loadLibraryOperationStatus,
  loadLibrarySourceStatus,
  reenrollLibraryRoot,
  resolvePastedLibraryImport,
  scanLocalLibrary,
  type LibraryOperationFetch,
} from "~/content/libraryUpdate/browserClient";
import {
  LIBRARY_BLACKLIST_ENDPOINT,
  LIBRARY_FETCH_MORE_ENDPOINT,
  LIBRARY_PASTE_RESOLVE_ENDPOINT,
  LIBRARY_SCAN_ENDPOINT,
  LIBRARY_ROOT_ENROLL_ENDPOINT,
  LIBRARY_SOURCE_STATUS_ENDPOINT,
  LIBRARY_STATUS_ENDPOINT,
  libraryOperationFailure,
  parseLibraryBlacklistRequest,
  parseLibraryFetchMoreRequest,
  parseLibraryOperationStartHttpResponse,
  parseLibraryPasteResolveHttpResponse,
  parseLibraryPasteResolveRequest,
  parseLibraryScanRequest,
  parseLibraryOperationStatusHttpResponse,
  summarizeLibraryBlacklistListResult,
  summarizeLibraryBlacklistResult,
  summarizeLibrarySnapshotResult,
  type LibraryOperationStartHttpSuccess,
  type LibrarySnapshotHttpSuccess,
  type LibrarySnapshotOperation,
} from "~/content/libraryUpdate/httpProtocol";

const jobId = "123e4567-e89b-42d3-a456-426614174000";

const snapshotResponse = (operation: LibrarySnapshotOperation): LibrarySnapshotHttpSuccess => ({
  changes: {
    addedCount: 2,
    removedCount: 1,
    unchangedCount: 16,
    updatedCount: 1,
  },
  ok: true,
  operation,
  snapshot: {
    catalogContentHash: "sha256-next",
    packId: "afterleaf-library",
    publicationCount: 20,
    snapshotId: "snapshot-next",
  },
});

const compactSnapshotResult = {
  addedCount: 2,
  publicationCount: 20,
  removedCount: 1,
  snapshotId: "snapshot-next",
  unchangedCount: 16,
  updatedCount: 1,
};

const jobStartResponse = (operation: LibrarySnapshotOperation): LibraryOperationStartHttpSuccess => ({
  jobId,
  ok: true,
  operation,
  state: "running",
});

const response = (body: unknown, status = 200): Pick<Response, "ok" | "status" | "text"> => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

describe("browser library operation client", () => {
  test("browses an encoded folder path and exposes drive choices", async () => {
    let requestInput: string | undefined;
    const fetcher: LibraryOperationFetch = async (input) => {
      requestInput = input;
      return response({
        drives: [
          {name: "C:", path: "C:\\"},
          {name: "D:", path: "D:\\"},
        ],
        entries: [{name: "Comics", path: "D:\\Comics"}],
        ok: true,
        parent: "D:\\",
        path: "D:\\Media & Books",
      });
    };

    await expect(browseLibraryLocation("D:\\Media & Books", fetcher)).resolves.toMatchObject({
      drives: [
        {name: "C:", path: "C:\\"},
        {name: "D:", path: "D:\\"},
      ],
      path: "D:\\Media & Books",
    });
    expect(requestInput).toBe("/api/library/browse?path=D%3A%5CMedia%20%26%20Books");
  });

  test("supports browse responses from servers without drive metadata", async () => {
    const fetcher: LibraryOperationFetch = async () => response({entries: [], ok: true, path: "/media"});

    const listing = await browseLibraryLocation("/media", fetcher);
    expect(Object.keys(listing).toSorted()).toEqual(["drives", "entries", "ok", "path"]);
    expect(listing).toMatchObject({
      drives: [],
      entries: [],
      ok: true,
      path: "/media",
    });
  });

  test("scans disk with an empty POST request", async () => {
    let requestInput: string | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return response(jobStartResponse("scan"), 202);
    };

    await expect(scanLocalLibrary(fetcher)).resolves.toEqual({
      jobId,
      operation: "scan",
    });
    expect(requestInput).toBe(LIBRARY_SCAN_ENDPOINT);
    expect(requestInit).toMatchObject({
      body: "{}",
      cache: "no-store",
      credentials: "same-origin",
      method: "POST",
    });
  });

  test("requests an explicit deep repair scan", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (_input, init) => {
      requestInit = init;
      return response(jobStartResponse("scan"), 202);
    };

    await scanLocalLibrary(
      {
        redownloadProviderAssets: true,
        repair: true,
        repairProviderMetadata: true,
      },
      fetcher,
    );

    expect(requestInit?.body).toBe('{"redownloadProviderAssets":true,"repair":true,"repairProviderMetadata":true}');
  });

  test("sends bounded fetch-more requests", async () => {
    let requestInput: string | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return response(jobStartResponse("fetch-more"), 202);
    };

    await expect(
      fetchMorePublications(
        {
          blockedTags: ["schoolgirl", "full color"],
          limit: 35,
          maxSearchPages: 24,
          query: "office ladies",
        },
        fetcher,
      ),
    ).resolves.toEqual({jobId, operation: "fetch-more"});
    expect(requestInput).toBe(LIBRARY_FETCH_MORE_ENDPOINT);
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      blockedTags: ["schoolgirl", "full color"],
      limit: 35,
      maxSearchPages: 24,
      query: "office ladies",
    });
  });

  test("blacklists one ID without returning a snapshot result", async () => {
    let requestInput: string | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return response({
        added: true,
        blacklistedCount: 3,
        ok: true,
        publicationId: "nhentai-42",
      });
    };

    await expect(blacklistPublication({publicationId: "nhentai-42"}, fetcher)).resolves.toEqual({
      added: true,
      blacklistedCount: 3,
      publicationId: "nhentai-42",
    });
    expect(requestInput).toBe(LIBRARY_BLACKLIST_ENDPOINT);
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      publicationId: "nhentai-42",
    });
  });

  test("loads the bounded blacklist with GET", async () => {
    let requestInput: string | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return response({
        ok: true,
        publicationIds: ["nhentai-42", "local-edition-1"],
      });
    };

    await expect(loadBlacklistedPublications(fetcher)).resolves.toEqual(["nhentai-42", "local-edition-1"]);
    expect(requestInput).toBe(LIBRARY_BLACKLIST_ENDPOINT);
    expect(requestInit).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      method: "GET",
    });
    expect(requestInit?.body).toBeUndefined();
  });

  test("polls actual background operation progress", async () => {
    let requestInput: string | undefined;
    const fetcher: LibraryOperationFetch = async (input) => {
      requestInput = input;
      return response({
        completedSteps: 1,
        jobId,
        message: "Building an immutable library snapshot",
        ok: true,
        operation: "fetch-more",
        state: "running",
        totalSteps: 3,
      });
    };

    await expect(loadLibraryOperationStatus(jobId, fetcher)).resolves.toEqual({
      completedSteps: 1,
      jobId,
      message: "Building an immutable library snapshot",
      operation: "fetch-more",
      state: "running",
      totalSteps: 3,
    });
    expect(requestInput).toBe(`${LIBRARY_STATUS_ENDPOINT}?jobId=${jobId}`);
  });

  test("loads the unavailable configured book-path count", async () => {
    let requestInput: string | undefined;
    const fetcher: LibraryOperationFetch = async (input) => {
      requestInput = input;
      return response({
        ok: true,
        reenrollableBookPaths: ["/mnt/manga"],
        unavailableBookPathCount: 2,
      });
    };

    await expect(loadLibrarySourceStatus(fetcher)).resolves.toEqual({
      reenrollableBookPaths: ["/mnt/manga"],
      unavailableBookPathCount: 2,
    });
    expect(requestInput).toBe(LIBRARY_SOURCE_STATUS_ENDPOINT);
  });

  test("explicitly re-enrolls a configured library root", async () => {
    let requestInput: string | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return response({ok: true});
    };

    await expect(reenrollLibraryRoot("/mnt/manga", fetcher)).resolves.toBeUndefined();
    expect(requestInput).toBe(LIBRARY_ROOT_ENROLL_ENDPOINT);
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({path: "/mnt/manga"});
  });

  test("loads a completed background operation result", async () => {
    const fetcher: LibraryOperationFetch = async () =>
      response({
        completedSteps: 3,
        jobId,
        message: "Library job complete",
        ok: true,
        operation: "scan",
        result: snapshotResponse("scan"),
        state: "succeeded",
        totalSteps: 3,
      });

    await expect(loadLibraryOperationStatus(jobId, fetcher)).resolves.toEqual({
      completedSteps: 3,
      jobId,
      message: "Library job complete",
      operation: "scan",
      result: compactSnapshotResult,
      state: "succeeded",
      totalSteps: 3,
    });
  });

  test("loads a failed background operation result", async () => {
    const fetcher: LibraryOperationFetch = async () =>
      response({
        completedSteps: 2,
        error: {code: "operation_failed", message: "Could not activate"},
        jobId,
        message: "Could not activate",
        ok: true,
        operation: "fetch-more",
        state: "failed",
        totalSteps: 3,
      });

    await expect(loadLibraryOperationStatus(jobId, fetcher)).resolves.toEqual({
      completedSteps: 2,
      error: {code: "operation_failed", message: "Could not activate"},
      jobId,
      message: "Could not activate",
      operation: "fetch-more",
      state: "failed",
      totalSteps: 3,
    });
  });

  test("surfaces validated errors and rejects the wrong operation", async () => {
    const errorFetcher: LibraryOperationFetch = async () =>
      response(
        {
          error: {
            code: "operation_in_progress",
            message: "A library operation is already in progress",
          },
          ok: false,
        },
        409,
      );
    await expect(scanLocalLibrary(errorFetcher)).rejects.toMatchObject({
      code: "operation_in_progress",
      name: "BrowserLibraryOperationError",
      status: 409,
    });

    const wrongOperationFetcher: LibraryOperationFetch = async () => response(jobStartResponse("fetch-more"), 202);
    await expect(scanLocalLibrary(wrongOperationFetcher)).rejects.toMatchObject({code: "invalid_response"});
  });

  test("asks providers to resolve pasted text", async () => {
    let requestInput: string | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: LibraryOperationFetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return response({
        match: {
          providerId: "example-provider",
          publicationId: "example-42",
          query: "source:42",
        },
        ok: true,
      });
    };

    await expect(resolvePastedLibraryImport("https://example.test/books/42", fetcher)).resolves.toEqual({
      providerId: "example-provider",
      publicationId: "example-42",
      query: "source:42",
    });
    expect(requestInput).toBe(LIBRARY_PASTE_RESOLVE_ENDPOINT);
    expect(requestInit).toMatchObject({
      body: JSON.stringify({text: "https://example.test/books/42"}),
      method: "POST",
    });

    await expect(resolvePastedLibraryImport("unmatched", async () => response({ok: true}))).resolves.toBeUndefined();
  });

  test("rejects malformed and oversized responses", async () => {
    const malformedFetcher: LibraryOperationFetch = async () => response({ok: true, snapshot: {}});
    await expect(scanLocalLibrary(malformedFetcher)).rejects.toBeInstanceOf(BrowserLibraryOperationError);

    const oversizedFetcher: LibraryOperationFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => "x".repeat(1024 * 1_024 + 1),
    });
    await expect(scanLocalLibrary(oversizedFetcher)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("library operation HTTP protocol", () => {
  test("keeps all three request bodies narrow", () => {
    expect(parseLibraryScanRequest({})).toEqual({});
    expect(parseLibraryScanRequest({repair: true})).toEqual({repair: true});
    expect(
      parseLibraryScanRequest({
        redownloadProviderAssets: true,
        repair: true,
        repairProviderMetadata: true,
      }),
    ).toEqual({
      redownloadProviderAssets: true,
      repair: true,
      repairProviderMetadata: true,
    });
    expect(() => parseLibraryScanRequest({repair: "yes"})).toThrow("must be a boolean");
    expect(() => parseLibraryScanRequest({fetch: true})).toThrow("unsupported fields");
    expect(() => parseLibraryScanRequest({repairProviderMetadata: true})).toThrow("require a deep repair scan");
    expect(parseLibraryFetchMoreRequest({})).toEqual({});
    expect(
      parseLibraryFetchMoreRequest({
        blockedTags: ["schoolgirl", "full color"],
        limit: 35,
        maxSearchPages: 24,
        query: "  Office Ladies  ",
      }),
    ).toEqual({
      blockedTags: ["schoolgirl", "full color"],
      limit: 35,
      maxSearchPages: 24,
      query: "Office Ladies",
    });
    expect(() =>
      parseLibraryFetchMoreRequest({
        blockedTags: ["schoolgirl", 42],
      }),
    ).toThrow("bounded tags");
    expect(() =>
      parseLibraryFetchMoreRequest({
        limit: 101,
      }),
    ).toThrow("integer from 1 to 100");
    expect(() =>
      parseLibraryFetchMoreRequest({
        maxSearchPages: 101,
      }),
    ).toThrow("integer from 1 to 100");
    expect(() =>
      parseLibraryFetchMoreRequest({
        query: "office\nladies",
      }),
    ).toThrow("bounded query");
    expect(() =>
      parseLibraryFetchMoreRequest({
        arguments: ["--library", "/tmp/elsewhere"],
      }),
    ).toThrow("unsupported fields");
    expect(parseLibraryBlacklistRequest({publicationId: "nhentai-42"})).toEqual({publicationId: "nhentai-42"});
    expect(() => parseLibraryBlacklistRequest({publicationId: "--library"})).toThrow("portable publication identifier");
  });

  test("validates provider-defined paste import matches", () => {
    expect(parseLibraryPasteResolveRequest({text: "pasted text"})).toEqual({
      text: "pasted text",
    });
    expect(() => parseLibraryPasteResolveRequest({text: ""})).toThrow("non-empty bounded string");
    expect(parseLibraryPasteResolveHttpResponse({ok: true})).toEqual({
      ok: true,
    });
    expect(
      parseLibraryPasteResolveHttpResponse({
        match: {
          providerId: "example-provider",
          publicationId: "example-42",
          query: "source:42",
        },
        ok: true,
      }),
    ).toEqual({
      match: {
        providerId: "example-provider",
        publicationId: "example-42",
        query: "source:42",
      },
      ok: true,
    });
    expect(() =>
      parseLibraryPasteResolveHttpResponse({
        match: {
          providerId: "bad provider",
          query: "source:42",
        },
        ok: true,
      }),
    ).toThrow("portable provider identifier");
    expect(() =>
      parseLibraryPasteResolveHttpResponse({
        match: {
          providerId: "example-provider",
          query: "line\nbreak",
        },
        ok: true,
      }),
    ).toThrow("query is invalid");
  });

  test("validates bounded operation progress", () => {
    expect(parseLibraryOperationStartHttpResponse(jobStartResponse("scan"))).toEqual(jobStartResponse("scan"));
    expect(
      parseLibraryOperationStatusHttpResponse({
        completedSteps: 2,
        jobId,
        message: "Activating the completed library snapshot",
        ok: true,
        operation: "fetch-more",
        state: "running",
        totalSteps: 3,
      }),
    ).toMatchObject({completedSteps: 2, state: "running", totalSteps: 3});
    expect(() =>
      parseLibraryOperationStatusHttpResponse({
        completedSteps: 4,
        jobId,
        message: "invalid",
        ok: true,
        operation: "scan",
        state: "running",
        totalSteps: 3,
      }),
    ).toThrow("cannot exceed");
  });

  test("summarizes snapshot, blacklist, and list command results separately", () => {
    expect(
      summarizeLibrarySnapshotResult(
        {
          diff: {
            addedPublicationIds: ["a", "b"],
            removedPublicationIds: ["c"],
            unchangedPublicationIds: [],
            updatedPublicationIds: ["d"],
          },
          snapshot: snapshotResponse("scan").snapshot,
        },
        "scan",
      ),
    ).toEqual({
      ...snapshotResponse("scan"),
      changes: {...snapshotResponse("scan").changes, unchangedCount: 0},
    });
    expect(
      summarizeLibraryBlacklistResult({
        added: true,
        blacklistedCount: 1,
        publicationId: "nhentai-42",
      }),
    ).toEqual({
      added: true,
      blacklistedCount: 1,
      ok: true,
      publicationId: "nhentai-42",
    });
    expect(
      summarizeLibraryBlacklistListResult({
        publicationIds: ["nhentai-42"],
      }),
    ).toEqual({ok: true, publicationIds: ["nhentai-42"]});
    expect(() =>
      summarizeLibraryBlacklistListResult({
        publicationIds: ["nhentai-42", "nhentai-42"],
      }),
    ).toThrow("duplicate IDs");
  });

  test("bounds command failures before returning them to the browser", () => {
    const failure = libraryOperationFailure("operation_failed", "x".repeat(4_096));
    expect(failure.error.message).toHaveLength(2_048);
  });
});
