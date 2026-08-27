import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type AnimationMixer,
  type Object3D,
  type Scene,
  type TextureLoader,
  type WebGLRenderer,
} from "three";
import {createHorizontalShape, createTiledFloorSurface, type AddBox} from "~/game/interior/interiorPrimitives";
import {applyCeilingShapeUv} from "~/game/ceilingMaterials";
import {createWallpaperMaterial} from "~/game/wallpaperMaterials";
import {createSignVisual} from "~/game/signs/ShopSignSystem";
import {
  createAtriumRailings,
  createStackableStairwell,
  createUpperFloorStructures,
  createUpperWindowWall,
} from "~/game/interior/upperFloor";
import {createCeilingMaterial} from "~/game/ceilingMaterials";
import {createWoodMaterial, loadWoodTextures} from "~/game/woodMaterials";
import {ShopTelevision} from "~/game/ShopTelevision";
import {batchStaticInteriorMeshes} from "~/game/staticModelBatching";
import {SIGN_TEXTURE_MAX_ANISOTROPY} from "~/game/signs/ShopSignSystem";
import type {MovablePropRegistration} from "~/game/propRegistration";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {DiscardBin} from "~/game/discardBin";
import {createHallwayDoor, createRareRoom, type DoorSystem} from "~/game/interior/doors";
import {
  createFaceOutDisplay,
  createSpineShelfFixture,
  createTelevisionTableShelf,
  createWallPosterSurfaces,
} from "~/game/interior/shelfFixtures";
import {createReadingTables} from "~/game/interior/readingFurniture";
import {createCeilingLightTemplate, createDeskLamps} from "~/game/interior/lightingProps";
import {createNightWindows, createTheatreSeating} from "~/game/interior/seating";
import {createTelevisionRooms, FIXED_TELEVISION_SAVE_ID} from "~/game/interior/televisionRooms";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {ReadingFurnitureMaterials} from "~/game/propRegistration";
import type {WorldSaveV1} from "~/game/worldSave";
import type {SpineShelfDefinition} from "~/game/shopTypes";
import {
  SHOP_ATRIUM,
  SHOP_EXPANSION_WALL_BOXES,
  SHOP_STAIR_ROOM,
  SHOP_THEATRE,
  SHOP_THEATRE_HALL,
  SHOP_TV_CAVE,
  SHOP_TV_CAVE_DOOR_CENTER_Z,
  SHOP_TV_CAVE_HALL,
  SHOP_UPPER_CEILING_Y,
  SHOP_UPPER_FLOOR_Y,
  SHOP_UPPER_STACK_CENTER_X,
  SHOP_UPPER_STACK_LENGTH,
  SHOP_UPPER_STACK_ZS,
} from "~/game/shopExpansionLayout";
import {
  SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
  SHOP_STAIR_OPENING_WIDTH,
  SPINE_SHELF_BACKING_THICKNESS,
} from "~/game/shopLayout";

/** Everything the once-per-boot shop builders need from the scene. */

const spineFixtureDeps = (ctx: ShopCompositionContext) => ({
  addBox: ctx.addBox,
  createPosterSurface: ctx.createPosterSurface,
  registerPropPlacementSupport: ctx.registerPropPlacementSupport,
  shelfTargetMeshes: ctx.shelfTargetMeshes,
  signs: ctx.signs,
  spineShelfDefinitions: ctx.spineShelfDefinitions,
});

