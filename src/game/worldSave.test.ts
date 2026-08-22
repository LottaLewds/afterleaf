import {describe, expect, test} from "bun:test";

import {
  WORLD_SAVE_SCHEMA_VERSION,
  parseWorldSave,
  worldSaveCanReconcileCatalog,
  worldSaveMatchesCatalog,
  type WorldSaveV1,
} from "~/game/worldSave";

const pose = (x = 0) => ({
  position: {x, y: 0.12, z: -2},
  quaternion: {w: 2, x: 0, y: 0, z: 0},
});

const saveFixture = (): WorldSaveV1 => ({
  aisleSigns: [{id: "gondola-1", subtitle: "AISLE 01", title: "Adult Comics"}],
  books: [
    {
      copyId: "copy-floor",
      pose: pose(1),
      publicationId: "nhentai-101",
      state: "floor",
    },
    {
      copyId: "copy-carried",
      pose: pose(2),
      publicationId: "nhentai-102",
      state: "carried",
    },
    {
      copyId: "copy-shelved",
      pose: pose(3),
      publicationId: "nhentai-103",
      shelf: {
        bayId: "bay-east-1",
        displayText: "Tonight's picks",
        facetLabel: "Office",
        presentation: "face",
        shelfId: "east-display",
        slotIndex: 4,
      },
      state: "shelved",
    },
  ],
  catalog: {
    catalogContentHash: "sha256-catalog-a",
    packId: "afterleaf-library-v1",
    snapshotId: "snapshot-2026-07-29",
  },
  digitalArtFrames: [
    {
      aspectRatio: 1.5,
      channelId: "night-scenes",
      currentImageId: "night-scenes/rain.webp",
      fit: "contain",
      height: 1.2,
      id: "digital-frame-1",
      intervalSeconds: 30,
      pose: pose(8),
      rotation: -0.12,
    },
  ],
  modelProps: [
    {
      animationClip: "RigRoot|A_Idle_00",
      assetId: "figures/kumoko.glb",
      id: "model-prop-1",
      pose: pose(9),
      scale: 1.25,
    },
  ],
  pendingArrivalIds: ["nhentai-303", "nhentai-404"],
  player: pose(),
  posters: [
    {
      assetId: "seasonal/summer.png",
      height: 1.4,
      id: "poster-1",
      pose: pose(4),
      rotation: 0.18,
    },
  ],
  props: [
    {id: "reading-table-1", pose: pose(6)},
    {id: "desk-lamp-1", locked: true, pose: pose(7)},
  ],
  savedAt: "2026-07-29T12:34:56.000Z",
  schemaVersion: WORLD_SAVE_SCHEMA_VERSION,
  shelfSigns: [
    {column: 0, subtitle: "Display 01", text: "New Arrivals"},
    {column: 3, text: "Office Romance"},
  ],
  television: pose(5),
  televisionChannels: {
    fixed: "late-night",
    movable: "trailers",
    "moonlight-theatre": "classics",
    "tv-cave-v6-east-1-1": "animation",
  },
  televisionModelVersion: 2,
  televisionVolumes: {
    fixed: 0.65,
    movable: 0,
    "moonlight-theatre": 1,
    "tv-cave-v6-east-1-1": 0.25,
  },
  trashcan: {x: -1.2, y: 0, z: 6.4},
});

