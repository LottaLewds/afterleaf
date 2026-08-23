import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  FrontSide,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
  type BufferAttribute,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Material,
  type Object3D,
} from "three";

import type {CatalogItem} from "~/catalog";
import {physicalBookDepth, physicalBookWidth} from "~/game/bookDimensions";
import {PageTextureCache} from "~/game/PageTextureCache";
import {
  getPageBlockSplit,
  writeActiveLeafDeformation,
  writeActiveLeafPositions,
  type ActiveLeafDeformationTarget,
  type ActiveLeafVertex,
} from "~/game/PageTurnGeometry";
import {
  detectWideReaderPage,
  getWideReaderPageIndices,
  readerPageHalf,
  readerPageSourceUrl,
  readerPageTextureUrl,
  subscribeToWideReaderPages,
} from "~/reader/pageSpreadDetection";
import {ReaderPagePreloader} from "~/reader/ReaderPagePreloader";
import {createReaderPagePreloadPlan} from "~/reader/pagePreloadPlan";
import {
  READER_PAGE_TEXTURE_CACHE_SIZE,
  getAdjacentSpreadStart,
  getReaderSpread,
  getReaderSpreadSides,
  type ReaderNavigation,
} from "~/reader/pagination";

const BOOK_HEIGHT = 3.12;
const DEFAULT_BOOK_WIDTH = physicalBookWidth(undefined, BOOK_HEIGHT);
const COVER_DEPTH = 0.018;
const MAX_PIXEL_RATIO = 1.75;
const MAX_COVER_ANGLE = Math.PI * 0.94;
const PAGE_TURN_DURATION_SECONDS = 0.72;
const PAGE_TURN_OPEN_THRESHOLD = 0.82;
const PAGE_HEIGHT = BOOK_HEIGHT - 0.14;
const PAGE_SURFACE_GAP = 0.006;
const PAGE_WIDTH_SEGMENTS = 24;
const PAGE_HEIGHT_SEGMENTS = 16;

export type BookInspectSceneOptions = {
  canvas: HTMLCanvasElement;
  initialPageIndex?: () => number;
  publication: () => CatalogItem | undefined;
  onCoverOpenChange?: (amount: number) => void;
  onPageIndexChange?: (pageIndex: number) => void;
  onReady?: () => void;
  paused?: () => boolean;
};

const disposeMaterial = (material: Material, textures: Set<Texture>) => {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) textures.add(value);
  }
  material.dispose();
};

const disposeObject = (root: Object3D) => {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) disposeMaterial(material, textures);
  for (const texture of textures) texture.dispose();
};

const pageCount = (publication: CatalogItem) => {
  const pages = publication.pages.length;
  return pages > 0 ? pages : undefined;
};

/**
 * A persistent, renderer-owning physical-book viewer. Solid owns selection;
 * this scene samples one narrow accessor and updates the existing book model.
 */
