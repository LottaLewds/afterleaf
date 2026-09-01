import {mkdtempSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, test} from "bun:test";
import {
  COLLECTIONS_SCHEMA_VERSION,
  createCollection,
  deleteCollection,
  loadCollections,
  parseCollectionsStore,
  saveCollections,
  updateCollection,
} from "~/content/collections";
import {collectionsPath} from "~/content/dataRoot";

const tempWorkingDirectory = () => mkdtempSync(join(tmpdir(), "afterleaf-collections-"));

describe("collections", () => {
  test("parseCollectionsStore accepts a valid store", () => {
    const store = {
      collections: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "Favorites",
          createdAt: "2024-01-01T00:00:00.000Z",
          publicationIds: ["abc123"],
        },
      ],
      schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    };
    const parsed = parseCollectionsStore(store);
    expect(parsed.collections).toHaveLength(1);
    expect(parsed.collections[0]?.name).toBe("Favorites");
    expect(parsed.collections[0]?.publicationIds).toEqual(["abc123"]);
  });

  test("parseCollectionsStore rejects duplicate ids", () => {
    const store = {
      collections: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "A",
          createdAt: "2024-01-01T00:00:00.000Z",
          publicationIds: [],
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "B",
          createdAt: "2024-01-01T00:00:00.000Z",
          publicationIds: [],
        },
      ],
      schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    };
    expect(() => parseCollectionsStore(store)).toThrow("duplicate collection ids");
  });

  test("parseCollectionsStore rejects duplicate publication ids in a collection", () => {
    const store = {
      collections: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "A",
          createdAt: "2024-01-01T00:00:00.000Z",
          publicationIds: ["abc123", "abc123"],
        },
      ],
      schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    };
    expect(() => parseCollectionsStore(store)).toThrow("duplicates");
  });

  test("saveCollections writes a valid store", async () => {
    const workingDirectory = tempWorkingDirectory();
    const collections = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Favorites",
        createdAt: "2024-01-01T00:00:00.000Z",
        publicationIds: ["abc123"] as const,
      },
    ];
    await saveCollections(workingDirectory, collections);
    const saved = JSON.parse(readFileSync(collectionsPath(workingDirectory), "utf8"));
    expect(saved.schemaVersion).toBe(COLLECTIONS_SCHEMA_VERSION);
    expect(saved.collections).toHaveLength(1);
  });

  test("loadCollections returns an empty array when the file is missing", async () => {
    const workingDirectory = tempWorkingDirectory();
    const collections = await loadCollections(workingDirectory);
    expect(collections).toEqual([]);
  });

  test("createCollection adds a new collection", async () => {
    const workingDirectory = tempWorkingDirectory();
    const collection = await createCollection(workingDirectory, "Favorites", ["abc123"]);
    expect(collection.name).toBe("Favorites");
    expect(collection.publicationIds).toEqual(["abc123"]);
    const collections = await loadCollections(workingDirectory);
    expect(collections).toHaveLength(1);
  });

  test("createCollection rejects duplicate names", async () => {
    const workingDirectory = tempWorkingDirectory();
    await createCollection(workingDirectory, "Favorites");
    expect(createCollection(workingDirectory, "favorites")).rejects.toThrow("already exists");
  });

  test("updateCollection renames and updates ids", async () => {
    const workingDirectory = tempWorkingDirectory();
    const created = await createCollection(workingDirectory, "Favorites", ["abc123"]);
    const updated = await updateCollection(workingDirectory, created.id, {
      name: "Renamed",
      publicationIds: ["abc123", "def456"],
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.publicationIds).toEqual(["abc123", "def456"]);
  });

  test("deleteCollection removes a collection", async () => {
    const workingDirectory = tempWorkingDirectory();
    const created = await createCollection(workingDirectory, "Favorites");
    await deleteCollection(workingDirectory, created.id);
    const collections = await loadCollections(workingDirectory);
    expect(collections).toHaveLength(0);
  });
});