describe("world save validation", () => {
  test("rejects unsupported versions, invalid dates, and malformed transforms", () => {
    expect(() => parseWorldSave({...saveFixture(), schemaVersion: 2})).toThrow(
      "Unsupported world save schema version",
    );
    expect(() =>
      parseWorldSave({...saveFixture(), savedAt: "not-a-date"}),
    ).toThrow("savedAt");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        player: {
          ...pose(),
          position: {x: Number.POSITIVE_INFINITY, y: 0, z: 0},
        },
      }),
    ).toThrow("finite world coordinate");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        player: {
          ...pose(),
          quaternion: {w: 0, x: 0, y: 0, z: 0},
        },
      }),
    ).toThrow("non-zero finite rotation");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        trashcan: {x: Number.POSITIVE_INFINITY, y: 0, z: 0},
      }),
    ).toThrow("finite world coordinate");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        televisionChannels: {fixed: ""},
      }),
    ).toThrow("televisionChannels.fixed");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        televisionChannels: {"": "late-night"},
      }),
    ).toThrow("televisionChannels television ID");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        televisionVolumes: {fixed: -0.01},
      }),
    ).toThrow("televisionVolumes.fixed must be between 0 and 1");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        televisionVolumes: {fixed: 1.01},
      }),
    ).toThrow("televisionVolumes.fixed must be between 0 and 1");
  });

  test("rejects invalid placement discriminants and shelf metadata", () => {
    const base = saveFixture();
    expect(() =>
      parseWorldSave({
        ...base,
        books: [{...base.books[0], state: "lost"}],
      }),
    ).toThrow("state is unsupported");
    expect(() =>
      parseWorldSave({
        ...base,
        books: [{...base.books[0], shelf: {shelfId: "east", slotIndex: 1}}],
      }),
    ).toThrow("only valid for shelved books");
    expect(() =>
      parseWorldSave({
        ...base,
        books: [
          {
            ...base.books[0],
            shelf: {shelfId: "east", slotIndex: -1},
            state: "shelved",
          },
        ],
      }),
    ).toThrow("non-negative safe integer");
    expect(() =>
      parseWorldSave({
        ...base,
        books: [
          {
            ...base.books[0],
            shelf: {
              presentation: "sideways",
              shelfId: "east",
              slotIndex: 1,
            },
            state: "shelved",
          },
        ],
      }),
    ).toThrow("presentation must be face or spine");
  });

  test("accepts multiple carried books and rejects more than five", () => {
    const base = saveFixture();
    expect(() =>
      parseWorldSave({...base, books: [base.books[0], base.books[0]]}),
    ).toThrow("duplicate copy IDs");
    expect(() =>
      parseWorldSave({
        ...base,
        books: [
          {...base.books[0], copyId: "carried-a", state: "carried"},
          {...base.books[1], copyId: "carried-b", state: "carried"},
        ],
      }),
    ).not.toThrow();
    expect(() =>
      parseWorldSave({
        ...base,
        books: Array.from({length: 6}, (_, index) => ({
          ...base.books[index % base.books.length],
          copyId: `carried-${index}`,
          shelf: undefined,
          state: "carried" as const,
        })),
      }),
    ).toThrow("more than 5 carried books");
  });

  test("rejects malformed or duplicate shelf signs", () => {
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        shelfSigns: [{column: -1, text: "No"}],
      }),
    ).toThrow("non-negative integer");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        shelfSigns: [
          {column: 1, text: "First"},
          {column: 1, text: "Second"},
        ],
      }),
    ).toThrow("duplicate shelf sign columns");
  });

  test("rejects malformed or duplicate aisle signs", () => {
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        aisleSigns: [{id: "", title: "No"}],
      }),
    ).toThrow("non-empty bounded string");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        aisleSigns: [
          {id: "gondola-1", title: "First"},
          {id: "gondola-1", title: "Second"},
        ],
      }),
    ).toThrow("duplicate aisle sign IDs");
  });

  test("rejects malformed or duplicate poster placements", () => {
    const poster = saveFixture().posters?.[0];
    if (!poster) throw new Error("Expected poster fixture");
    expect(() =>
      parseWorldSave({...saveFixture(), posters: [{...poster, height: 0}]}),
    ).toThrow("height must be between");
    expect(() =>
      parseWorldSave({...saveFixture(), posters: [poster, poster]}),
    ).toThrow("duplicate poster IDs");
    expect(() =>
      parseWorldSave({...saveFixture(), posters: [{...poster, assetId: ""}]}),
    ).toThrow("assetId");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        posters: [{...poster, rotation: Math.PI + 0.01}],
      }),
    ).toThrow("rotation must be between");
  });

  test("rejects malformed or duplicate digital art frames", () => {
    const frame = saveFixture().digitalArtFrames?.[0];
    if (!frame) throw new Error("Expected digital art frame fixture");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        digitalArtFrames: [{...frame, aspectRatio: 0}],
      }),
    ).toThrow("aspectRatio");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        digitalArtFrames: [{...frame, fit: "stretch"}],
      }),
    ).toThrow("fit must be contain or cover");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        digitalArtFrames: [{...frame, intervalSeconds: 1}],
      }),
    ).toThrow("intervalSeconds");
    expect(() =>
      parseWorldSave({...saveFixture(), digitalArtFrames: [frame, frame]}),
    ).toThrow("duplicate digital art frame IDs");
  });

  test("rejects malformed or duplicate movable props", () => {
    const prop = saveFixture().props?.[0];
    if (!prop) throw new Error("Expected movable prop fixture");
    expect(() =>
      parseWorldSave({...saveFixture(), props: [{...prop, id: ""}]}),
    ).toThrow("non-empty bounded string");
    expect(() =>
      parseWorldSave({...saveFixture(), props: [prop, prop]}),
    ).toThrow("duplicate prop IDs");
    expect(() =>
      parseWorldSave({...saveFixture(), props: [{...prop, locked: "yes"}]}),
    ).toThrow("locked must be a boolean when present");
  });

  test("rejects malformed or duplicate model props", () => {
    const prop = saveFixture().modelProps?.[0];
    if (!prop) throw new Error("Expected model prop fixture");
    expect(() =>
      parseWorldSave({...saveFixture(), modelProps: [{...prop, scale: 0}]}),
    ).toThrow("scale must be between");
    expect(() =>
      parseWorldSave({...saveFixture(), modelProps: [prop, prop]}),
    ).toThrow("duplicate model prop IDs");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        modelProps: [{...prop, animationClip: 12}],
      }),
    ).toThrow("animationClip must be a non-empty bounded string");
    expect(() =>
      parseWorldSave({
        ...saveFixture(),
        modelProps: [{...prop, locked: 1}],
      }),
    ).toThrow("locked must be a boolean when present");
  });

  test("preserves prop lock flags through a validation round trip", () => {
    const save = saveFixture();
    const parsed = parseWorldSave(save);
    expect(
      parsed.props?.find((entry) => entry.id === "desk-lamp-1")?.locked,
    ).toBe(true);
    expect(
      parsed.props?.find((entry) => entry.id === "reading-table-1"),
    ).toEqual(expect.not.objectContaining({locked: expect.anything()}));
    const parsedModelProp = parsed.modelProps?.[0];
    if (!parsedModelProp) throw new Error("Expected model prop fixture");
    expect(parsedModelProp.locked).toBeUndefined();
  });
});

