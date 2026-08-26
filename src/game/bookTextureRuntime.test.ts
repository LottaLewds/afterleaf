import {expect, test} from "bun:test";
import {BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, Scene, type WebGLRenderer} from "three";

import {BookTextureRuntime, type BookTextureRuntimeHost} from "~/game/bookTextureRuntime";
import type {BookRecord} from "~/game/bookFactory";
import type {BookAtlasBatch} from "~/game/bookExteriorMaterial";

const createRuntime = (books: ReadonlyMap<string, BookRecord>, scene: Scene) => {
  const host = {
    catalogAtlases: () => ({back: [], front: [], spine: []}),
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
      loadAsync: async () => {
        throw new Error("texture loading is not part of this test");
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