export type ShopCompositionContext = {
  addBox: AddBox;
  artFrames: ArtFrameSystem;
  cacheBuiltinPropTemplate: (registration: MovablePropRegistration) => void;
  createFloorMaterial: () => MeshStandardMaterial;
  createPosterSurface: (
    parent: Group,
    id: string,
    width: number,
    height: number,
    position: readonly [number, number, number],
    rotationY: number,
  ) => void;
  createSpawnedCrtTelevision: (
    asset: import("~/game/propTemplates").BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: import("~/game/worldSave").WorldModelPropSave["pose"],
  ) => unknown;
  createUpperReadingFurniture: (
    parent: Group,
    woodMaterial: MeshStandardMaterial,
    furnitureMaterials: ReadingFurnitureMaterials,
  ) => void;
  createFaceOutDisplay: (
    parent: Group,
    woodMaterial: MeshStandardMaterial,
    backingMaterial: MeshStandardMaterial,
    deps: import("~/game/interior/shelfFixtures").FaceOutDisplayDeps,
  ) => void;
  discardBin: DiscardBin;
  disposed: boolean;
  doors: DoorSystem;
  modelMixers: Set<AnimationMixer>;
  needsSeedPass: (version: number) => boolean;
  pendingWorldSave: WorldSaveV1 | undefined;
  registerMovableProp: (registration: MovablePropRegistration) => void;
  registerPropPlacementSupport: (object: Object3D) => void;
  registerTelevision: (saveId: string, television: ShopTelevision) => void;
  renderer: WebGLRenderer;
  scene: Scene;
  seedDefaultProps: () => void;
  sharedTelevisionOptions: (
    initialChannelId: string | undefined,
    initialVolume: number | undefined,
  ) => import("~/game/interior/televisionRooms").SharedTelevisionOptions;
  shelfSnapMesh: Mesh;
  shelfTargetMeshes: Mesh[];
  signs: ShopSignSystem;
  spineShelfDefinitions: Map<string, SpineShelfDefinition>;
  setTelevisionTableMaterial: (material: MeshStandardMaterial) => void;
  textureLoader: TextureLoader;
};

