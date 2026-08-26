import {expect, test} from "bun:test";
import {BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, Scene, Texture, type WebGLRenderer} from "three";

import type {CatalogAtlases, CatalogItem, CatalogShelfAtlas} from "~/catalog";
import {BookTextureRuntime, type BookTextureRuntimeHost} from "~/game/bookTextureRuntime";
import type {BookRecord} from "~/game/bookFactory";
import type {BookAtlasBatch} from "~/game/bookExteriorMaterial";

const createRuntime = (
  books: ReadonlyMap<string, BookRecord>,
  scene: Scene,
  loadedUrls: string[] = [],
  catalogAtlases: () => CatalogAtlases = () => ({back: [], front: [], spine: []}),
) => {
  const host = {
    catalogAtlases,
    getBooks: () => books,
    isActiveDetailTarget: () => false,
    isBookInFlight: () => false,
    isDisposed: () => false,
    isPinnedOrInFlight: () => false,
    maxAnisotropy: () => 1,
    nextFrame: async () => {},
    renderer: {} as WebGLRenderer,
    scene,
    textureLoader: {
      load: () => {
        throw new Error("texture loading is not part of this test");
      },
      loadAsync: async (url: string) => {
        loadedUrls.push(url);
        return new Texture();
      },
    },
  } satisfies BookTextureRuntimeHost;
  return new BookTextureRuntime(host);
};

const createBookRecord = (scene: Scene, matrixCalls: Matrix4[]): BookRecord => {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  scene.add(mesh);
  const batch = {
    material: new MeshStandardMaterial(),
    mesh: {
      setMatrixAt: (_instanceId: number, matrix: Matrix4) => matrixCalls.push(matrix.clone()),
      setVisibleAt: () => {},
    },
  } as unknown as BookAtlasBatch;
  return {
    atlasPlacement: {
      batch,
      detached: false,
      instanceId: 0,
      lastMatrix: new Matrix4(),
      visible: true,
    },
    exteriorMaterial: new MeshStandardMaterial(),
    mesh,
    standaloneTexturesReady: false,
    state: {status: "shelved"},
  } as unknown as BookRecord;
};

const createUnplacedBookRecord = (scene: Scene) => {
  const record = createBookRecord(scene, []);
  record.atlasPlacement = undefined;
  return record;
};

const createShelfAtlas = (
  surface: string,
  index: number,
  revision: string,
  catalogRevision: string,
): CatalogShelfAtlas => ({
  cellHeight: 576,
  cellWidth: 384,
  columns: 1,
  firstPublicationIndex: index * 10,
  height: 576,
  publicationCount: 1,
  rows: 1,
  url: `${surface}-${index}-${revision}.webp?catalog=${catalogRevision}`,
  width: 384,
});

const createCatalogAtlases = (changedAtlasRevision: string, catalogRevision: string): CatalogAtlases => ({
  back: [
    createShelfAtlas("back", 0, "stable", catalogRevision),
    createShelfAtlas("back", 1, changedAtlasRevision, catalogRevision),
  ],
  front: [
    createShelfAtlas("front", 0, "stable", catalogRevision),
    createShelfAtlas("front", 1, changedAtlasRevision, catalogRevision),
  ],
  spine: [
    createShelfAtlas("spine", 0, "stable", catalogRevision),
    createShelfAtlas("spine", 1, changedAtlasRevision, catalogRevision),
  ],
});

const createCatalogItem = (id: string, atlasIndex: number, cellIndex = 0): CatalogItem =>
  ({
    accent: "#ffffff",
    aspectRatio: 1,
    direction: "LTR",
    id,
    shelfAtlas: {cellIndex, index: atlasIndex},
    thicknessMm: 10,
  }) as CatalogItem;

test("syncActiveBookAtlasBatches skips untouched book placements", () => {
  const scene = new Scene();
  const matrixCalls: Matrix4[] = [];
  const first = createBookRecord(scene, matrixCalls);
  const second = createBookRecord(scene, matrixCalls);
  const books = new Map([
    ["first", first],
    ["second", second],
  ]);
  const runtime = createRuntime(books, scene);

  runtime.syncBookAtlasBatches();
  first.mesh.position.x = 2;
  second.mesh.position.x = 4;
  runtime.syncActiveBookAtlasBatches(["first"]);

  expect(matrixCalls).toHaveLength(1);
  expect(matrixCalls[0]?.elements[12]).toBe(2);
  expect(second.atlasPlacement?.lastMatrix.elements[12]).toBe(0);
});

test("retains unchanged atlas resources when a catalog update changes one atlas", async () => {
  const scene = new Scene();
  const loadedUrls: string[] = [];
  let atlases = createCatalogAtlases("old", "catalog-old");
  const first = createUnplacedBookRecord(scene);
  const second = createUnplacedBookRecord(scene);
  const books = new Map([
    ["first", first],
    ["second", second],
  ]);
  const runtime = createRuntime(books, scene, loadedUrls, () => atlases);
  const initialItems = [createCatalogItem("first", 0), createCatalogItem("second", 1)];

  await runtime.initializeBookAtlasBatches(initialItems, runtime.bumpRevision());
  expect(loadedUrls).toHaveLength(6);
  const stableBatch = first.atlasPlacement?.batch;
  const changedBatch = second.atlasPlacement?.batch;

  const added = createUnplacedBookRecord(scene);
  books.set("added", added);
  atlases = createCatalogAtlases("new", "catalog-new");
  await runtime.initializeBookAtlasBatches([...initialItems, createCatalogItem("added", 1)], runtime.bumpRevision());

  expect(loadedUrls).toHaveLength(9);
  expect(loadedUrls.filter((url) => url.includes("-0-stable")).length).toBe(3);
  expect(loadedUrls.filter((url) => url.includes("-1-new")).length).toBe(3);
  expect(first.atlasPlacement?.batch).toBe(stableBatch);
  expect(second.atlasPlacement?.batch).not.toBe(changedBatch);
  runtime.disposeBookAtlasBatches();
});