test("catalog compatibility requires exact pack, hash, and snapshot identity", () => {
  const save = saveFixture();
  const catalog = save.catalog;
  if (!catalog) throw new Error("Expected fixture catalog identity");

  expect(worldSaveMatchesCatalog(save, catalog)).toBe(true);
  expect(
    worldSaveMatchesCatalog(save, {...catalog, catalogContentHash: "changed"}),
  ).toBe(false);
  expect(
    worldSaveMatchesCatalog(save, {...catalog, snapshotId: "new-snapshot"}),
  ).toBe(false);
  expect(worldSaveMatchesCatalog({...save, catalog: undefined}, catalog)).toBe(
    false,
  );
});

test("catalog reconciliation allows a new snapshot of the same logical library", () => {
  const save = saveFixture();
  const catalog = save.catalog;
  if (!catalog) throw new Error("Expected fixture catalog identity");

  expect(
    worldSaveCanReconcileCatalog(save, {
      ...catalog,
      catalogContentHash: "expanded-catalog",
      snapshotId: "next-snapshot",
    }),
  ).toBe(true);
  expect(
    worldSaveCanReconcileCatalog(save, {...catalog, packId: "other-library"}),
  ).toBe(false);
  expect(
    worldSaveCanReconcileCatalog({...save, catalog: undefined}, catalog),
  ).toBe(false);
});

test("world save validation rejects malformed or duplicate pending arrivals", () => {
  expect(() =>
    parseWorldSave({
      ...saveFixture(),
      pendingArrivalIds: ["duplicate", "duplicate"],
    }),
  ).toThrow("duplicate pending arrival IDs");
  expect(() =>
    parseWorldSave({...saveFixture(), pendingArrivalIds: [""]}),
  ).toThrow("pendingArrivalIds[0]");
});