export const buildShopInterior = (ctx: ShopCompositionContext) => {
  const architecture = new Group();
  architecture.name = "night-shop-interior";
  ctx.scene.add(architecture);
  ctx.shelfSnapMesh.name = "shelf-snap-helper";
  ctx.shelfSnapMesh.visible = false;
  architecture.add(ctx.shelfSnapMesh);

  const floorMaterial = ctx.createFloorMaterial();
  const floorCenterZ = 8.5;
  const floor = new Mesh(new PlaneGeometry(26, 39), floorMaterial);
  const floorUv = floor.geometry.getAttribute("uv");
  const floorPositions = floor.geometry.getAttribute("position");
  for (let index = 0; index < floorUv.count; index += 1)
    floorUv.setXY(index, floorPositions.getX(index), floorPositions.getY(index) - floorCenterZ);
  floorUv.needsUpdate = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, floorCenterZ);
  floor.receiveShadow = true;
  architecture.add(floor);
  const groundFloorStructure = new Mesh(new BoxGeometry(26, 0.18, 39), new MeshBasicMaterial({color: "#242a28"}));
  groundFloorStructure.position.set(0, -0.092, floorCenterZ);
  architecture.add(groundFloorStructure);

  const wallMaterial = createWallpaperMaterial(ctx.textureLoader, ctx.renderer.capabilities.getMaxAnisotropy());
  ctx.addBox(architecture, [26, 4.8, 0.16], [0, 2.35, -10.5], wallMaterial);
  ctx.addBox(architecture, [26, 4.8, 0.16], [0, 2.35, 28], wallMaterial);
  ctx.addBox(architecture, [0.16, 4.8, 38.5], [-12.5, 2.35, 8.75], wallMaterial);
  const lowerStairOpeningMinZ = SHOP_STAIR_LOWER_FLIGHT_CENTER_Z - SHOP_STAIR_OPENING_WIDTH / 2;
  const lowerStairOpeningMaxZ = SHOP_STAIR_LOWER_FLIGHT_CENTER_Z + SHOP_STAIR_OPENING_WIDTH / 2;
  ctx.addBox(
    architecture,
    [0.16, 4.8, lowerStairOpeningMinZ + 10.5],
    [12.5, 2.35, (-10.5 + lowerStairOpeningMinZ) / 2],
    wallMaterial,
  );
  ctx.addBox(
    architecture,
    [0.16, 4.8, 28 - lowerStairOpeningMaxZ],
    [12.5, 2.35, (28 + lowerStairOpeningMaxZ) / 2],
    wallMaterial,
  );
  ctx.createPosterSurface(architecture, "back-wall", 24.6, 4.5, [0, 2.35, -10.405], 0);
  ctx.createPosterSurface(architecture, "front-wall", 24.6, 4.5, [0, 2.35, 27.905], Math.PI);
  ctx.createPosterSurface(architecture, "west-wall", 37.8, 4.5, [-12.405, 2.35, 8.75], Math.PI / 2);
  ctx.createPosterSurface(
    architecture,
    "east-wall",
    lowerStairOpeningMinZ + 10.1,
    4.5,
    [12.405, 2.35, (-10.5 + lowerStairOpeningMinZ) / 2],
    -Math.PI / 2,
  );

  const woodTextures = loadWoodTextures(ctx.textureLoader, ctx.renderer.capabilities.getMaxAnisotropy());
  const woodMaterial = createWoodMaterial(woodTextures);
  const shelfEdgeMaterial = createWoodMaterial(woodTextures, {
    color: "#d8c0aa",
    roughness: 0.76,
  });
  const shelfBackingMaterial = createWoodMaterial(woodTextures, {
    color: "#806f63",
    roughness: 0.92,
  });
  ctx.setTelevisionTableMaterial(woodMaterial);

  createFaceOutDisplay(architecture, woodMaterial, shelfBackingMaterial, {
    addBox: (p, size, pos, mat, castShadow) => ctx.addBox(p, size, pos, mat, castShadow),
    registerPropPlacementSupport: (object) => ctx.registerPropPlacementSupport(object),
    shelfTargetMeshes: ctx.shelfTargetMeshes,
    signs: ctx.signs,
    spineShelfDefinitions: ctx.spineShelfDefinitions,
  });
  void ctx.discardBin.create(architecture);

  createSpineShelfFixture(
    architecture,
    "west-wall",
    -11.45,
    8.25,
    35.5,
    9,
    [1],
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    SPINE_SHELF_BACKING_THICKNESS,
    0,
    "z",
    spineFixtureDeps(ctx),
  );
  createSpineShelfFixture(
    architecture,
    "east-wall",
    11.45,
    5.75,
    30.5,
    8,
    [-1],
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    SPINE_SHELF_BACKING_THICKNESS,
    0,
    "z",
    spineFixtureDeps(ctx),
  );
  for (const [index, x] of [-4.2, 4.2].entries())
    createSpineShelfFixture(
      architecture,
      `gondola-${index + 1}`,
      x,
      10,
      17,
      7,
      [-1, 1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      SPINE_SHELF_BACKING_THICKNESS,
      0,
      "z",
      spineFixtureDeps(ctx),
    );
  for (const [index, x] of [-8, 8].entries())
    createSpineShelfFixture(
      architecture,
      `outer-gondola-${index + 1}`,
      x,
      12,
      12,
      5,
      [-1, 1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      SPINE_SHELF_BACKING_THICKNESS,
      0,
      "z",
      spineFixtureDeps(ctx),
    );
  const readingFurnitureMaterials = createReadingTables(architecture, woodMaterial, {
    addBox: (parent2, size, position2, material, castShadow) =>
      ctx.addBox(parent2, size, position2, material, castShadow),
    cacheBuiltinPropTemplate: (registration) => ctx.cacheBuiltinPropTemplate(registration),
    createDeskLamps: async (parent2) => {
      await createDeskLamps(parent2, {
        cacheBuiltinPropTemplate: (registration) => ctx.cacheBuiltinPropTemplate(registration),
        isDisposed: () => ctx.disposed,
        modelMixers: ctx.modelMixers,
        needsSeedPass: (version) => ctx.needsSeedPass(version),
        registerMovableProp: (registration) => ctx.registerMovableProp(registration),
      });
    },
    needsSeedPass: (version) => ctx.needsSeedPass(version),
    registerMovableProp: (registration) => ctx.registerMovableProp(registration),
  });
  createRareRoom(architecture, wallMaterial, woodMaterial, shelfBackingMaterial, shelfEdgeMaterial, {
    addBox: (parent2, size, position2, material, castShadow) =>
      ctx.addBox(parent2, size, position2, material, castShadow),
    createSpineShelfFixture: (
      fixtureParent,
      fixtureId,
      fx,
      fz,
      length2,
      bayCount,
      faceNormals,
      fixtureWood,
      fixtureBacking,
      fixtureEdge,
      backingThickness,
    ) =>
      createSpineShelfFixture(
        fixtureParent,
        fixtureId,
        fx,
        fz,
        length2,
        bayCount,
        faceNormals,
        fixtureWood,
        fixtureBacking,
        fixtureEdge,
        backingThickness,
        0,
        "z",
        spineFixtureDeps(ctx),
      ),
    doors: ctx.doors,
    signs: ctx.signs,
  });
  buildShopExpansion(
    ctx,
    architecture,
    floorMaterial,
    wallMaterial,
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    readingFurnitureMaterials,
  );
  // Ceiling-light fixtures live on the spawnable props now; the template
  // is registered here so menu spawning works on every world.
  createCeilingLightTemplate({
    cacheBuiltinPropTemplate: (registration) => ctx.cacheBuiltinPropTemplate(registration),
    isDisposed: () => ctx.disposed,
    modelMixers: ctx.modelMixers,
    needsSeedPass: (version) => ctx.needsSeedPass(version),
    registerMovableProp: (registration) => ctx.registerMovableProp(registration),
  });
  createNightWindows(architecture, (parent2, size, position2, material, castShadow) =>
    ctx.addBox(parent2, size, position2, material, castShadow),
  );
  const fixedTelevision = new ShopTelevision({
    ...ctx.sharedTelevisionOptions(
      ctx.pendingWorldSave?.televisionChannels?.[FIXED_TELEVISION_SAVE_ID],
      ctx.pendingWorldSave?.televisionVolumes?.[FIXED_TELEVISION_SAVE_ID],
    ),
    parent: architecture,
    tableMaterial: woodMaterial,
  });
  ctx.registerTelevision(FIXED_TELEVISION_SAVE_ID, fixedTelevision);
  // Default movable props are not hard-wired into the shop: on fresh and
  // legacy worlds they are injected once through the regular spawn
  // factories and from then on live in the world save like any prop the
  // player placed. Deleting one is permanent.
  ctx.seedDefaultProps();
  createTelevisionTableShelf(architecture, {
    shelfTargetMeshes: ctx.shelfTargetMeshes,
    spineShelfDefinitions: ctx.spineShelfDefinitions,
  });

  ctx.signs.createAisleSignSlot(architecture, "gondola-1", -4.2, "成人向けコミック  18+", "ADULT COMICS · AISLE 01");
  ctx.signs.createAisleSignSlot(architecture, "gondola-2", 4.2, "", "");

  const recommendationCard = createSignVisual(
    "STAFF PICK",
    "深夜のおすすめ",
    1.05,
    0.48,
    "#241b18",
    "#d9b96f",
    SIGN_TEXTURE_MAX_ANISOTROPY,
  );
  recommendationCard.position.set(1.52, 3.38, -9.93);
  recommendationCard.rotation.z = -0.035;
  architecture.add(recommendationCard);
  batchStaticInteriorMeshes(architecture);
};

const createExpansionWalls = (
  ctx: ShopCompositionContext,
  parent: Group,
  upperWallMaterial: MeshStandardMaterial,
  wallMaterial: MeshStandardMaterial,
  darkWallMaterial: MeshStandardMaterial,
  frameMaterial: MeshStandardMaterial,
  glassMaterial: MeshBasicMaterial,
) => {
  createUpperWindowWall(
    parent,
    -10.5,
    0,
    upperWallMaterial,
    frameMaterial,
    glassMaterial,
    ctx.addBox,
    ctx.createPosterSurface,
  );
  createUpperWindowWall(
    parent,
    28,
    Math.PI,
    upperWallMaterial,
    frameMaterial,
    glassMaterial,
    ctx.addBox,
    ctx.createPosterSurface,
  );
  for (const [index, box] of SHOP_EXPANSION_WALL_BOXES.entries()) {
    if (index < 2) continue;
    let roomWall = upperWallMaterial;
    if (box.position[1] < SHOP_UPPER_FLOOR_Y) roomWall = wallMaterial;
    else if (box.position[0] < -16) roomWall = darkWallMaterial;
    ctx.addBox(parent, box.size, box.position, roomWall);
    createWallPosterSurfaces(parent, `expansion-wall-${index + 1}`, box, ctx.createPosterSurface);
  }
};

const createExpansionRoomsAndFixtures = (
  ctx: ShopCompositionContext,
  parent: Group,
  woodMaterial: MeshStandardMaterial,
  shelfBackingMaterial: MeshStandardMaterial,
  shelfEdgeMaterial: MeshStandardMaterial,
  readingFurnitureMaterials: ReadingFurnitureMaterials,
) => {
  for (const door of createHallwayDoor(
    parent,
    "theatre",
    SHOP_THEATRE_HALL.centerX + SHOP_THEATRE_HALL.width / 2 + 0.12,
    SHOP_THEATRE_HALL.centerZ,
    "x",
    -1,
    woodMaterial,
    ctx.addBox,
  ))
    ctx.doors.registerHallwayDoor(door);
  for (const door of createHallwayDoor(
    parent,
    "tv-cave",
    12.38,
    SHOP_TV_CAVE_DOOR_CENTER_Z,
    "x",
    1,
    woodMaterial,
    ctx.addBox,
  ))
    ctx.doors.registerHallwayDoor(door);

  createAtriumRailings(parent, woodMaterial, ctx.addBox);
  createStackableStairwell(parent, woodMaterial, ctx.addBox);
  createSpineShelfFixture(
    parent,
    "mezzanine-west",
    -11.45,
    -5,
    9,
    3,
    [1],
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    SPINE_SHELF_BACKING_THICKNESS,
    SHOP_UPPER_FLOOR_Y,
    "x",
    spineFixtureDeps(ctx),
  );
  createSpineShelfFixture(
    parent,
    "mezzanine-east",
    11.45,
    -5,
    9,
    3,
    [-1],
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    SPINE_SHELF_BACKING_THICKNESS,
    SHOP_UPPER_FLOOR_Y,
    "x",
    spineFixtureDeps(ctx),
  );
  for (const side of [-1, 1] as const)
    for (const [index, z] of SHOP_UPPER_STACK_ZS.entries())
      createSpineShelfFixture(
        parent,
        `mezzanine-${side < 0 ? "west" : "east"}-stack-${index + 1}`,
        side * SHOP_UPPER_STACK_CENTER_X,
        z,
        SHOP_UPPER_STACK_LENGTH,
        2,
        [-1, 1],
        woodMaterial,
        shelfBackingMaterial,
        shelfEdgeMaterial,
        SPINE_SHELF_BACKING_THICKNESS,
        SHOP_UPPER_FLOOR_Y,
        "x",
        spineFixtureDeps(ctx),
      );
  ctx.createUpperReadingFurniture(parent, woodMaterial, readingFurnitureMaterials);
  createTheatreSeating(parent, ctx.addBox);
  createTelevisionRooms(parent, woodMaterial, {
    addBox: ctx.addBox,
    createSpawnedCrtTelevision: (asset, id, scale, pose) => ctx.createSpawnedCrtTelevision(asset, id, scale, pose),
    needsSeedPass: (version) => ctx.needsSeedPass(version),
    registerPropPlacementSupport: (object) => ctx.registerPropPlacementSupport(object),
    registerTelevision: (saveId, television) => ctx.registerTelevision(saveId, television),
    sharedTelevisionOptions: (channelId, volume) => ctx.sharedTelevisionOptions(channelId, volume),
    textureLoader: ctx.textureLoader,
    maxTextureAnisotropy: ctx.renderer.capabilities.getMaxAnisotropy(),
    televisionChannels: ctx.pendingWorldSave?.televisionChannels,
    televisionVolumes: ctx.pendingWorldSave?.televisionVolumes,
  });
  ctx.signs.createRoomSignSlot(
    parent,
    "moonlight-theatre",
    "MOONLIGHT THEATRE",
    "MOONLIGHT THEATRE",
    "SCREENING ROOM · WEST HALL",
    [-12.37, 7.72, 18.5],
    Math.PI / 2,
  );
  ctx.signs.createRoomSignSlot(
    parent,
    "tv-cave",
    "TV CAVE",
    "TV CAVE",
    "SIMULCAST CRT ROOM · EAST ANNEX",
    [12.37, 7.72, SHOP_TV_CAVE_DOOR_CENTER_Z],
    -Math.PI / 2,
  );
};

const createExpansionRoof = (
  ctx: ShopCompositionContext,
  parent: Group,
  ceilingMaterial: MeshStandardMaterial,
  frameMaterial: MeshStandardMaterial,
  glassMaterial: MeshBasicMaterial,
) => {
  const roofMaterial = ceilingMaterial;
  const skylight = SHOP_ATRIUM;
  const skylightWidth = skylight.maxX - skylight.minX;
  const skylightDepth = skylight.maxZ - skylight.minZ;
  const skylightCenterX = (skylight.minX + skylight.maxX) / 2;
  const skylightCenterZ = (skylight.minZ + skylight.maxZ) / 2;
  const roof = createHorizontalShape(
    parent,
    {maxX: 12.5, maxZ: 28, minX: -12.5, minZ: -10.5},
    [skylight],
    SHOP_UPPER_CEILING_Y,
    roofMaterial,
  );
  applyCeilingShapeUv(roof.geometry);
  roof.name = "main-roof";
  const stairRoof = createHorizontalShape(parent, SHOP_STAIR_ROOM, [], SHOP_UPPER_CEILING_Y, roofMaterial);
  applyCeilingShapeUv(stairRoof.geometry);
  stairRoof.name = "stair-tower-roof";
  const skylightGlass = new Mesh(new PlaneGeometry(skylightWidth, skylightDepth), glassMaterial);
  skylightGlass.rotation.x = -Math.PI / 2;
  skylightGlass.position.set(skylightCenterX, SHOP_UPPER_CEILING_Y + 0.015, skylightCenterZ);
  parent.add(skylightGlass);
  for (const [size, position] of [
    [
      [skylightWidth + 0.15, 0.16, 0.16],
      [skylightCenterX, SHOP_UPPER_CEILING_Y + 0.07, skylight.minZ],
    ],
    [
      [skylightWidth + 0.15, 0.16, 0.16],
      [skylightCenterX, SHOP_UPPER_CEILING_Y + 0.07, skylight.maxZ],
    ],
    [
      [0.16, 0.16, skylightDepth + 0.15],
      [skylight.minX, SHOP_UPPER_CEILING_Y + 0.07, skylightCenterZ],
    ],
    [
      [0.16, 0.16, skylightDepth + 0.15],
      [skylight.maxX, SHOP_UPPER_CEILING_Y + 0.07, skylightCenterZ],
    ],
    [
      [0.11, 0.12, skylightDepth],
      [skylightCenterX, SHOP_UPPER_CEILING_Y + 0.09, skylightCenterZ],
    ],
  ] as const)
    ctx.addBox(parent, size, position, frameMaterial, true);

  ctx.addBox(
    parent,
    [SHOP_THEATRE.width, 0.18, SHOP_THEATRE.depth],
    [SHOP_THEATRE.centerX, 15.82, SHOP_THEATRE.centerZ],
    roofMaterial,
  );
  ctx.addBox(
    parent,
    [SHOP_TV_CAVE.width, 0.18, SHOP_TV_CAVE.depth],
    [SHOP_TV_CAVE.centerX, 9.72, SHOP_TV_CAVE.centerZ],
    roofMaterial,
  );
};

const buildShopExpansion = (
  ctx: ShopCompositionContext,
  parent: Group,
  floorMaterial: MeshStandardMaterial,
  wallMaterial: MeshStandardMaterial,
  woodMaterial: MeshStandardMaterial,
  shelfBackingMaterial: MeshStandardMaterial,
  shelfEdgeMaterial: MeshStandardMaterial,
  readingFurnitureMaterials: ReadingFurnitureMaterials,
) => {
  const ceilingMaterial = createCeilingMaterial(ctx.textureLoader, ctx.renderer.capabilities.getMaxAnisotropy());
  createUpperFloorStructures(parent, ceilingMaterial, (object) => ctx.registerPropPlacementSupport(object));
  const stairFloorStructure = new Mesh(
    new BoxGeometry(SHOP_STAIR_ROOM.maxX - SHOP_STAIR_ROOM.minX, 0.18, SHOP_STAIR_ROOM.maxZ - SHOP_STAIR_ROOM.minZ),
    new MeshBasicMaterial({color: "#242a28"}),
  );
  stairFloorStructure.position.set(
    (SHOP_STAIR_ROOM.minX + SHOP_STAIR_ROOM.maxX) / 2,
    -0.092,
    (SHOP_STAIR_ROOM.minZ + SHOP_STAIR_ROOM.maxZ) / 2,
  );
  parent.add(stairFloorStructure);
  createTiledFloorSurface(parent, SHOP_STAIR_ROOM, floorMaterial, [], 0.012);
  createTiledFloorSurface(parent, {maxX: 12.5, maxZ: 28, minX: -12.5, minZ: -10.5}, floorMaterial, [SHOP_ATRIUM]);
  createTiledFloorSurface(
    parent,
    {
      maxX: SHOP_THEATRE_HALL.centerX + SHOP_THEATRE_HALL.width / 2,
      maxZ: SHOP_THEATRE_HALL.centerZ + SHOP_THEATRE_HALL.depth / 2,
      minX: SHOP_THEATRE_HALL.centerX - SHOP_THEATRE_HALL.width / 2,
      minZ: SHOP_THEATRE_HALL.centerZ - SHOP_THEATRE_HALL.depth / 2,
    },
    floorMaterial,
  );
  createTiledFloorSurface(
    parent,
    {
      maxX: SHOP_TV_CAVE_HALL.centerX + SHOP_TV_CAVE_HALL.width / 2,
      maxZ: SHOP_TV_CAVE_HALL.centerZ + SHOP_TV_CAVE_HALL.depth / 2,
      minX: SHOP_TV_CAVE_HALL.centerX - SHOP_TV_CAVE_HALL.width / 2,
      minZ: SHOP_TV_CAVE_HALL.centerZ - SHOP_TV_CAVE_HALL.depth / 2,
    },
    floorMaterial,
  );
  createTiledFloorSurface(
    parent,
    {
      maxX: SHOP_TV_CAVE.centerX + SHOP_TV_CAVE.width / 2,
      maxZ: SHOP_TV_CAVE.centerZ + SHOP_TV_CAVE.depth / 2,
      minX: SHOP_TV_CAVE.centerX - SHOP_TV_CAVE.width / 2,
      minZ: SHOP_TV_CAVE.centerZ - SHOP_TV_CAVE.depth / 2,
    },
    floorMaterial,
  );
  const theatreCarpet = new Mesh(
    new PlaneGeometry(SHOP_THEATRE.width, SHOP_THEATRE.depth),
    new MeshStandardMaterial({
      color: "#211c2b",
      roughness: 1,
    }),
  );
  theatreCarpet.rotation.x = -Math.PI / 2;
  theatreCarpet.position.set(SHOP_THEATRE.centerX, SHOP_UPPER_FLOOR_Y + 0.012, SHOP_THEATRE.centerZ);
  theatreCarpet.receiveShadow = true;
  parent.add(theatreCarpet);

  const upperWallMaterial = wallMaterial.clone();
  upperWallMaterial.color.set("#d7ddd6");
  const darkWallMaterial = wallMaterial.clone();
  darkWallMaterial.color.set("#59626a");
  const frameMaterial = woodMaterial.clone();
  frameMaterial.color.set("#473c36");
  const glassMaterial = new MeshBasicMaterial({
    color: "#183b4d",
    depthWrite: false,
    opacity: 0.32,
    side: DoubleSide,
    transparent: true,
  });
  glassMaterial.forceSinglePass = true;
  createExpansionWalls(ctx, parent, upperWallMaterial, wallMaterial, darkWallMaterial, frameMaterial, glassMaterial);
  createExpansionRoomsAndFixtures(
    ctx,
    parent,
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    readingFurnitureMaterials,
  );

  createExpansionRoof(ctx, parent, ceilingMaterial, frameMaterial, glassMaterial);
};