export class BookInspectScene {
  readonly #abortController = new AbortController();
  readonly #backMaterial = new MeshStandardMaterial({roughness: 0.66});
  readonly #book = new Group();
  readonly #camera = new PerspectiveCamera(38, 1, 0.1, 30);
  readonly #canvas: HTMLCanvasElement;
  readonly #coverEdgeMaterial = new MeshStandardMaterial({roughness: 0.62});
  readonly #coverInsideMaterial = new MeshStandardMaterial({
    color: "#d8d0c2",
    roughness: 0.8,
  });
  readonly #frontCover = new Mesh<BoxGeometry, MeshStandardMaterial[]>();
  readonly #frontHinge = new Group();
  readonly #frontMaterial = new MeshStandardMaterial({roughness: 0.58});
  readonly #closedPageBlock = new Mesh<BoxGeometry, MeshStandardMaterial>();
  readonly #leftPageBlock = new Mesh<BoxGeometry, MeshStandardMaterial>();
  readonly #pageMaterial = new MeshStandardMaterial({
    color: "#d8d0bc",
    roughness: 0.94,
  });
  readonly #activeLeafFrontMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.82,
    side: FrontSide,
  });
  readonly #activeLeafBackMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.84,
    side: BackSide,
  });
  readonly #activeLeaf = new Mesh<PlaneGeometry, MeshStandardMaterial[]>();
  readonly #activeLeafDeformation: ActiveLeafDeformationTarget = {
    normalized: 0,
    eased: 0,
    phase: "peel",
    phaseProgress: 0,
    sourceSide: 1,
    turnAngle: 0,
    lift: 0,
    curl: 0,
    torsion: 0,
  };
  readonly #activeLeafVertex: ActiveLeafVertex = {x: 0, y: 0, z: 0};
  readonly #leftPageSurface = new Mesh<PlaneGeometry, MeshStandardMaterial>();
  readonly #leftPageSurfaceMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.82,
  });
  readonly #rightPageSurface = new Mesh<PlaneGeometry, MeshStandardMaterial>();
  readonly #rightPageSurfaceMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.82,
  });
  readonly #pageTextureCache = new PageTextureCache<Texture>({
    load: (url) => this.#loadPageTexture(url),
    maxEntries: READER_PAGE_TEXTURE_CACHE_SIZE,
  });
  readonly #pagePreloader = new ReaderPagePreloader({
    maxEntries: READER_PAGE_TEXTURE_CACHE_SIZE,
  });
  readonly #publication: () => CatalogItem | undefined;
  readonly #initialPageIndex: (() => number) | undefined;
  readonly #paused: () => boolean;
  readonly #renderer: WebGLRenderer;
  readonly #rightPageBlock = new Mesh<BoxGeometry, MeshStandardMaterial>();
  readonly #scene = new Scene();
  readonly #spine = new Mesh<BoxGeometry, MeshStandardMaterial>();
  readonly #spineLabel = new Mesh<PlaneGeometry, MeshStandardMaterial>();
  readonly #spineMaterial = new MeshStandardMaterial({roughness: 0.64});
  readonly #spineLabelMaterial = new MeshStandardMaterial({roughness: 0.7});
  readonly #textureLoader = new TextureLoader();

  #coverOpen = 0;
  #coverOpenTarget = 0;
  #disposed = false;
  #bookWidth = DEFAULT_BOOK_WIDTH;
  #draggingPointerId: number | undefined;
  #frameHandle: number | undefined;
  #lastFrameTime = 0;
  #lastPointerX = 0;
  #lastPointerY = 0;
  #lastPublicationSignature: string | undefined;
  #lastPixelRatio = 0;
  #onCoverOpenChange: ((amount: number) => void) | undefined;
  #onPageIndexChange: ((pageIndex: number) => void) | undefined;
  #onReady: (() => void) | undefined;
  #pitch = -0.08;
  #pitchTarget = -0.08;
  // Annotated as plain Float32Array (ArrayBufferLike) so the geometry
  // attribute's backing buffers can be aliased directly without copying.
  #activeLeafPositions: Float32Array = new Float32Array();
  #activeLeafPositionAttribute:
    | BufferAttribute
    | InterleavedBufferAttribute
    | undefined;
  #activeLeafTurnUvs: Float32Array = new Float32Array();
  #activeLeafUvs: Float32Array = new Float32Array();
  #leftPageDepth = 0;
  #pageIndex = 0;
  #pageLoadRevision = 0;
  #pagePlaneZ = 0;
  #pageWidth = DEFAULT_BOOK_WIDTH - 0.12;
  #pageTextureUrls = new Set<string>();
  #pageTurnDirection: -1 | 0 | 1 = 0;
  #pageTurnElapsed = 0;
  #pageTurnPreparing = false;
  #pageTurnRevision = 0;
  #pageTurnTargetIndex = 0;
  #pageTurnTextureUrls = new Set<string>();
  #queuedPageTurn: -1 | 0 | 1 = 0;
  #paperDepth = 0.3;
  #ready = false;
  #resizeDirty = true;
  #resizeObserver: ResizeObserver | undefined;
  #rightPageDepth = 0;
  #spineX = -DEFAULT_BOOK_WIDTH / 2;
  #textureRevision = 0;
  #viewportHeight = 1;
  #viewportWidth = 1;
  #yaw = -0.3;
  #yawTarget = -0.3;

  constructor(options: BookInspectSceneOptions) {
    this.#canvas = options.canvas;
    this.#initialPageIndex = options.initialPageIndex;
    this.#publication = options.publication;
    this.#paused = options.paused ?? (() => false);
    this.#onCoverOpenChange = options.onCoverOpenChange;
    this.#onPageIndexChange = options.onPageIndexChange;
    this.#onReady = options.onReady;

    this.#renderer = new WebGLRenderer({
      antialias: true,
      canvas: this.#canvas,
      powerPreference: "high-performance",
    });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFSoftShadowMap;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.08;

    this.#configureScene();
    this.#createBook();
    this.#createInspectionTable();
    this.#bindInput();
    this.#observeSize();
    const unsubscribeFromWidePages = subscribeToWideReaderPages((url) =>
      this.#handleDetectedWidePage(url),
    );
    this.#abortController.signal.addEventListener(
      "abort",
      unsubscribeFromWidePages,
      {once: true},
    );
    this.#syncPublication();
  }

  start() {
    if (this.#disposed || this.#frameHandle !== undefined) return;
    this.#lastFrameTime = performance.now();
    this.#applyResize();
    this.#renderer.render(this.#scene, this.#camera);
    this.#markReady();
    this.#frameHandle = requestAnimationFrame(this.#animate);
  }

  setCoverOpen(amount: number) {
    const nextAmount = MathUtils.clamp(amount, 0, 1);
    if (nextAmount === this.#coverOpenTarget) return;
    this.#coverOpenTarget = nextAmount;
    this.#onCoverOpenChange?.(nextAmount);
  }

  nudgeCover(delta: number) {
    this.setCoverOpen(this.#coverOpenTarget + delta);
  }

  turnPage(delta: number) {
    const publication = this.#publication();
    if (!publication || publication.pages.length === 0) return;
    const truncatedDelta = Math.trunc(delta);
    const direction: -1 | 0 | 1 =
      truncatedDelta > 0 ? 1 : truncatedDelta < 0 ? -1 : 0;
    if (direction === 0) return;
    if (this.#pageTurnDirection !== 0 || this.#pageTurnPreparing) {
      // Buffer the latest intent; it fires once the in-flight turn finishes.
      this.#queuedPageTurn = direction;
      return;
    }
    const navigation: ReaderNavigation = direction > 0 ? "forward" : "backward";
    const nextPageIndex = getAdjacentSpreadStart(
      this.#pageIndex,
      publication.pages.length,
      "spread",
      navigation,
      getWideReaderPageIndices(publication.pages),
    );
    if (nextPageIndex === this.#pageIndex) return;
    this.setCoverOpen(1);
    void this.#preparePageTurn(
      publication,
      nextPageIndex,
      direction > 0 ? 1 : -1,
    );
  }

  resetView() {
    this.#yawTarget = -0.3;
    this.#pitchTarget = -0.08;
    this.setCoverOpen(0);
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#textureRevision += 1;
    this.#releasePageTextures();
    this.#pageTextureCache.dispose();
    this.#leftPageSurfaceMaterial.map = null;
    this.#rightPageSurfaceMaterial.map = null;
    this.#activeLeafFrontMaterial.map = null;
    this.#activeLeafBackMaterial.map = null;
    this.#abortController.abort();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    if (this.#frameHandle !== undefined)
      cancelAnimationFrame(this.#frameHandle);
    this.#frameHandle = undefined;

    disposeObject(this.#scene);
    this.#scene.clear();
    this.#renderer.renderLists.dispose();
    this.#renderer.dispose();
    this.#canvas.style.cursor = "";
  }

  readonly #animate = (time: number) => {
    if (this.#disposed) return;
    const deltaSeconds = Math.min((time - this.#lastFrameTime) / 1000, 0.05);
    this.#lastFrameTime = time;

    if (this.#paused()) {
      this.#frameHandle = requestAnimationFrame(this.#animate);
      return;
    }

    this.#syncPublication();
    this.#syncPixelRatio();
    if (this.#resizeDirty) this.#applyResize();

    this.#yaw = MathUtils.damp(this.#yaw, this.#yawTarget, 13, deltaSeconds);
    this.#pitch = MathUtils.damp(
      this.#pitch,
      this.#pitchTarget,
      13,
      deltaSeconds,
    );
    this.#coverOpen = MathUtils.damp(
      this.#coverOpen,
      this.#coverOpenTarget,
      11,
      deltaSeconds,
    );
    const spreadCentering = MathUtils.clamp(
      (this.#coverOpen - 0.45) / 0.5,
      0,
      1,
    );
    this.#book.position.x = MathUtils.damp(
      this.#book.position.x,
      -this.#spineX * spreadCentering,
      10,
      deltaSeconds,
    );
    this.#book.rotation.set(this.#pitch, this.#yaw, 0);
    const direction = this.#publication()?.direction ?? "LTR";
    this.#frontHinge.rotation.y =
      this.#coverOpen * MAX_COVER_ANGLE * (direction === "LTR" ? -1 : 1);
    const horizontalFieldOfView =
      2 *
      Math.atan(
        Math.tan(MathUtils.degToRad(this.#camera.fov) / 2) *
          this.#camera.aspect,
      );
    const visibleBookWidth = this.#bookWidth * (1 + spreadCentering);
    const cameraDistance =
      visibleBookWidth / (2 * Math.tan(horizontalFieldOfView / 2) * 0.84);
    this.#camera.position.z = MathUtils.damp(
      this.#camera.position.z,
      Math.max(7.4, cameraDistance),
      10,
      deltaSeconds,
    );
    this.#updatePageTurn(deltaSeconds);
    this.#syncPageRigVisibility();

    this.#renderer.render(this.#scene, this.#camera);
    this.#frameHandle = requestAnimationFrame(this.#animate);
  };

  #configureScene() {
    this.#scene.background = new Color("#151817");
    this.#camera.position.set(0, 2.58, 7.4);
    this.#camera.lookAt(0, 2.05, 0);

    this.#scene.add(new AmbientLight("#b8c3be", 0.84));

    const keyLight = new DirectionalLight("#fff0d7", 3.1);
    keyLight.position.set(-3.8, 7, 5.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -2;
    keyLight.shadow.bias = -0.00035;
    this.#scene.add(keyLight);

    const rimLight = new DirectionalLight("#a8c8cc", 1.25);
    rimLight.position.set(4, 4.5, -3);
    this.#scene.add(rimLight);
  }

  #createBook() {
    this.#book.name = "inspectable-book";
    this.#book.position.set(0, 2.24, 0);
    this.#scene.add(this.#book);

    const pageBlockGeometry = new BoxGeometry(1, 1, 1);
    for (const [name, pageBlock] of [
      ["closed-page-block", this.#closedPageBlock],
      ["left-page-block", this.#leftPageBlock],
      ["right-page-block", this.#rightPageBlock],
    ] as const) {
      pageBlock.geometry = pageBlockGeometry;
      pageBlock.material = this.#pageMaterial;
      pageBlock.name = name;
      pageBlock.castShadow = true;
      pageBlock.receiveShadow = true;
      this.#book.add(pageBlock);
    }

    const backCover = new Mesh<BoxGeometry, MeshStandardMaterial[]>(
      new BoxGeometry(1, 1, 1),
      [
        this.#coverEdgeMaterial,
        this.#coverEdgeMaterial,
        this.#coverEdgeMaterial,
        this.#coverEdgeMaterial,
        this.#coverInsideMaterial,
        this.#backMaterial,
      ],
    );
    backCover.name = "back-cover";
    backCover.castShadow = true;
    backCover.receiveShadow = true;
    this.#book.add(backCover);

    this.#frontCover.geometry = new BoxGeometry(1, 1, 1);
    this.#frontCover.material = [
      this.#coverEdgeMaterial,
      this.#coverEdgeMaterial,
      this.#coverEdgeMaterial,
      this.#coverEdgeMaterial,
      this.#frontMaterial,
      this.#coverInsideMaterial,
    ];
    this.#frontCover.name = "front-cover";
    this.#frontCover.castShadow = true;
    this.#frontCover.receiveShadow = true;
    this.#frontHinge.add(this.#frontCover);
    this.#book.add(this.#frontHinge);

    this.#spine.geometry = new BoxGeometry(1, 1, 1);
    this.#spine.material = this.#spineMaterial;
    this.#spine.name = "spine";
    this.#spine.castShadow = true;
    this.#book.add(this.#spine);

    this.#spineLabel.geometry = new PlaneGeometry(1, 1);
    this.#spineLabel.material = this.#spineLabelMaterial;
    this.#spineLabel.name = "spine-label";
    this.#book.add(this.#spineLabel);

    for (const [name, surface, material] of [
      [
        "left-page-surface",
        this.#leftPageSurface,
        this.#leftPageSurfaceMaterial,
      ],
      [
        "right-page-surface",
        this.#rightPageSurface,
        this.#rightPageSurfaceMaterial,
      ],
    ] as const) {
      surface.geometry = new PlaneGeometry(1, 1);
      surface.material = material;
      surface.name = name;
      this.#book.add(surface);
    }

    const activeLeafGeometry = new PlaneGeometry(
      1,
      1,
      PAGE_WIDTH_SEGMENTS,
      PAGE_HEIGHT_SEGMENTS,
    );
    const activeLeafIndexCount = activeLeafGeometry.index?.count ?? 0;
    activeLeafGeometry.clearGroups();
    activeLeafGeometry.addGroup(0, activeLeafIndexCount, 0);
    activeLeafGeometry.addGroup(0, activeLeafIndexCount, 1);
    this.#activeLeaf.geometry = activeLeafGeometry;
    this.#activeLeaf.material = [
      this.#activeLeafFrontMaterial,
      this.#activeLeafBackMaterial,
    ];
    this.#activeLeaf.name = "turning-page-leaf";
    this.#activeLeaf.castShadow = true;
    this.#activeLeaf.frustumCulled = false;
    this.#activeLeaf.visible = false;
    this.#book.add(this.#activeLeaf);

    const uvAttribute = activeLeafGeometry.getAttribute("uv");
    const positionAttribute = activeLeafGeometry.getAttribute("position");
    if (
      uvAttribute.array instanceof Float32Array &&
      positionAttribute.array instanceof Float32Array
    ) {
      this.#activeLeafUvs = uvAttribute.array;
      this.#activeLeafTurnUvs = new Float32Array(uvAttribute.array.length);
      this.#activeLeafPositions = positionAttribute.array;
      this.#activeLeafPositionAttribute = positionAttribute;
    }
  }

  #createInspectionTable() {
    const tableMaterial = new MeshStandardMaterial({
      color: "#5d5c56",
      metalness: 0.08,
      roughness: 0.82,
    });
    const table = new Mesh(
      new CylinderGeometry(4.3, 4.55, 0.34, 64),
      tableMaterial,
    );
    table.position.y = 0.25;
    table.receiveShadow = true;
    this.#scene.add(table);

    const backdropMaterial = new MeshStandardMaterial({
      color: "#202321",
      roughness: 0.98,
    });
    const backdrop = new Mesh(new PlaneGeometry(18, 18), backdropMaterial);
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.y = 0;
    backdrop.receiveShadow = true;
    this.#scene.add(backdrop);

    const cradleMaterial = new MeshStandardMaterial({
      color: "#353a38",
      metalness: 0.42,
      roughness: 0.38,
    });
    for (const x of [-0.68, 0.68]) {
      const rest = new Mesh(new BoxGeometry(0.13, 0.28, 0.72), cradleMaterial);
      rest.position.set(x, 0.58, 0.12);
      rest.rotation.z = x < 0 ? -0.16 : 0.16;
      rest.castShadow = true;
      rest.receiveShadow = true;
      this.#scene.add(rest);
    }
  }

  #syncPublication() {
    const publication = this.#publication();
    if (!publication) {
      if (this.#lastPublicationSignature !== undefined) {
        this.#textureRevision += 1;
        this.#cancelPageTurn();
        this.#releasePageTextures();
      }
      this.#book.visible = false;
      this.#lastPublicationSignature = undefined;
      return;
    }

    const pages = pageCount(publication);
    const signature = [
      publication.id,
      publication.cover,
      publication.detailCover ?? "no-detail-cover",
      publication.back ?? "generated-back",
      publication.title,
      publication.accent,
      publication.aspectRatio ?? "default-aspect",
      publication.direction,
      publication.thicknessMm,
      publication.pages.join("\u0000"),
    ].join("|");
    this.#book.visible = true;
    if (signature === this.#lastPublicationSignature) return;
    this.#lastPublicationSignature = signature;
    this.#applyPublication(publication, pages);
  }

  #applyPublication(publication: CatalogItem, pages: number | undefined) {
    this.#cancelPageTurn();
    const bookDepth = physicalBookDepth(publication.thicknessMm, BOOK_HEIGHT);
    const bookWidth = physicalBookWidth(publication.aspectRatio, BOOK_HEIGHT);
    const pageWidth = Math.max(0.2, bookWidth - 0.12);
    const pageDepth = Math.max(0.012, bookDepth - COVER_DEPTH * 2);
    const spineX =
      publication.direction === "LTR" ? -bookWidth / 2 : bookWidth / 2;
    const coverOffsetX = -spineX;

    this.#paperDepth = pageDepth;
    this.#bookWidth = bookWidth;
    this.#pageWidth = pageWidth;
    this.#pagePlaneZ = pageDepth / 2 + PAGE_SURFACE_GAP;
    this.#spineX = spineX;
    this.#closedPageBlock.scale.set(
      bookWidth - 0.075,
      BOOK_HEIGHT - 0.08,
      pageDepth,
    );
    this.#closedPageBlock.position.set(-Math.sign(spineX) * 0.025, 0, 0);
    this.#leftPageSurface.scale.set(pageWidth, PAGE_HEIGHT, 1);
    this.#rightPageSurface.scale.set(pageWidth, PAGE_HEIGHT, 1);
    this.#activeLeaf.position.set(spineX, 0, this.#pagePlaneZ);
    for (let index = 0; index < this.#activeLeafUvs.length; index += 2) {
      const textureU = this.#activeLeafUvs[index] ?? 0;
      this.#activeLeafTurnUvs[index] =
        publication.direction === "LTR" ? textureU : 1 - textureU;
      this.#activeLeafTurnUvs[index + 1] = this.#activeLeafUvs[index + 1] ?? 0;
    }

    const backCover = this.#book.getObjectByName("back-cover");
    if (backCover instanceof Mesh) {
      backCover.scale.set(bookWidth, BOOK_HEIGHT, COVER_DEPTH);
      backCover.position.set(0, 0, -bookDepth / 2 + COVER_DEPTH / 2);
    }

    this.#frontHinge.position.set(spineX, 0, bookDepth / 2 - COVER_DEPTH / 2);
    this.#frontCover.scale.set(bookWidth, BOOK_HEIGHT, COVER_DEPTH);
    this.#frontCover.position.set(coverOffsetX, 0, 0);

    this.#spine.scale.set(COVER_DEPTH * 1.7, BOOK_HEIGHT, bookDepth);
    this.#spine.position.set(spineX, 0, 0);

    const outerSpineX = spineX + Math.sign(spineX) * COVER_DEPTH * 0.87;
    this.#spineLabel.scale.set(bookDepth * 0.72, BOOK_HEIGHT * 0.76, 1);
    this.#spineLabel.position.set(outerSpineX, 0, 0);
    this.#spineLabel.rotation.set(
      0,
      spineX < 0 ? -Math.PI / 2 : Math.PI / 2,
      0,
    );

    const accent = new Color(publication.accent);
    this.#coverEdgeMaterial.color.copy(accent).multiplyScalar(0.68);
    this.#spineMaterial.color.copy(accent).multiplyScalar(0.78);
    this.#coverEdgeMaterial.needsUpdate = true;
    this.#spineMaterial.needsUpdate = true;

    const pageTexture = this.#createPageTexture(pages);
    this.#replaceMap(this.#pageMaterial, pageTexture);
    const fallbackCover = this.#createCoverTexture(
      publication.title,
      publication.collection,
      publication.accent,
    );
    this.#replaceMap(this.#frontMaterial, fallbackCover);
    this.#replaceMap(
      this.#backMaterial,
      this.#createBackTexture(publication.title, publication.accent),
    );
    this.#replaceMap(
      this.#spineLabelMaterial,
      this.#createSpineTexture(publication.title, publication.accent),
    );

    this.#textureRevision += 1;
    const revision = this.#textureRevision;
    let requestedTexture: Texture | undefined;
    requestedTexture = this.#textureLoader.load(
      publication.detailCover ?? publication.cover,
      (texture) => {
        if (this.#disposed || revision !== this.#textureRevision) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.anisotropy = Math.min(
          8,
          this.#renderer.capabilities.getMaxAnisotropy(),
        );
        this.#replaceMap(this.#frontMaterial, texture);
      },
      undefined,
      () => {
        // The generated jacket remains visible when a local asset is missing.
        requestedTexture?.dispose();
      },
    );
    if (publication.back) {
      let requestedBackTexture: Texture | undefined;
      requestedBackTexture = this.#textureLoader.load(
        publication.back,
        (texture) => {
          if (this.#disposed || revision !== this.#textureRevision) {
            texture.dispose();
            return;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.minFilter = LinearFilter;
          texture.anisotropy = Math.min(
            8,
            this.#renderer.capabilities.getMaxAnisotropy(),
          );
          this.#replaceMap(this.#backMaterial, texture);
        },
        undefined,
        () => requestedBackTexture?.dispose(),
      );
    }

    this.#releasePageTextures();
    const initialPageIndex = this.#initialPageIndex?.();
    const defaultPageIndex = publication.pages.length > 1 ? 1 : 0;
    const requestedPageIndex = Number.isSafeInteger(initialPageIndex)
      ? MathUtils.clamp(initialPageIndex ?? 0, 0, publication.pages.length - 1)
      : defaultPageIndex;
    this.#pageIndex = getReaderSpread(
      requestedPageIndex,
      publication.pages.length,
      "spread",
      getWideReaderPageIndices(publication.pages),
    ).start;
    this.#applyPageBlockLayout(publication);
    this.#updateActiveLeafGeometry(0, publication.direction);
    this.#syncPageRigVisibility();
    this.#onPageIndexChange?.(this.#pageIndex);
    void this.#syncPageTextures(publication);
  }

  #applyPageBlockLayout(publication: CatalogItem) {
    const split = getPageBlockSplit({
      committedPageIndex: this.#pageIndex,
      direction: publication.direction,
      totalDepth: this.#paperDepth,
      totalPages: publication.pages.length,
    });
    this.#leftPageDepth = split.left.depth;
    this.#rightPageDepth = split.right.depth;

    this.#leftPageBlock.scale.set(
      this.#pageWidth,
      PAGE_HEIGHT,
      split.left.depth,
    );
    this.#leftPageBlock.position.set(
      this.#spineX - this.#pageWidth / 2,
      0,
      this.#pagePlaneZ - split.left.centerOffset,
    );
    this.#rightPageBlock.scale.set(
      this.#pageWidth,
      PAGE_HEIGHT,
      split.right.depth,
    );
    this.#rightPageBlock.position.set(
      this.#spineX + this.#pageWidth / 2,
      0,
      this.#pagePlaneZ - split.right.centerOffset,
    );

    this.#leftPageSurface.position.set(
      this.#spineX - this.#pageWidth / 2,
      0,
      this.#pagePlaneZ + PAGE_SURFACE_GAP,
    );
    this.#rightPageSurface.position.set(
      this.#spineX + this.#pageWidth / 2,
      0,
      this.#pagePlaneZ + PAGE_SURFACE_GAP,
    );
  }

  #updatePageTurn(deltaSeconds: number) {
    if (this.#pageTurnDirection === 0) return;
    const publication = this.#publication();
    if (!publication || publication.pages.length === 0) {
      this.#cancelPageTurn();
      return;
    }

    if (this.#coverOpenTarget !== 1) this.setCoverOpen(1);
    if (this.#coverOpen < PAGE_TURN_OPEN_THRESHOLD) return;
    this.#pageTurnElapsed = Math.min(
      PAGE_TURN_DURATION_SECONDS,
      this.#pageTurnElapsed + deltaSeconds,
    );
    const progress = this.#pageTurnElapsed / PAGE_TURN_DURATION_SECONDS;
    this.#updateActiveLeafGeometry(
      this.#pageTurnDirection > 0 ? progress : 1 - progress,
      publication.direction,
    );
    if (progress < 1) return;

    if (this.#pageTurnDirection > 0) {
      if (publication.direction === "LTR")
        this.#setMaterialTexture(
          this.#leftPageSurfaceMaterial,
          this.#activeLeafBackMaterial.map,
        );
      else
        this.#setMaterialTexture(
          this.#rightPageSurfaceMaterial,
          this.#activeLeafBackMaterial.map,
        );
    } else if (publication.direction === "LTR")
      this.#setMaterialTexture(
        this.#rightPageSurfaceMaterial,
        this.#activeLeafFrontMaterial.map,
      );
    else
      this.#setMaterialTexture(
        this.#leftPageSurfaceMaterial,
        this.#activeLeafFrontMaterial.map,
      );
    this.#pageIndex = this.#pageTurnTargetIndex;
    this.#pageTurnDirection = 0;
    this.#pageTurnElapsed = 0;
    this.#applyPageBlockLayout(publication);
    this.#onPageIndexChange?.(this.#pageIndex);
    this.#syncPageRigVisibility();
    void this.#syncPageTextures(publication);
    // Start the queued turn before releasing the finished turn's textures:
    // preparing re-acquires every URL still assigned to a material, so the
    // release below cannot evict a texture that is on screen.
    const queuedTurn = this.#queuedPageTurn;
    this.#queuedPageTurn = 0;
    if (queuedTurn !== 0) this.turnPage(queuedTurn);
    this.#releasePageTurnTextures();
  }

  #updateActiveLeafGeometry(
    progress: number,
    direction: CatalogItem["direction"],
  ) {
    writeActiveLeafDeformation(
      this.#activeLeafDeformation,
      progress,
      direction,
    );
    writeActiveLeafPositions(
      this.#activeLeafTurnUvs,
      this.#activeLeafPositions,
      this.#pageWidth,
      PAGE_HEIGHT,
      this.#activeLeafDeformation,
      this.#activeLeafVertex,
    );
    if (this.#activeLeafPositionAttribute)
      this.#activeLeafPositionAttribute.needsUpdate = true;
  }

  #cancelPageTurn() {
    this.#pageTurnRevision += 1;
    this.#pageTurnPreparing = false;
    this.#pageTurnDirection = 0;
    this.#pageTurnElapsed = 0;
    this.#pageTurnTargetIndex = this.#pageIndex;
    this.#queuedPageTurn = 0;
    this.#releasePageTurnTextures();
    this.#activeLeafFrontMaterial.map = null;
    this.#activeLeafBackMaterial.map = null;
    this.#activeLeaf.visible = false;
  }

  #syncPageRigVisibility() {
    const publication = this.#publication();
    const hasPages = (publication?.pages.length ?? 0) > 0;
    const spreadOpen = this.#coverOpen > 0.68 || this.#pageTurnDirection !== 0;
    const activeLeafVisible =
      this.#pageTurnDirection !== 0 && this.#coverOpen > 0.68;

    this.#closedPageBlock.visible = hasPages && !spreadOpen;
    this.#leftPageBlock.visible =
      hasPages && spreadOpen && this.#leftPageDepth > 0;
    this.#rightPageBlock.visible =
      hasPages && spreadOpen && this.#rightPageDepth > 0;
    this.#activeLeaf.visible = hasPages && activeLeafVisible;
    this.#leftPageSurface.visible =
      hasPages && spreadOpen && this.#leftPageSurfaceMaterial.map !== null;
    this.#rightPageSurface.visible =
      hasPages && spreadOpen && this.#rightPageSurfaceMaterial.map !== null;
  }

  #spreadPageUrls(publication: CatalogItem, pageIndex: number) {
    const widePages = getWideReaderPageIndices(publication.pages);
    const spreadSides = getReaderSpreadSides(
      pageIndex,
      publication.pages.length,
      publication.direction,
      widePages,
    );
    const isWideSpread = widePages.has(pageIndex);
    const pageUrl = (
      index: number | undefined,
      half: "left" | "right" | undefined,
    ) => {
      const url = publication.pages[index ?? -1];
      return url ? readerPageTextureUrl(url, half) : undefined;
    };
    return {
      left: pageUrl(spreadSides.left, isWideSpread ? "left" : undefined),
      right: pageUrl(spreadSides.right, isWideSpread ? "right" : undefined),
    };
  }

  async #preparePageTurn(
    publication: CatalogItem,
    targetPageIndex: number,
    direction: -1 | 1,
  ) {
    const revision = ++this.#pageTurnRevision;
    this.#pageTurnPreparing = true;
    const current = this.#spreadPageUrls(publication, this.#pageIndex);
    const target = this.#spreadPageUrls(publication, targetPageIndex);
    const requestedUrls = new Set(
      [current.left, current.right, target.left, target.right].filter(
        (url): url is string => url !== undefined,
      ),
    );
    const textures = new Map<string, Texture>();
    await Promise.all(
      [...requestedUrls].map(async (url) => {
        try {
          textures.set(url, await this.#pageTextureCache.acquire(url));
        } catch {
          // A missing leaf texture degrades to the paper material.
        }
      }),
    );
    if (
      this.#disposed ||
      revision !== this.#pageTurnRevision ||
      this.#publication()?.id !== publication.id
    ) {
      for (const url of textures.keys()) this.#pageTextureCache.release(url);
      return;
    }

    this.#pageTurnTextureUrls = new Set(textures.keys());
    const ltr = publication.direction === "LTR";
    const currentSource = ltr ? current.right : current.left;
    const currentTurned = ltr ? current.left : current.right;
    const targetSource = ltr ? target.right : target.left;
    const targetTurned = ltr ? target.left : target.right;
    const frontUrl = direction > 0 ? currentSource : targetSource;
    const backUrl = direction > 0 ? targetTurned : currentTurned;
    let baseLeftUrl = current.left;
    let baseRightUrl = current.right;
    if (direction > 0) {
      if (ltr) baseRightUrl = target.right;
      else baseLeftUrl = target.left;
    } else if (ltr) baseLeftUrl = target.left;
    else baseRightUrl = target.right;

    this.#setMaterialTexture(
      this.#leftPageSurfaceMaterial,
      baseLeftUrl ? textures.get(baseLeftUrl) : undefined,
    );
    this.#setMaterialTexture(
      this.#rightPageSurfaceMaterial,
      baseRightUrl ? textures.get(baseRightUrl) : undefined,
    );
    this.#setMaterialTexture(
      this.#activeLeafFrontMaterial,
      frontUrl ? textures.get(frontUrl) : undefined,
    );
    this.#setMaterialTexture(
      this.#activeLeafBackMaterial,
      backUrl ? textures.get(backUrl) : undefined,
    );
    this.#pageTurnPreparing = false;
    this.#pageTurnDirection = direction;
    this.#pageTurnElapsed = 0;
    this.#pageTurnTargetIndex = targetPageIndex;
    this.#updateActiveLeafGeometry(
      direction > 0 ? 0 : 1,
      publication.direction,
    );
    this.#syncPageRigVisibility();
  }

  #loadPageTexture(url: string) {
    return new Promise<Texture>((resolvePromise, rejectPromise) => {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#textureLoader.load(
        url,
        (texture) => {
          const image = texture.image;
          const publication = this.#publication();
          if (image instanceof HTMLImageElement && publication)
            detectWideReaderPage(
              url,
              image.naturalWidth,
              image.naturalHeight,
              physicalBookWidth(publication.aspectRatio, 1),
            );
          const half = readerPageHalf(url);
          if (half) {
            texture.repeat.x = 0.5;
            texture.offset.x = half === "left" ? 0 : 0.5;
            texture.needsUpdate = true;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.minFilter = LinearFilter;
          texture.anisotropy = Math.min(
            8,
            this.#renderer.capabilities.getMaxAnisotropy(),
          );
          resolvePromise(texture);
        },
        undefined,
        (error) => {
          requestedTexture?.dispose();
          rejectPromise(
            error instanceof Error
              ? error
              : new Error(`Could not load reader page ${url}`),
          );
        },
      );
    });
  }

  #setMaterialTexture(
    material: MeshStandardMaterial,
    texture: Texture | null | undefined,
  ) {
    material.map = texture ?? null;
    material.needsUpdate = true;
  }

  #releasePageTurnTextures() {
    for (const url of this.#pageTurnTextureUrls)
      this.#pageTextureCache.release(url);
    this.#pageTurnTextureUrls.clear();
  }

  #releasePageTextures() {
    this.#pageLoadRevision += 1;
    for (const url of this.#pageTextureUrls)
      this.#pageTextureCache.release(url);
    this.#pageTextureUrls.clear();
    this.#setMaterialTexture(this.#leftPageSurfaceMaterial, null);
    this.#setMaterialTexture(this.#rightPageSurfaceMaterial, null);
    this.#setMaterialTexture(this.#activeLeafFrontMaterial, null);
    this.#setMaterialTexture(this.#activeLeafBackMaterial, null);
  }

  async #syncPageTextures(publication: CatalogItem) {
    const spreadUrls = this.#spreadPageUrls(publication, this.#pageIndex);
    const requestedUrls = new Set(
      [spreadUrls.left, spreadUrls.right].filter(
        (url): url is string => url !== undefined,
      ),
    );
    const revision = ++this.#pageLoadRevision;
    const turnRevision = this.#pageTurnRevision;
    const textures = new Map<string, Texture>();
    const preloadPlan = createReaderPagePreloadPlan({
      pageCount: publication.pages.length,
      pageIndex: this.#pageIndex,
      pageUrl: (pageIndex) => publication.pages[pageIndex],
      requestedUrls,
      widePageIndices: getWideReaderPageIndices(publication.pages),
    });
    const requestedTextureLoads = [...requestedUrls].map(async (url) => {
      try {
        textures.set(url, await this.#pageTextureCache.acquire(url));
      } catch {
        // Keep the paper surface visible when an individual page is missing.
      }
    });
    for (const url of preloadPlan.httpUrls)
      void this.#pagePreloader.preload(url).catch(() => {});
    await Promise.all(requestedTextureLoads);
    if (
      this.#disposed ||
      revision !== this.#pageLoadRevision ||
      // A page turn prepared after this sync started owns the surface
      // materials; applying spread textures here would flash mid-turn.
      turnRevision !== this.#pageTurnRevision ||
      this.#publication()?.id !== publication.id
    ) {
      for (const url of textures.keys()) this.#pageTextureCache.release(url);
      return;
    }

    for (const url of this.#pageTextureUrls)
      this.#pageTextureCache.release(url);
    this.#pageTextureUrls = new Set(textures.keys());
    this.#setMaterialTexture(
      this.#leftPageSurfaceMaterial,
      spreadUrls.left ? textures.get(spreadUrls.left) : undefined,
    );
    this.#setMaterialTexture(
      this.#rightPageSurfaceMaterial,
      spreadUrls.right ? textures.get(spreadUrls.right) : undefined,
    );
    this.#syncPageRigVisibility();

    for (const url of preloadPlan.textureUrls)
      void this.#pageTextureCache.prefetch(url).catch(() => {});
  }

  #handleDetectedWidePage(url: string) {
    const publication = this.#publication();
    if (this.#disposed || !publication) return;
    const pageIndex = publication.pages.findIndex(
      (page) => readerPageSourceUrl(page) === url,
    );
    if (pageIndex <= 0) return;
    this.#cancelPageTurn();
    this.#pageIndex = getReaderSpread(
      this.#pageIndex,
      publication.pages.length,
      "spread",
      getWideReaderPageIndices(publication.pages),
    ).start;
    this.#applyPageBlockLayout(publication);
    this.#syncPageRigVisibility();
    void this.#syncPageTextures(publication);
    this.#onPageIndexChange?.(this.#pageIndex);
  }

  #createCoverTexture(title: string, subtitle: string, accent: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 1080;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(1, "#171918");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#f1eadc88";
      context.lineWidth = 4;
      context.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
      context.fillStyle = "#f5efe4";
      context.font = '700 70px Georgia, "Times New Roman", serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(title, canvas.width / 2, 480, canvas.width - 110);
      context.fillStyle = "#eee6d0b8";
      context.font = '600 25px Inter, "Yu Gothic", sans-serif';
      context.fillText(subtitle, canvas.width / 2, 570, canvas.width - 130);
    }
    return this.#configureCanvasTexture(canvas);
  }

  #createBackTexture(title: string, accent: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 1080;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = accent;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#10131288";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#ede6d244";
      context.lineWidth = 3;
      for (let y = 155; y < 700; y += 42)
        context.strokeRect(110, y, canvas.width - 220, 1);
      context.fillStyle = "#f1eadccc";
      context.textAlign = "center";
      context.font = '600 30px Inter, "Yu Gothic", sans-serif';
      context.fillText(title, canvas.width / 2, 100, canvas.width - 130);
      context.fillStyle = "#e7deca99";
      context.font = "500 20px monospace";
      context.fillText("AFTERLEAF LIBRARY EDITION", canvas.width / 2, 900);
      for (let x = 290; x < 480; x += 11)
        context.fillRect(x, 940, x % 3 === 0 ? 5 : 2, 65);
    }
    return this.#configureCanvasTexture(canvas);
  }

  #createSpineTexture(title: string, accent: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = accent;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(Math.PI / 2);
      context.fillStyle = "#f4ecdd";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = '700 43px Inter, "Yu Gothic", sans-serif';
      context.fillText(title, 0, 0, canvas.height - 130);
      context.restore();
    }
    return this.#configureCanvasTexture(canvas);
  }

  #createPageTexture(pages: number | undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#d9d0bc";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const lineCount = MathUtils.clamp(Math.round((pages ?? 180) / 5), 22, 72);
      context.fillStyle = "#9c958833";
      for (let index = 1; index < lineCount; index += 1) {
        const y = Math.round((index / lineCount) * canvas.height);
        context.fillRect(0, y, canvas.width, index % 7 === 0 ? 2 : 1);
      }
    }
    return this.#configureCanvasTexture(canvas);
  }

  #configureCanvasTexture(canvas: HTMLCanvasElement) {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.anisotropy = Math.min(
      4,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    return texture;
  }

  #replaceMap(material: MeshStandardMaterial, texture: Texture) {
    if (material.map === texture) return;
    material.map?.dispose();
    material.map = texture;
    material.needsUpdate = true;
  }

  #bindInput() {
    const passiveOptions = {
      passive: true,
      signal: this.#abortController.signal,
    } as const;
    this.#canvas.addEventListener(
      "pointerdown",
      this.#handlePointerDown,
      passiveOptions,
    );
    this.#canvas.addEventListener(
      "pointermove",
      this.#handlePointerMove,
      passiveOptions,
    );
    this.#canvas.addEventListener(
      "pointerup",
      this.#handlePointerUp,
      passiveOptions,
    );
    this.#canvas.addEventListener(
      "pointercancel",
      this.#handlePointerUp,
      passiveOptions,
    );
    this.#canvas.addEventListener("wheel", this.#handleWheel, {
      passive: false,
      signal: this.#abortController.signal,
    });
  }

  readonly #handlePointerDown = (event: PointerEvent) => {
    if (this.#draggingPointerId !== undefined) return;
    this.#draggingPointerId = event.pointerId;
    this.#lastPointerX = event.clientX;
    this.#lastPointerY = event.clientY;
    this.#canvas.setPointerCapture(event.pointerId);
    this.#canvas.style.cursor = "grabbing";
  };

  readonly #handlePointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.#draggingPointerId) return;
    const deltaX = event.clientX - this.#lastPointerX;
    const deltaY = event.clientY - this.#lastPointerY;
    this.#lastPointerX = event.clientX;
    this.#lastPointerY = event.clientY;
    this.#yawTarget += deltaX * 0.008;
    this.#pitchTarget = MathUtils.clamp(
      this.#pitchTarget + deltaY * 0.006,
      -0.65,
      0.62,
    );
  };

  readonly #handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.#draggingPointerId) return;
    this.#draggingPointerId = undefined;
    if (this.#canvas.hasPointerCapture(event.pointerId))
      this.#canvas.releasePointerCapture(event.pointerId);
    this.#canvas.style.cursor = "grab";
  };

  readonly #handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.nudgeCover(event.deltaY * -0.0012);
  };

  #observeSize() {
    const bounds = this.#canvas.getBoundingClientRect();
    this.#viewportWidth = bounds.width;
    this.#viewportHeight = bounds.height;
    this.#resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.#viewportWidth = entry.contentRect.width;
      this.#viewportHeight = entry.contentRect.height;
      this.#resizeDirty = true;
    });
    this.#resizeObserver.observe(this.#canvas);
  }

  #syncPixelRatio() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    if (pixelRatio === this.#lastPixelRatio) return;
    this.#resizeDirty = true;
  }

  #applyResize() {
    this.#resizeDirty = false;
    const width = Math.max(1, Math.floor(this.#viewportWidth));
    const height = Math.max(1, Math.floor(this.#viewportHeight));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.#lastPixelRatio = pixelRatio;
    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  #markReady() {
    if (this.#ready) return;
    this.#ready = true;
    this.#onReady?.();
    this.#onReady = undefined;
  }
}
