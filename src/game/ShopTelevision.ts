import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  RectAreaLight,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector4,
  Vector3,
  VideoTexture,
  type Object3D,
} from "three";
import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";

import tvButtonClickUrl from "~/assets/audio/tv-button-click.mp3?url";
import {
  type PositionalMediaAudioHandle,
  type PositionalSfxHandle,
  type ShopAudioManager,
} from "~/game/ShopAudioManager";
import {createWoodBoxGeometry} from "~/game/woodMaterials";
import {
  detectActivePictureRect,
  FULL_ACTIVE_PICTURE_RECT,
  getActivePictureConsensus,
  type ActivePictureRect,
} from "~/tv/activePicture";
import {
  getTvContentMapping,
  type TvScreenSafeArea,
  TV_SCREEN_ASPECT,
} from "~/tv/aspect";
import {createShuffleBag, type RandomSource} from "~/tv/shuffleBag";
import {
  DEFAULT_TV_CHANNEL_ID,
  type TvChannel,
  type TvVideo,
} from "~/tv/protocol";

const SCREEN_WIDTH = 2.52;
const SCREEN_HEIGHT = SCREEN_WIDTH / TV_SCREEN_ASPECT;
const BEZEL_WIDTH = 3.08;
const BEZEL_HEIGHT = 1.82;
const BEZEL_DEPTH = 0.16;
const BEZEL_FRONT_Z = 0.45;
const BEZEL_SCREEN_OVERLAP = 0.035;
const SCREEN_CURVE_DEPTH = 0.045;
const SCREEN_CENTER_X = -0.16;
const SCREEN_CENTER_Y = 0.02;
const SCREEN_CENTER_Z = BEZEL_FRONT_Z + 0.042;
const CONTROL_CENTER_X = 1.36;
const TELEVISION_MAX_VOLUME = 0.72;
const TELEVISION_VOLUME_STEP = 0.05;
const DEFAULT_MODEL_CENTER = [0, 0.2265, 0.183] as const;
const DEFAULT_MODEL_AUDIO_POSITION = [0.08, 0.055, -0.025] as const;
const ACTIVE_PICTURE_ANALYSIS_MAX_WIDTH = 160;
const ACTIVE_PICTURE_ANALYSIS_MAX_HEIGHT = 120;
const ACTIVE_PICTURE_SAMPLE_INTERVAL_SECONDS = 0.5;
const ACTIVE_PICTURE_REQUIRED_SAMPLES = 4;
const ACTIVE_PICTURE_MAX_ATTEMPTS = 16;
const SCREEN_INDICATOR_DURATION_MS = 850;
const SCREEN_OVERLAY_WIDTH = 512;
const SCREEN_LIGHT_CANVAS_WIDTH = 64;
const SCREEN_LIGHT_CANVAS_HEIGHT = 36;
const SCREEN_LIGHT_SAMPLE_INTERVAL_SECONDS = 0.18;
const SCREEN_LIGHT_SAMPLE_BAND = 0.44;
const SCREEN_LIGHT_SAMPLE_MARGIN = 0.06;
const SCREEN_LIGHT_SMOOTHING = 8;
const SCREEN_LIGHT_WASH_COVERAGE = 1.5;
const SCREEN_LIGHT_SOURCE_OFFSET = 0.1;
// Small screens need a stronger local wash to remain visible against the
// shop's ambient and ceiling lighting.
const SCREEN_LIGHT_MIN_INTENSITY = 10;
const SCREEN_LIGHT_MAX_INTENSITY = 14;

const SCREEN_LIGHT_EDGES = ["top", "right", "bottom", "left"] as const;
type ScreenLightEdge = (typeof SCREEN_LIGHT_EDGES)[number];

const srgbToLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);

// UV-space insets for the portion of each screen that its bezel cannot cover.
// The procedural widescreen values follow its modeled bezel overlap exactly.
export const WIDESCREEN_TV_SAFE_AREA: TvScreenSafeArea = Object.freeze({
  bottom: BEZEL_SCREEN_OVERLAP / SCREEN_HEIGHT,
  left: BEZEL_SCREEN_OVERLAP / SCREEN_WIDTH,
  right: BEZEL_SCREEN_OVERLAP / SCREEN_WIDTH,
  top: BEZEL_SCREEN_OVERLAP / SCREEN_HEIGHT,
});

// The CRT glass is model-backed, so these four values are the manual tuning
// point. Each value reserves that fraction of the screen UV at its edge;
// increase an edge if picture there is still hidden by the model's bezel.
export const CRT_TV_SAFE_AREA: TvScreenSafeArea = Object.freeze({
  bottom: 0.04,
  left: 0.055,
  right: 0.055,
  top: 0.04,
});

export type ShopTelevisionInteraction =
  | "body"
  | "channel"
  | "power"
  | "screen"
  | "skip";

type ShopTelevisionButton = {
  baseZ: number;
  highlightOpacity?: number;
  material: MeshStandardMaterial;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  pressedZ: number;
};

type ActivePictureDetection = {
  attempts: number;
  key: string;
  nextSampleTime: number;
  samples: ActivePictureRect[];
};

type ScreenLight = {
  light: RectAreaLight;
  targetColor: Color;
  targetIntensity: number;
};

export type ShopTelevisionModel = {
  // Model-local speaker spot; defaults to the CRT speaker position.
  audioPosition?: readonly [x: number, y: number, z: number];
  // Model-space point aligned to the group origin; defaults to the CRT center.
  center?: readonly [x: number, y: number, z: number];
  // Set false to skip the invisible power/channel/skip strip (CRT layout).
  controls?: boolean;
  // Overrides the targeting radius; defaults to scale * 0.4.
  interactionRadius?: number;
  // Name used in the pick-up prompt; defaults to "CRT".
  label?: string;
  screenAspect: number;
  screenNodeName: string;
  screenSafeArea: TvScreenSafeArea;
  scale: number;
  url: string;
};

export type ShopTelevisionOptions = {
  audioManager: ShopAudioManager;
  flatScreen?: {height: number; width: number};
  initialChannelId?: string;
  initialVolume?: number;
  model?: ShopTelevisionModel;
  onChannelChange?: (channelId: string) => void;
  onStateChange?: () => void;
  onVolumeChange?: (volume: number) => void;
  parent: Object3D;
  position?: readonly [x: number, y: number, z: number];
  random?: RandomSource;
  rotationY?: number;
  tvScreenLighting?: () => boolean;
  tableMaterial: MeshStandardMaterial;
};

const disposeLoadedObject = (root: Object3D) => {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
};

const normalizeScreenUvs = (screen: Mesh) => {
  const sourceUvs = screen.geometry.getAttribute("uv");
  if (!sourceUvs || sourceUvs.count === 0) return false;
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < sourceUvs.count; index += 1) {
    const u = sourceUvs.getX(index);
    const v = sourceUvs.getY(index);
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  const width = maxU - minU;
  const height = maxV - minV;
  if (width <= Number.EPSILON || height <= Number.EPSILON) return false;

  const sourceGeometry = screen.geometry;
  const geometry = sourceGeometry.clone();
  const uvs = geometry.getAttribute("uv");
  if (!uvs) {
    geometry.dispose();
    return false;
  }
  for (let index = 0; index < uvs.count; index += 1)
    uvs.setXY(
      index,
      (uvs.getX(index) - minU) / width,
      (uvs.getY(index) - minV) / height,
    );
  uvs.needsUpdate = true;
  screen.geometry = geometry;
  return true;
};

const createNoSignalTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#07100f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < canvas.height; row += 3) {
      const intensity = 12 + ((row * 37) % 28);
      context.fillStyle = `rgb(${intensity}, ${intensity + 7}, ${intensity + 4})`;
      context.fillRect(0, row, canvas.width, 1);
    }
    for (let fleck = 0; fleck < 4_000; fleck += 1) {
      const x = (fleck * 73 + fleck * fleck * 17) % canvas.width;
      const y = (fleck * 151 + fleck * fleck * 7) % canvas.height;
      const intensity = 35 + ((fleck * 29) % 90);
      context.fillStyle = `rgba(${intensity}, ${intensity + 8}, ${intensity + 4}, 0.28)`;
      context.fillRect(x, y, 1 + (fleck % 2), 1);
    }
    context.fillStyle = "rgba(2, 9, 8, 0.76)";
    context.fillRect(166, 119, 180, 50);
    context.strokeStyle = "rgba(205, 222, 211, 0.42)";
    context.strokeRect(166.5, 119.5, 179, 49);
    context.fillStyle = "#cbd7d0";
    context.font = "600 21px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("NO SIGNAL", canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

const curveScreenGeometry = (geometry: PlaneGeometry) => {
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const normalizedX = positions.getX(index) / (SCREEN_WIDTH * 0.5);
    const normalizedY = positions.getY(index) / (SCREEN_HEIGHT * 0.5);
    const xSquared = normalizedX * normalizedX;
    const ySquared = normalizedY * normalizedY;
    const edgeBlend = xSquared + ySquared - xSquared * ySquared;
    positions.setZ(index, -SCREEN_CURVE_DEPTH * edgeBlend);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const createBezelGeometry = () => {
  const outerHalfWidth = BEZEL_WIDTH * 0.5;
  const outerHalfHeight = BEZEL_HEIGHT * 0.5;
  const openingHalfWidth = SCREEN_WIDTH * 0.5 - BEZEL_SCREEN_OVERLAP;
  const openingHalfHeight = SCREEN_HEIGHT * 0.5 - BEZEL_SCREEN_OVERLAP;
  const shape = new Shape();
  shape.moveTo(-outerHalfWidth, -outerHalfHeight);
  shape.lineTo(-outerHalfWidth, outerHalfHeight);
  shape.lineTo(outerHalfWidth, outerHalfHeight);
  shape.lineTo(outerHalfWidth, -outerHalfHeight);
  shape.closePath();

  const opening = new Path();
  opening.moveTo(
    SCREEN_CENTER_X - openingHalfWidth,
    SCREEN_CENTER_Y - openingHalfHeight,
  );
  opening.lineTo(
    SCREEN_CENTER_X + openingHalfWidth,
    SCREEN_CENTER_Y - openingHalfHeight,
  );
  opening.lineTo(
    SCREEN_CENTER_X + openingHalfWidth,
    SCREEN_CENTER_Y + openingHalfHeight,
  );
  opening.lineTo(
    SCREEN_CENTER_X - openingHalfWidth,
    SCREEN_CENTER_Y + openingHalfHeight,
  );
  opening.closePath();
  shape.holes.push(opening);

  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 1,
    depth: BEZEL_DEPTH,
    steps: 1,
  });
  geometry.computeBoundingBox();
  return geometry;
};

const createControlLabel = (label: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(9, 11, 10, 0.92)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(191, 181, 151, 0.38)";
    context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
    context.fillStyle = "#c8bea1";
    context.font = "600 27px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return new Mesh(
    new PlaneGeometry(0.25, 0.063),
    new MeshBasicMaterial({map: texture, toneMapped: false}),
  );
};

const createSpeakerGrille = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#111513";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        context.beginPath();
        context.arc(14 + column * 23.5, 14 + row * 18, 4.8, 0, Math.PI * 2);
        context.fillStyle = "#030504";
        context.fill();
        context.strokeStyle = "rgba(151, 145, 126, 0.18)";
        context.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return new Mesh(
    new PlaneGeometry(0.31, 0.36),
    new MeshBasicMaterial({map: texture, toneMapped: false}),
  );
};

const getInteractionBoundsRadius = (options: ShopTelevisionOptions) => {
  if (options.flatScreen)
    return Math.hypot(options.flatScreen.width, options.flatScreen.height) / 2;
  if (options.model)
    return options.model.interactionRadius ?? options.model.scale * 0.4;
  return 2.4;
};

const normalizeVolume = (volume: number) => {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
};

export class ShopTelevision {
  static readonly #activePictureCache = new Map<string, ActivePictureRect>();
  static readonly #modelLoader = new GLTFLoader();
  static readonly #modelPromises = new Map<string, Promise<Group>>();
  static readonly #modelReferenceCounts = new Map<string, number>();
  static #sharedNoSignalTexture: CanvasTexture | undefined;
  static #sharedNoSignalTextureReferences = 0;

  static #loadModel(url: string) {
    let modelPromise = this.#modelPromises.get(url);
    if (!modelPromise) {
      modelPromise = this.#modelLoader
        .loadAsync(url)
        .then((gltf) => gltf.scene);
      this.#modelPromises.set(url, modelPromise);
    }
    return modelPromise.then((model) => model.clone(true));
  }

  static #retainNoSignalTexture() {
    this.#sharedNoSignalTexture ??= createNoSignalTexture();
    this.#sharedNoSignalTextureReferences += 1;
    return this.#sharedNoSignalTexture;
  }

  static #releaseNoSignalTexture() {
    this.#sharedNoSignalTextureReferences -= 1;
    if (this.#sharedNoSignalTextureReferences > 0) return;
    this.#sharedNoSignalTextureReferences = 0;
    this.#sharedNoSignalTexture?.dispose();
    this.#sharedNoSignalTexture = undefined;
  }

  static #retainModel(url: string) {
    this.#modelReferenceCounts.set(
      url,
      (this.#modelReferenceCounts.get(url) ?? 0) + 1,
    );
  }

  static #releaseModel(url: string) {
    const referenceCount = (this.#modelReferenceCounts.get(url) ?? 1) - 1;
    if (referenceCount > 0) {
      this.#modelReferenceCounts.set(url, referenceCount);
      return;
    }
    this.#modelReferenceCounts.delete(url);
    const modelPromise = this.#modelPromises.get(url);
    this.#modelPromises.delete(url);
    if (modelPromise)
      void modelPromise.then(disposeLoadedObject).catch(() => {});
  }

  readonly #abortController = new AbortController();
  readonly #audio: PositionalMediaAudioHandle;
  readonly #buttonAudio: PositionalSfxHandle;
  readonly #buttons = new Map<
    Exclude<ShopTelevisionInteraction, "screen">,
    ShopTelevisionButton
  >();
  readonly #buttonReleaseTimers = new Map<
    Exclude<ShopTelevisionInteraction, "screen">,
    number
  >();
  readonly #group = new Group();
  readonly #interactionTargets: Mesh[] = [];
  readonly #initialChannelId: string | undefined;
  readonly #interactionBoundsRadius: number;
  readonly #modelLabel: string;
  readonly #modelUrl: string | undefined;
  readonly #movable: boolean;
  readonly #noSignalTexture: CanvasTexture;
  readonly #onChannelChange: ((channelId: string) => void) | undefined;
  readonly #onStateChange: (() => void) | undefined;
  readonly #onVolumeChange: ((volume: number) => void) | undefined;
  readonly #random: RandomSource;
  readonly #contentCenterUniform = {value: new Vector2(0.5, 0.5)};
  readonly #contentScaleUniform = {value: new Vector2(1, 1)};
  readonly #sourceRectUniform = {value: new Vector4(0, 0, 1, 1)};
  readonly #screenAspect: number;
  readonly #screenMaterial: MeshBasicMaterial;
  readonly #screenSafeArea: TvScreenSafeArea;
  readonly #screenOverlayCanvas = document.createElement("canvas");
  readonly #screenOverlayContext: CanvasRenderingContext2D | null;
  readonly #screenOverlayTexture: CanvasTexture;
  readonly #screenLights: ScreenLight[] = [];
  #screenLightingCanvas: HTMLCanvasElement | undefined;
  readonly #tvScreenLighting: () => boolean;
  readonly #video = document.createElement("video");
  readonly #videoTexture: VideoTexture;
  readonly #powerIndicatorMaterial = new MeshStandardMaterial({
    color: "#37120e",
    emissive: "#180200",
    emissiveIntensity: 0.35,
    metalness: 0.12,
    roughness: 0.35,
  });

  #bag: number[] = [];
  #activePictureCanvas: HTMLCanvasElement | undefined;
  #activePictureContext: CanvasRenderingContext2D | undefined;
  #activePictureDetection: ActivePictureDetection | undefined;
  #activePictureRect = FULL_ACTIVE_PICTURE_RECT;
  #channelIndex = 0;
  #channels: readonly TvChannel[] = [];
  #currentVideo: TvVideo | undefined;
  #currentVideoIndex: number | undefined;
  #disposed = false;
  #failedVideoIds = new Set<string>();
  #lastVideoIndex: number | undefined;
  #loadError: string | undefined;
  #loadingChannels = true;
  #manifestSignature: string | undefined;
  #lastAudibleVolume = 1;
  #playRevision = 0;
  #powered = false;
  #screenOverlayTimer: number | undefined;
  #screenLightingContext: CanvasRenderingContext2D | null = null;
  #nextScreenLightingSampleTime = 0;
  #screenLightMaximumIntensity = SCREEN_LIGHT_MIN_INTENSITY;
  #screenLightingUnavailable = false;
  #suspended = false;
  #targetedInteraction: ShopTelevisionInteraction | undefined;
  #volume = 1;

  constructor(options: ShopTelevisionOptions) {
    this.#initialChannelId = options.initialChannelId;
    this.#interactionBoundsRadius = getInteractionBoundsRadius(options);
    this.#modelLabel = options.model?.label ?? "CRT";
    this.#modelUrl = options.model?.url;
    if (this.#modelUrl) ShopTelevision.#retainModel(this.#modelUrl);
    this.#movable = options.model !== undefined;
    this.#onChannelChange = options.onChannelChange;
    this.#onStateChange = options.onStateChange;
    this.#onVolumeChange = options.onVolumeChange;
    this.#noSignalTexture = ShopTelevision.#retainNoSignalTexture();
    this.#random = options.random ?? Math.random;
    this.#tvScreenLighting = options.tvScreenLighting ?? (() => false);
    this.#screenAspect = options.flatScreen
      ? options.flatScreen.width / options.flatScreen.height
      : (options.model?.screenAspect ?? TV_SCREEN_ASPECT);
    this.#screenSafeArea = options.flatScreen
      ? {bottom: 0, left: 0, right: 0, top: 0}
      : (options.model?.screenSafeArea ?? WIDESCREEN_TV_SAFE_AREA);
    this.#volume = normalizeVolume(options.initialVolume ?? 1);
    if (this.#volume > 0) this.#lastAudibleVolume = this.#volume;
    this.#screenOverlayCanvas.width = SCREEN_OVERLAY_WIDTH;
    this.#screenOverlayCanvas.height = Math.max(
      1,
      Math.round(SCREEN_OVERLAY_WIDTH / this.#screenAspect),
    );
    this.#screenOverlayContext = this.#screenOverlayCanvas.getContext("2d");
    this.#screenOverlayTexture = new CanvasTexture(this.#screenOverlayCanvas);
    this.#screenOverlayTexture.colorSpace = SRGBColorSpace;
    this.#screenOverlayTexture.minFilter = LinearFilter;
    this.#screenOverlayTexture.generateMipmaps = false;
    this.#applyContentMapping(16, 9);
    this.#group.position.set(...(options.position ?? [0, 2.36, 27.24]));
    this.#group.rotation.y = options.rotationY ?? Math.PI;

    this.#video.crossOrigin = "anonymous";
    this.#video.disablePictureInPicture = true;
    this.#video.playsInline = true;
    this.#video.preload = "auto";
    this.#video.addEventListener(
      "ended",
      () => {
        if (this.#powered && !this.#suspended) this.#advanceVideo();
      },
      {signal: this.#abortController.signal},
    );
    this.#video.addEventListener(
      "error",
      () => this.#handlePlaybackFailure(this.#video.error),
      {signal: this.#abortController.signal},
    );
    this.#video.addEventListener(
      "loadedmetadata",
      () => this.#updateVisibleVideoMapping(),
      {signal: this.#abortController.signal},
    );
    this.#video.addEventListener(
      "loadeddata",
      () => this.#sampleActivePicture(),
      {signal: this.#abortController.signal},
    );
    this.#video.addEventListener(
      "timeupdate",
      () => this.#sampleActivePicture(),
      {signal: this.#abortController.signal},
    );
    this.#video.addEventListener(
      "resize",
      () => this.#updateVisibleVideoMapping(),
      {signal: this.#abortController.signal},
    );
    this.#videoTexture = new VideoTexture(this.#video);
    this.#videoTexture.colorSpace = SRGBColorSpace;
    this.#videoTexture.minFilter = LinearFilter;
    this.#videoTexture.generateMipmaps = false;

    this.#screenMaterial = new MeshBasicMaterial({
      map: this.#noSignalTexture,
      toneMapped: false,
    });
    this.#screenMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.afterleafContentCenter = this.#contentCenterUniform;
      shader.uniforms.afterleafContentScale = this.#contentScaleUniform;
      shader.uniforms.afterleafSourceRect = this.#sourceRectUniform;
      shader.uniforms.afterleafScreenOverlay = {
        value: this.#screenOverlayTexture,
      };
      shader.fragmentShader = `uniform vec2 afterleafContentCenter;
uniform vec2 afterleafContentScale;
uniform vec4 afterleafSourceRect;
uniform sampler2D afterleafScreenOverlay;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
        vec2 afterleafCenteredContentUv = vMapUv - afterleafContentCenter;
        vec2 afterleafContentUv = afterleafCenteredContentUv / afterleafContentScale + 0.5;
        vec2 afterleafSourceUv = mix(
          afterleafSourceRect.xy,
          afterleafSourceRect.zw,
          clamp(afterleafContentUv, 0.0, 1.0)
        );
        float afterleafInsideContent =
          step(abs(afterleafCenteredContentUv.x), afterleafContentScale.x * 0.5) *
          step(abs(afterleafCenteredContentUv.y), afterleafContentScale.y * 0.5);
        vec4 sampledDiffuseColor = texture2D(map, afterleafSourceUv);
        #ifdef DECODE_VIDEO_TEXTURE
          sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
        #endif
        sampledDiffuseColor = mix(vec4(0.0, 0.0, 0.0, 1.0), sampledDiffuseColor, afterleafInsideContent);
        diffuseColor *= sampledDiffuseColor;
        #endif
        vec4 afterleafScreenOverlayColor = texture2D(afterleafScreenOverlay, vMapUv);
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          afterleafScreenOverlayColor.rgb,
          afterleafScreenOverlayColor.a
        );
        float afterleafScanline = 0.965 + 0.035 * sin(vMapUv.y * 900.0);
        vec2 afterleafCenteredUv = vMapUv * 2.0 - 1.0;
        float afterleafVignette = 1.0 - 0.14 * smoothstep(0.52, 1.34, dot(afterleafCenteredUv, afterleafCenteredUv));
        diffuseColor.rgb *= afterleafScanline * afterleafVignette;`,
      );
    };
    this.#screenMaterial.customProgramCacheKey = () =>
      "afterleaf-television-crt-v8";

    this.#audio = options.audioManager.createPositionalMediaElement(
      this.#video,
      {
        cone: {innerAngle: 130, outerAngle: 245, outerGain: 0.18},
        refDistance: 1.7,
        rolloffFactor: 0.85,
        volume: TELEVISION_MAX_VOLUME * this.#volume,
      },
    );
    this.#buttonAudio = options.audioManager.createPositionalSfx(
      tvButtonClickUrl,
      {
        cone: {innerAngle: 150, outerAngle: 270, outerGain: 0.24},
        refDistance: 1.35,
        rolloffFactor: 1.5,
        volume: 0.48,
      },
    );

    if (options.flatScreen) this.#createFlatScreen(options.flatScreen);
    else if (options.model) void this.#createModelTelevision(options.model);
    else this.#createPhysicalTelevision(options.tableMaterial);
    options.parent.add(this.#group);
  }

  get interactionTargets(): readonly Mesh[] {
    return this.#interactionTargets;
  }

  get interactionBoundsRadius() {
    return this.#interactionBoundsRadius;
  }

  get movable() {
    return this.#movable;
  }

  get object() {
    return this.#group;
  }

  get prompt() {
    const interaction = this.#targetedInteraction;
    const volumePercent = Math.round(this.#volume * 100);
    const volumeControl = ` · Ctrl+wheel volume (${volumePercent}%) · M ${this.#volume === 0 ? "unmute" : "mute"}`;
    const scrubControl =
      this.#powered && this.#currentVideo ? " · Wheel scrub" : "";
    if (this.#loadingChannels) return `TV tuning channels…${volumeControl}`;
    if (this.#loadError) return `TV channels unavailable${volumeControl}`;
    const channel = this.#channels[this.#channelIndex];
    if (!channel) return `TV has no channels${volumeControl}`;
    const channelControl =
      this.#channels.length > 1 ? " · Q/E previous/next channel" : "";
    if (interaction === "body" && this.#movable)
      return `E pick up ${this.#modelLabel} · Aim at its screen or controls to use it${scrubControl}${volumeControl}`;
    if (interaction === "power")
      return `${
        this.#powered
          ? `Click · power off${channelControl}`
          : `Click · power on${channelControl}`
      }${scrubControl}${volumeControl}`;
    if (interaction === "channel")
      return `Click · next channel · Q/E previous/next · ${channel.label}${scrubControl}${volumeControl}`;
    if (interaction === "skip")
      return `Click · skip${channelControl} · ${channel.label}${scrubControl}${volumeControl}`;
    if (!this.#powered)
      return `Click to turn on TV${channelControl} · ${channel.label}${volumeControl}`;
    return `Click to turn off TV${channelControl} · F skip${scrubControl} · ${channel.label}${volumeControl}`;
  }

  resolveInteractionTarget(object: Object3D) {
    const interaction = object.userData.televisionInteraction;
    if (
      interaction === "channel" ||
      interaction === "body" ||
      interaction === "power" ||
      interaction === "screen" ||
      interaction === "skip"
    )
      return interaction;
  }

  setTargeted(interaction: ShopTelevisionInteraction | undefined) {
    if (interaction === this.#targetedInteraction) return;
    this.#targetedInteraction = interaction;
    for (const [buttonInteraction, button] of this.#buttons) {
      const targeted = buttonInteraction === interaction;
      button.material.emissive.set(targeted ? "#d6a344" : "#000000");
      button.material.emissiveIntensity = targeted ? 0.9 : 0;
      if (button.highlightOpacity !== undefined)
        button.material.opacity = targeted ? button.highlightOpacity : 0;
    }
  }

  interactTargeted() {
    const interaction = this.#targetedInteraction;
    if (!interaction) return;
    if (interaction === "body") return;
    if (interaction === "channel") this.nextChannel();
    else if (interaction === "skip") this.skip();
    else this.togglePower();
  }

  setSuspended(suspended: boolean) {
    if (suspended === this.#suspended) return;
    this.#suspended = suspended;
    if (suspended) {
      this.#video.pause();
      return;
    }
    if (!this.#powered || !this.#currentVideo) return;
    void this.#playCurrentVideo();
  }

  update(deltaSeconds: number) {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return;
    const interpolation =
      1 - Math.exp(-SCREEN_LIGHT_SMOOTHING * Math.min(deltaSeconds, 0.1));
    const screenLightingEnabled = this.#tvScreenLighting();
    if (!screenLightingEnabled) {
      for (const screenLight of this.#screenLights)
        screenLight.light.visible = false;
      return;
    }
    const lightsVisible =
      this.#powered &&
      !this.#suspended &&
      this.#screenMaterial.map === this.#videoTexture;
    for (const screenLight of this.#screenLights) {
      screenLight.light.visible = lightsVisible;
      screenLight.light.color.lerp(screenLight.targetColor, interpolation);
      screenLight.light.intensity +=
        (screenLight.targetIntensity - screenLight.light.intensity) *
        interpolation;
    }
  }

  setChannels(channels: readonly TvChannel[]) {
    if (this.#disposed) return;
    const playableChannels = channels.filter(
      (channel) => channel.videos.length > 0,
    );
    const signature = JSON.stringify(playableChannels);
    const changed = signature !== this.#manifestSignature;
    this.#loadingChannels = false;
    if (!changed && !this.#loadError) return;
    this.#applyChannels(playableChannels);
    this.#manifestSignature = signature;
    this.#emitStateChange();
  }

  setChannelLoadError(error: unknown) {
    if (this.#disposed || (!this.#loadingChannels && this.#channels.length > 0))
      return;
    this.#loadingChannels = false;
    this.#loadError =
      error instanceof Error ? error.message : "TV channel discovery failed";
    this.#showNoSignal();
    this.#emitStateChange();
  }

  toggleMuted() {
    if (this.#disposed) return;
    this.#setVolume(this.#volume === 0 ? this.#lastAudibleVolume : 0);
  }

  adjustVolume(direction: -1 | 1) {
    if (this.#disposed) return;
    this.#setVolume(this.#volume + direction * TELEVISION_VOLUME_STEP);
  }

  togglePower() {
    if (
      this.#disposed ||
      this.#loadingChannels ||
      (this.#loadError && this.#channels.length === 0)
    )
      return;
    this.#pressButton("power");
    this.#powered = !this.#powered;
    this.#updatePowerIndicator();
    if (!this.#powered) {
      this.#video.pause();
      this.#showNoSignal();
      this.#emitStateChange();
      return;
    }

    void this.#audio.resume();
    if (this.#loadError) this.#resetChannelPlayback();
    if (this.#currentVideo) {
      this.#showVideo();
      void this.#playCurrentVideo();
    } else this.#advanceVideo();
    this.#emitStateChange();
  }

  previousChannel() {
    this.#changeChannel(-1);
  }

  nextChannel() {
    this.#changeChannel(1);
  }

  volumePercent() {
    return Math.round(this.#volume * 100);
  }

  powered() {
    return this.#powered;
  }

  selectedChannelId() {
    return this.#channels[this.#channelIndex]?.id ?? this.#initialChannelId;
  }

  selectedChannelLabel() {
    return this.#channels[this.#channelIndex]?.label;
  }

  volumeLevel() {
    return this.#volume;
  }

  playVideoIfChannelSelected(
    channelId: string,
    importedVideo: TvVideo,
    channelLabel = channelId,
  ) {
    if (this.#disposed) return false;
    let channel = this.#channels[this.#channelIndex];
    if (!channel && channelId === DEFAULT_TV_CHANNEL_ID) {
      channel = {id: channelId, label: channelLabel, videos: []};
      this.#channels = [channel];
      this.#channelIndex = 0;
    }
    if (!channel || channel.id !== channelId) return false;
    const existingVideo = channel.videos.find(
      (video) => video.id === importedVideo.id,
    );
    const existingVideoIndex = existingVideo
      ? channel.videos.indexOf(existingVideo)
      : -1;
    const videoIndex =
      existingVideoIndex >= 0 ? existingVideoIndex : channel.videos.length;
    const video = existingVideo ?? importedVideo;
    if (existingVideoIndex < 0) {
      const channels = [...this.#channels];
      channels[this.#channelIndex] = {
        ...channel,
        videos: [...channel.videos, video],
      };
      this.#channels = channels;
    }
    this.#bag = [];
    this.#failedVideoIds.delete(video.id);
    this.#loadError = undefined;
    this.#startVideo(video, videoIndex);
    return true;
  }

  playImportedChannel(
    channelId: string,
    importedVideo: TvVideo,
    channelLabel = channelId,
  ) {
    if (this.#disposed) return false;
    const previousChannelId = this.#channels[this.#channelIndex]?.id;
    const channelIndex = this.#channels.findIndex(
      (channel) => channel.id === channelId,
    );
    if (channelIndex >= 0) this.#channelIndex = channelIndex;
    else {
      this.#channels = [
        ...this.#channels,
        {id: channelId, label: channelLabel, videos: []},
      ];
      this.#channelIndex = this.#channels.length - 1;
    }
    const played = this.playVideoIfChannelSelected(
      channelId,
      importedVideo,
      channelLabel,
    );
    if (!played) return false;
    if (previousChannelId !== channelId) this.#onChannelChange?.(channelId);
    this.#emitStateChange();
    return true;
  }

  #changeChannel(direction: -1 | 1) {
    if (this.#disposed || this.#channels.length <= 1) return;
    this.#pressButton("channel");
    this.#channelIndex =
      (this.#channelIndex + direction + this.#channels.length) %
      this.#channels.length;
    const channel = this.#channels[this.#channelIndex];
    this.#resetChannelPlayback();
    if (this.#powered) this.#advanceVideo();
    if (channel) this.#onChannelChange?.(channel.id);
    this.#emitStateChange();
  }

  skip() {
    if (this.#disposed || !this.#powered || !this.#currentVideo) return;
    this.#pressButton("skip");
    this.#advanceVideo();
  }

  scrub(deltaSeconds: number) {
    if (
      this.#disposed ||
      !this.#powered ||
      !this.#currentVideo ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds === 0 ||
      this.#video.readyState < HTMLMediaElement.HAVE_METADATA
    )
      return false;
    const duration = this.#video.duration;
    const currentTime = this.#video.currentTime;
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isFinite(currentTime)
    )
      return false;
    const targetTime = Math.min(
      duration,
      Math.max(0, currentTime + deltaSeconds),
    );
    const scrubbedSeconds = targetTime - currentTime;
    this.#video.currentTime = targetTime;
    if (this.#activePictureDetection)
      this.#activePictureDetection.nextSampleTime = targetTime;
    if (Math.abs(scrubbedSeconds) >= 0.05)
      this.#showScrubIndicator(scrubbedSeconds);
    return true;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#abortController.abort();
    if (this.#screenOverlayTimer !== undefined)
      window.clearTimeout(this.#screenOverlayTimer);
    this.#screenOverlayTimer = undefined;
    for (const timer of this.#buttonReleaseTimers.values())
      window.clearTimeout(timer);
    this.#buttonReleaseTimers.clear();
    this.#playRevision += 1;
    this.#activePictureDetection = undefined;
    this.#video.pause();
    this.#video.removeAttribute("src");
    this.#video.load();
    this.#audio.dispose();
    this.#buttonAudio.dispose();
    this.#screenMaterial.map = null;
    this.#videoTexture.dispose();
    this.#screenOverlayTexture.dispose();
    ShopTelevision.#releaseNoSignalTexture();
    if (this.#modelUrl) ShopTelevision.#releaseModel(this.#modelUrl);
  }

  async #createModelTelevision(model: ShopTelevisionModel) {
    this.#group.name = "shop-model-television";
    try {
      const modelObject = await ShopTelevision.#loadModel(model.url);
      if (this.#disposed) return;

      const center = model.center ?? DEFAULT_MODEL_CENTER;
      modelObject.scale.setScalar(model.scale);
      modelObject.position.set(
        -center[0] * model.scale,
        -center[1] * model.scale,
        -center[2] * model.scale,
      );
      modelObject.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.#group.add(modelObject);

      const screenRoot = modelObject.getObjectByName(model.screenNodeName);
      let screenMesh: Mesh | undefined;
      screenRoot?.traverse((object) => {
        if (!screenMesh && object instanceof Mesh) screenMesh = object;
      });
      if (!screenMesh) {
        console.error(
          `Afterleaf television model has no ${model.screenNodeName} mesh.`,
        );
        return;
      }

      modelObject.traverse((object) => {
        if (!(object instanceof Mesh) || object === screenMesh) return;
        object.userData.televisionInteraction = "body";
        this.#interactionTargets.push(object);
      });

      normalizeScreenUvs(screenMesh);
      screenMesh.material = this.#screenMaterial;
      screenMesh.name = "shop-model-television-screen";
      screenMesh.userData.televisionInteraction = "screen";
      this.#interactionTargets.push(screenMesh);
      screenMesh.geometry.computeBoundingBox();
      const screenBounds = screenMesh.geometry.boundingBox;
      if (screenBounds) {
        screenMesh.updateWorldMatrix(true, false);
        const screenWorldScale = screenMesh.getWorldScale(new Vector3());
        this.#createScreenLights(
          screenMesh,
          {
            minX: screenBounds.min.x,
            minY: screenBounds.min.y,
            maxX: screenBounds.max.x,
            maxY: screenBounds.max.y,
            maxZ: screenBounds.max.z,
          },
          Math.max(
            Math.abs(screenWorldScale.x),
            Math.abs(screenWorldScale.y),
            Math.abs(screenWorldScale.z),
          ),
        );
      }

      if (model.controls !== false)
        this.#createModelControlTargets(model.scale, center);
      const audioPosition = model.audioPosition ?? DEFAULT_MODEL_AUDIO_POSITION;
      this.#audio.node.position.set(
        (audioPosition[0] - center[0]) * model.scale,
        (audioPosition[1] - center[1]) * model.scale,
        (audioPosition[2] - center[2]) * model.scale,
      );
      this.#audio.node.rotation.y = Math.PI;
      this.#buttonAudio.node.position.copy(this.#audio.node.position);
      this.#buttonAudio.node.rotation.y = Math.PI;
      this.#group.add(this.#audio.node, this.#buttonAudio.node);
    } catch (error) {
      console.error("Afterleaf could not load the CRT TV model.", error);
    }
  }

  #createModelControlTargets(
    scale: number,
    center: readonly [x: number, y: number, z: number],
  ) {
    const buttonWidth = 0.035 * scale;
    const buttonHeight = 0.026 * scale;
    const buttonDepth = 0.012 * scale;
    const firstButtonX = 0.039 * scale;
    const buttonGap = 0.035 * scale;
    const baseZ = -0.013 * scale;
    const interactions = ["power", "channel", "skip"] as const;
    for (const [index, interaction] of interactions.entries()) {
      const material = new MeshStandardMaterial({
        color: "#d6a344",
        depthWrite: false,
        emissive: "#000000",
        opacity: 0,
        transparent: true,
      });
      const mesh = new Mesh(
        new BoxGeometry(buttonWidth, buttonHeight, buttonDepth),
        material,
      );
      const centeredBaseZ = baseZ - center[2] * scale;
      mesh.position.set(
        firstButtonX + buttonGap * index,
        (0.052 - center[1]) * scale,
        centeredBaseZ,
      );
      mesh.name = `shop-model-television-${interaction}`;
      mesh.userData.televisionInteraction = interaction;
      this.#group.add(mesh);
      this.#buttons.set(interaction, {
        baseZ: centeredBaseZ,
        highlightOpacity: 0.26,
        material,
        mesh,
        pressedZ: centeredBaseZ + 0.009 * scale,
      });
      this.#interactionTargets.push(mesh);
    }
  }

  #createScreenLights(
    screen: Object3D,
    bounds: {
      maxX: number;
      maxY: number;
      maxZ: number;
      minX: number;
      minY: number;
    },
    worldScale = 1,
  ) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return;

    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerY = (bounds.minY + bounds.maxY) * 0.5;
    const localToWorldScale = Math.max(Math.abs(worldScale), 0.001);
    const scaledWidth = width * localToWorldScale;
    const scaledHeight = height * localToWorldScale;
    const sourceOffset =
      Math.max(
        0.04,
        Math.min(scaledWidth, scaledHeight) * SCREEN_LIGHT_SOURCE_OFFSET,
      ) / localToWorldScale;
    const maximumIntensity = Math.min(
      SCREEN_LIGHT_MAX_INTENSITY,
      Math.max(SCREEN_LIGHT_MIN_INTENSITY, 4.5 * (scaledWidth / SCREEN_WIDTH)),
    );
    const lightPosition: readonly [x: number, y: number, z: number] = [
      centerX,
      centerY,
      bounds.maxZ + sourceOffset,
    ];
    const lightWidth = scaledWidth * SCREEN_LIGHT_WASH_COVERAGE;
    const lightHeight = scaledHeight * SCREEN_LIGHT_WASH_COVERAGE;

    for (const edge of SCREEN_LIGHT_EDGES) {
      const light = new RectAreaLight("#000000", 0, lightWidth, lightHeight);
      light.name = `shop-television-${edge}-light`;
      light.position.set(...lightPosition);
      light.rotation.y = Math.PI;
      light.visible = false;
      screen.add(light);
      this.#screenLights.push({
        light,
        targetColor: new Color("#000000"),
        targetIntensity: 0,
      });
    }

    this.#screenLightMaximumIntensity =
      maximumIntensity / SCREEN_LIGHT_EDGES.length;
  }

  #createFlatScreen(size: {height: number; width: number}) {
    this.#group.name = "shop-flat-screen";
    const backing = new Mesh(
      new BoxGeometry(size.width + 0.28, size.height + 0.28, 0.12),
      new MeshStandardMaterial({
        color: "#090b0d",
        metalness: 0.22,
        roughness: 0.52,
      }),
    );
    backing.castShadow = true;
    backing.receiveShadow = true;
    this.#group.add(backing);

    const screen = new Mesh(
      new PlaneGeometry(size.width, size.height),
      this.#screenMaterial,
    );
    screen.position.z = 0.065;
    screen.name = "shop-flat-screen-picture";
    screen.userData.televisionInteraction = "screen";
    this.#interactionTargets.push(screen);
    this.#createScreenLights(screen, {
      minX: -size.width * 0.5,
      minY: -size.height * 0.5,
      maxX: size.width * 0.5,
      maxY: size.height * 0.5,
      maxZ: 0,
    });
    this.#group.add(screen);

    this.#audio.node.position.set(0, -size.height * 0.35, 0.1);
    this.#buttonAudio.node.position.copy(this.#audio.node.position);
    this.#group.add(this.#audio.node, this.#buttonAudio.node);
  }

  #createPhysicalTelevision(tableMaterial: MeshStandardMaterial) {
    this.#group.name = "shop-television";

    const target = new Mesh(
      curveScreenGeometry(
        new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT, 32, 18),
      ),
      this.#screenMaterial,
    );
    target.name = "shop-television-screen";
    target.userData.televisionInteraction = "screen";
    this.#interactionTargets.push(target);
    this.#createScreenLights(target, {
      minX: -SCREEN_WIDTH * 0.5,
      minY: -SCREEN_HEIGHT * 0.5,
      maxX: SCREEN_WIDTH * 0.5,
      maxY: SCREEN_HEIGHT * 0.5,
      maxZ: 0,
    });

    const cabinetMaterial = new MeshStandardMaterial({
      color: "#322b25",
      metalness: 0.08,
      roughness: 0.82,
    });
    const bezelMaterial = new MeshStandardMaterial({
      color: "#181b19",
      metalness: 0.22,
      roughness: 0.58,
    });
    const buttonBezelMaterial = new MeshStandardMaterial({
      color: "#090b0a",
      metalness: 0.42,
      roughness: 0.36,
    });
    const cabinet = new Mesh(
      new RoundedBoxGeometry(3.3, 2.16, 0.62, 4, 0.12),
      cabinetMaterial,
    );
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.#group.add(cabinet);

    const tableTopSize = [3.48, 0.16, 1.05] as const;
    const tableTopPosition = [0, -1.16, 0.02] as const;
    const supportShelf = new Mesh(
      createWoodBoxGeometry(tableTopSize, tableTopPosition),
      tableMaterial,
    );
    supportShelf.position.set(...tableTopPosition);
    supportShelf.castShadow = true;
    supportShelf.receiveShadow = true;
    this.#group.add(supportShelf);
    for (const x of [-1.38, 1.38]) {
      for (const z of [-0.31, 0.31]) {
        const legSize = [0.18, 1.08, 0.18] as const;
        const legPosition = [x, -1.78, z] as const;
        const leg = new Mesh(
          createWoodBoxGeometry(legSize, legPosition),
          tableMaterial,
        );
        leg.position.set(...legPosition);
        leg.castShadow = true;
        leg.receiveShadow = true;
        this.#group.add(leg);
      }
    }
    const lowerShelfSize = [3, 0.1, 0.9] as const;
    const lowerShelfPosition = [0, -2.21, 0.02] as const;
    const lowerShelf = new Mesh(
      createWoodBoxGeometry(lowerShelfSize, lowerShelfPosition),
      tableMaterial,
    );
    lowerShelf.position.set(...lowerShelfPosition);
    lowerShelf.castShadow = true;
    lowerShelf.receiveShadow = true;
    this.#group.add(lowerShelf);

    const bezelGeometry = createBezelGeometry();
    const bezelFront = bezelGeometry.boundingBox?.max.z ?? BEZEL_DEPTH;
    const bezel = new Mesh(bezelGeometry, bezelMaterial);
    bezel.position.set(0, 0, BEZEL_FRONT_Z - bezelFront);
    bezel.castShadow = true;
    this.#group.add(bezel);

    target.position.set(SCREEN_CENTER_X, SCREEN_CENTER_Y, SCREEN_CENTER_Z);
    this.#group.add(target);

    const controls = new Group();
    controls.position.set(CONTROL_CENTER_X, 0.2, BEZEL_FRONT_Z - 0.025);
    this.#group.add(controls);
    this.#createControlButton(
      controls,
      buttonBezelMaterial,
      "power",
      "POWER",
      0.42,
      "#8f3227",
    );
    this.#createControlButton(
      controls,
      buttonBezelMaterial,
      "channel",
      "CHANNEL",
      0.08,
      "#71644a",
    );
    this.#createControlButton(
      controls,
      buttonBezelMaterial,
      "skip",
      "SKIP",
      -0.26,
      "#46514d",
    );

    const powerIndicator = new Mesh(
      new BoxGeometry(0.055, 0.055, 0.026),
      this.#powerIndicatorMaterial,
    );
    powerIndicator.position.set(0.13, 0.55, 0.05);
    controls.add(powerIndicator);

    const speakerGrille = createSpeakerGrille();
    speakerGrille.position.set(0, -0.66, 0.043);
    controls.add(speakerGrille);

    this.#audio.node.position.set(0, -0.66, 0.08);
    controls.add(this.#audio.node);
    this.#buttonAudio.node.position.set(0, -0.66, 0.08);
    controls.add(this.#buttonAudio.node);
  }

  #createControlButton(
    parent: Group,
    bezelMaterial: MeshStandardMaterial,
    interaction: Exclude<ShopTelevisionInteraction, "screen">,
    label: string,
    y: number,
    color: string,
  ) {
    const bezel = new Mesh(
      new RoundedBoxGeometry(0.29, 0.18, 0.045, 2, 0.022),
      bezelMaterial,
    );
    bezel.position.set(0, y, 0.025);
    parent.add(bezel);

    const material = new MeshStandardMaterial({
      color,
      emissive: "#000000",
      metalness: 0.28,
      roughness: 0.38,
    });
    const mesh = new Mesh(
      new RoundedBoxGeometry(0.22, 0.115, 0.08, 3, 0.025),
      material,
    );
    const baseZ = 0.087;
    mesh.position.set(0, y, baseZ);
    mesh.castShadow = true;
    mesh.userData.televisionInteraction = interaction;
    parent.add(mesh);
    this.#buttons.set(interaction, {
      baseZ,
      material,
      mesh,
      pressedZ: baseZ - 0.035,
    });
    this.#interactionTargets.push(mesh);

    const labelMesh = createControlLabel(label);
    labelMesh.position.set(0, y + 0.125, 0.05);
    parent.add(labelMesh);
  }

  #pressButton(interaction: Exclude<ShopTelevisionInteraction, "screen">) {
    const button = this.#buttons.get(interaction);
    if (!button) return;
    const previousTimer = this.#buttonReleaseTimers.get(interaction);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    this.#buttonAudio.play(this.#random() * 120 - 60);
    button.mesh.position.z = button.pressedZ;
    const timer = window.setTimeout(() => {
      if (!this.#disposed) button.mesh.position.z = button.baseZ;
      this.#buttonReleaseTimers.delete(interaction);
    }, 120);
    this.#buttonReleaseTimers.set(interaction, timer);
  }

  #showScrubIndicator(seconds: number) {
    const roundedSeconds = Math.round(seconds * 10) / 10;
    const label = `${roundedSeconds > 0 ? "+" : ""}${roundedSeconds}s`;
    this.#showScreenIndicator(label, seconds > 0 ? "#c9f0d3" : "#eadbc0");
  }

  #showVolumeIndicator() {
    const volumePercent = Math.round(this.#volume * 100);
    this.#showScreenIndicator(
      volumePercent === 0 ? "MUTED 0%" : `VOL ${volumePercent}%`,
      volumePercent === 0 ? "#eadbc0" : "#c9f0d3",
    );
  }

  #showScreenIndicator(label: string, color: string) {
    const context = this.#screenOverlayContext;
    if (!context) return;
    const canvas = this.#screenOverlayCanvas;
    const fontSize = Math.round(canvas.height * 0.18);
    const paddingX = fontSize * 0.52;
    const boxHeight = fontSize * 1.42;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `700 ${fontSize}px monospace`;
    const boxWidth = context.measureText(label).width + paddingX * 2;
    const left = (canvas.width - boxWidth) / 2;
    const top = (canvas.height - boxHeight) / 2;
    const radius = fontSize * 0.24;
    context.beginPath();
    context.roundRect(left, top, boxWidth, boxHeight, radius);
    context.fillStyle = "rgba(3, 10, 9, 0.76)";
    context.fill();
    context.strokeStyle = "rgba(225, 235, 228, 0.52)";
    context.lineWidth = Math.max(1.5, fontSize * 0.035);
    context.stroke();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    this.#screenOverlayTexture.needsUpdate = true;

    if (this.#screenOverlayTimer !== undefined)
      window.clearTimeout(this.#screenOverlayTimer);
    this.#screenOverlayTimer = window.setTimeout(() => {
      this.#screenOverlayTimer = undefined;
      context.clearRect(0, 0, canvas.width, canvas.height);
      this.#screenOverlayTexture.needsUpdate = true;
    }, SCREEN_INDICATOR_DURATION_MS);
  }

  #setVolume(volume: number) {
    const normalizedVolume = normalizeVolume(volume);
    if (normalizedVolume === this.#volume) {
      this.#showVolumeIndicator();
      return;
    }
    this.#volume = normalizedVolume;
    if (normalizedVolume > 0) this.#lastAudibleVolume = normalizedVolume;
    this.#audio.node.setVolume(TELEVISION_MAX_VOLUME * normalizedVolume);
    this.#showVolumeIndicator();
    this.#onVolumeChange?.(normalizedVolume);
    this.#emitStateChange();
  }

  #updatePowerIndicator() {
    this.#powerIndicatorMaterial.color.set(
      this.#powered ? "#8f2a1d" : "#37120e",
    );
    this.#powerIndicatorMaterial.emissive.set(
      this.#powered ? "#ff321d" : "#180200",
    );
    this.#powerIndicatorMaterial.emissiveIntensity = this.#powered ? 2.4 : 0.35;
  }

  #applyChannels(channels: readonly TvChannel[]) {
    const previousChannel = this.#channels[this.#channelIndex];
    const previousVideoId = this.#currentVideo?.id;
    const shouldRetryPlayback = this.#loadError !== undefined;
    const previousVideos = previousChannel
      ? JSON.stringify(previousChannel.videos)
      : undefined;
    const rememberedChannelId = previousChannel?.id ?? this.#initialChannelId;
    const nextChannelIndex = rememberedChannelId
      ? channels.findIndex((channel) => channel.id === rememberedChannelId)
      : -1;

    this.#channels = channels;
    this.#channelIndex = nextChannelIndex >= 0 ? nextChannelIndex : 0;
    this.#loadError = undefined;
    const nextChannel = this.#channels[this.#channelIndex];
    if (!nextChannel) {
      this.#resetChannelPlayback();
      return;
    }

    if (!previousChannel || nextChannel.id !== previousChannel.id) {
      this.#resetChannelPlayback();
      if (this.#powered) this.#advanceVideo();
      return;
    }
    if (JSON.stringify(nextChannel.videos) === previousVideos) {
      if (!shouldRetryPlayback) return;
      this.#resetChannelPlayback();
      if (this.#powered) this.#advanceVideo();
      return;
    }

    this.#bag = [];
    this.#failedVideoIds.clear();
    const currentVideoIndex = previousVideoId
      ? nextChannel.videos.findIndex((video) => video.id === previousVideoId)
      : -1;
    if (currentVideoIndex >= 0 && !shouldRetryPlayback) {
      this.#currentVideo = nextChannel.videos[currentVideoIndex];
      this.#currentVideoIndex = currentVideoIndex;
      this.#lastVideoIndex = currentVideoIndex;
      return;
    }

    this.#video.pause();
    this.#currentVideo = undefined;
    this.#currentVideoIndex = undefined;
    this.#lastVideoIndex = undefined;
    this.#resetActivePictureDetection();
    this.#showNoSignal();
    if (this.#powered) this.#advanceVideo();
  }

  #resetChannelPlayback() {
    this.#playRevision += 1;
    this.#video.pause();
    this.#loadError = undefined;
    this.#bag = [];
    this.#currentVideo = undefined;
    this.#currentVideoIndex = undefined;
    this.#lastVideoIndex = undefined;
    this.#failedVideoIds.clear();
    this.#resetActivePictureDetection();
    this.#showNoSignal();
  }

  #advanceVideo() {
    const channel = this.#channels[this.#channelIndex];
    if (!channel || channel.videos.length === 0) {
      this.#showNoSignal();
      return;
    }

    if (this.#currentVideoIndex !== undefined)
      this.#lastVideoIndex = this.#currentVideoIndex;
    if (this.#bag.length === 0)
      this.#bag = createShuffleBag(
        channel.videos.length,
        this.#lastVideoIndex,
        this.#random,
      );

    while (this.#bag.length > 0) {
      const videoIndex = this.#bag.shift();
      if (videoIndex === undefined) break;
      const video = channel.videos[videoIndex];
      if (!video || this.#failedVideoIds.has(video.id)) continue;
      this.#startVideo(video, videoIndex);
      return;
    }

    if (this.#failedVideoIds.size < channel.videos.length) {
      this.#bag = [];
      this.#advanceVideo();
      return;
    }
    this.#loadError = `Every program on ${channel.label} failed to play`;
    this.#showNoSignal();
    this.#emitStateChange();
  }

  #startVideo(video: TvVideo, videoIndex: number) {
    this.#currentVideo = video;
    this.#currentVideoIndex = videoIndex;
    const revision = ++this.#playRevision;
    this.#clearScreenLighting();
    this.#prepareActivePictureDetection(video);
    this.#video.src = video.url;
    this.#video.load();
    this.#showNoSignal();
    void this.#playCurrentVideo(revision);
    this.#emitStateChange();
  }

  async #playCurrentVideo(revision = this.#playRevision) {
    if (this.#suspended || !this.#powered || !this.#currentVideo) return;
    try {
      await this.#video.play();
      if (revision !== this.#playRevision || this.#disposed) return;
      this.#showVideo();
    } catch (error) {
      if (revision !== this.#playRevision || this.#disposed) return;
      this.#handlePlaybackFailure(error);
    }
  }

  #handlePlaybackFailure(error: unknown) {
    const video = this.#currentVideo;
    if (!video || this.#failedVideoIds.has(video.id)) return;
    this.#failedVideoIds.add(video.id);
    console.error(`Afterleaf TV could not play ${video.id}.`, error);
    this.#advanceVideo();
  }

  #ensureScreenLightingResources() {
    let canvas = this.#screenLightingCanvas;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = SCREEN_LIGHT_CANVAS_WIDTH;
      canvas.height = SCREEN_LIGHT_CANVAS_HEIGHT;
      this.#screenLightingCanvas = canvas;
    }
    if (!this.#screenLightingContext)
      this.#screenLightingContext = canvas.getContext("2d", {
        willReadFrequently: true,
      });
    return this.#screenLightingContext;
  }

  #sampleScreenLighting() {
    if (
      !this.#tvScreenLighting() ||
      this.#screenLightingUnavailable ||
      this.#screenLights.length === 0 ||
      !this.#powered ||
      !this.#currentVideo ||
      this.#video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    )
      return;

    const currentTime = Number.isFinite(this.#video.currentTime)
      ? this.#video.currentTime
      : 0;
    if (currentTime + Number.EPSILON < this.#nextScreenLightingSampleTime)
      return;
    this.#nextScreenLightingSampleTime =
      currentTime + SCREEN_LIGHT_SAMPLE_INTERVAL_SECONDS;

    const context = this.#ensureScreenLightingResources();
    const canvas = this.#screenLightingCanvas;
    const videoWidth = this.#video.videoWidth;
    const videoHeight = this.#video.videoHeight;
    if (!canvas || !context || videoWidth <= 0 || videoHeight <= 0) return;

    const activeRect = this.#activePictureRect;
    const mapping = getTvContentMapping(
      videoWidth * activeRect.width,
      videoHeight * activeRect.height,
      this.#screenAspect,
      this.#screenSafeArea,
    );
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const destinationWidth = mapping.scale.x * canvasWidth;
    const destinationHeight = mapping.scale.y * canvasHeight;
    const destinationX =
      mapping.center.x * canvasWidth - destinationWidth * 0.5;
    const destinationY =
      canvasHeight - mapping.center.y * canvasHeight - destinationHeight * 0.5;

    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    try {
      context.drawImage(
        this.#video,
        activeRect.x * videoWidth,
        activeRect.y * videoHeight,
        activeRect.width * videoWidth,
        activeRect.height * videoHeight,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight,
      );
      const pixels = context.getImageData(0, 0, canvasWidth, canvasHeight).data;
      for (const [index, edge] of SCREEN_LIGHT_EDGES.entries()) {
        const screenLight = this.#screenLights[index];
        if (!screenLight) continue;
        const sample = this.#sampleScreenLightEdge(
          pixels,
          canvasWidth,
          canvasHeight,
          edge,
        );
        screenLight.targetColor.setRGB(sample.red, sample.green, sample.blue);
        screenLight.targetIntensity =
          this.#screenLightMaximumIntensity * sample.brightness;
      }
    } catch (error) {
      this.#screenLightingUnavailable = true;
      console.error(
        `Afterleaf TV could not sample ${this.#currentVideo.id} for screen lighting.`,
        error,
      );
      for (const screenLight of this.#screenLights)
        screenLight.targetIntensity = 0;
    }
  }

  #sampleScreenLightEdge(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    edge: ScreenLightEdge,
  ) {
    const isHorizontal = edge === "top" || edge === "bottom";
    const bandSize = isHorizontal
      ? Math.max(1, Math.ceil(height * SCREEN_LIGHT_SAMPLE_BAND))
      : Math.max(1, Math.ceil(width * SCREEN_LIGHT_SAMPLE_BAND));
    const marginX = Math.floor(width * SCREEN_LIGHT_SAMPLE_MARGIN);
    const marginY = Math.floor(height * SCREEN_LIGHT_SAMPLE_MARGIN);
    let xStart = marginX;
    let xEnd = width - marginX;
    let yStart = marginY;
    let yEnd = height - marginY;
    if (edge === "top") {
      yStart = 0;
      yEnd = bandSize;
    } else if (edge === "right") {
      xStart = width - bandSize;
      xEnd = width;
    } else if (edge === "bottom") {
      yStart = height - bandSize;
      yEnd = height;
    } else {
      xStart = 0;
      xEnd = bandSize;
    }

    let red = 0;
    let green = 0;
    let blue = 0;
    let pixelCount = 0;
    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = (pixels[offset + 3] ?? 0) / 255;
        if (alpha <= 0) continue;
        red += srgbToLinear(((pixels[offset] ?? 0) / 255) * alpha);
        green += srgbToLinear(((pixels[offset + 1] ?? 0) / 255) * alpha);
        blue += srgbToLinear(((pixels[offset + 2] ?? 0) / 255) * alpha);
        pixelCount += 1;
      }
    }

    if (pixelCount === 0) return {brightness: 0, blue: 0, green: 0, red: 0};
    red /= pixelCount;
    green /= pixelCount;
    blue /= pixelCount;
    const brightness = Math.min(
      1,
      Math.pow(
        Math.max(
          0.2126 * red + 0.7152 * green + 0.0722 * blue,
          Math.max(red, green, blue) * 0.3,
        ),
        0.72,
      ),
    );
    return {brightness, blue, green, red};
  }

  #clearScreenLighting() {
    this.#nextScreenLightingSampleTime = 0;
    this.#screenLightingUnavailable = false;
    for (const screenLight of this.#screenLights) {
      screenLight.light.color.setRGB(0, 0, 0);
      screenLight.light.intensity = 0;
      screenLight.light.visible = false;
      screenLight.targetColor.setRGB(0, 0, 0);
      screenLight.targetIntensity = 0;
    }
  }

  #resetActivePictureDetection() {
    this.#activePictureDetection = undefined;
    this.#activePictureRect = FULL_ACTIVE_PICTURE_RECT;
  }

  #prepareActivePictureDetection(video: TvVideo) {
    if (video.activePicture) {
      this.#activePictureRect = video.activePicture;
      ShopTelevision.#activePictureCache.set(video.url, video.activePicture);
      this.#activePictureDetection = undefined;
      return;
    }
    this.#activePictureRect =
      ShopTelevision.#activePictureCache.get(video.url) ??
      FULL_ACTIVE_PICTURE_RECT;
    if (ShopTelevision.#activePictureCache.has(video.url)) {
      this.#activePictureDetection = undefined;
      return;
    }
    this.#activePictureDetection = {
      attempts: 0,
      key: video.url,
      nextSampleTime: 0,
      samples: [],
    };
  }

  #sampleActivePicture() {
    this.#sampleScreenLighting();
    const detection = this.#activePictureDetection;
    const currentVideo = this.#currentVideo;
    if (!detection || !currentVideo || detection.key !== currentVideo.url)
      return;
    if (this.#video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (this.#video.currentTime + Number.EPSILON < detection.nextSampleTime)
      return;

    detection.nextSampleTime =
      this.#video.currentTime + ACTIVE_PICTURE_SAMPLE_INTERVAL_SECONDS;
    detection.attempts += 1;
    const videoWidth = this.#video.videoWidth;
    const videoHeight = this.#video.videoHeight;
    if (videoWidth <= 0 || videoHeight <= 0) return;

    const analysisScale = Math.min(
      1,
      ACTIVE_PICTURE_ANALYSIS_MAX_WIDTH / videoWidth,
      ACTIVE_PICTURE_ANALYSIS_MAX_HEIGHT / videoHeight,
    );
    const width = Math.max(1, Math.round(videoWidth * analysisScale));
    const height = Math.max(1, Math.round(videoHeight * analysisScale));
    const canvas =
      this.#activePictureCanvas ?? document.createElement("canvas");
    this.#activePictureCanvas = canvas;
    canvas.width = width;
    canvas.height = height;
    const context =
      this.#activePictureContext ??
      canvas.getContext("2d", {willReadFrequently: true}) ??
      undefined;
    if (!context) {
      this.#finishActivePictureDetection(FULL_ACTIVE_PICTURE_RECT);
      return;
    }
    this.#activePictureContext = context;

    try {
      context.drawImage(this.#video, 0, 0, width, height);
      const sample = detectActivePictureRect(
        context.getImageData(0, 0, width, height).data,
        width,
        height,
      );
      if (sample) detection.samples.push(sample);
    } catch (error) {
      console.error(
        `Afterleaf TV could not inspect ${currentVideo.id}'s active picture.`,
        error,
      );
      this.#finishActivePictureDetection(FULL_ACTIVE_PICTURE_RECT);
      return;
    }

    const consensus = getActivePictureConsensus(
      detection.samples,
      ACTIVE_PICTURE_REQUIRED_SAMPLES,
    );
    if (consensus) {
      this.#finishActivePictureDetection(consensus);
      return;
    }
    if (detection.attempts >= ACTIVE_PICTURE_MAX_ATTEMPTS)
      this.#finishActivePictureDetection(FULL_ACTIVE_PICTURE_RECT);
  }

  #finishActivePictureDetection(rect: ActivePictureRect) {
    const detection = this.#activePictureDetection;
    if (!detection) return;
    ShopTelevision.#activePictureCache.set(detection.key, rect);
    this.#activePictureDetection = undefined;
    this.#activePictureRect = rect;
    this.#updateVisibleVideoMapping();
  }

  #showVideo() {
    if (!this.#powered) return;
    this.#updateVideoContentMapping();
    if (this.#screenMaterial.map !== this.#videoTexture) {
      this.#screenMaterial.map = this.#videoTexture;
      this.#screenMaterial.needsUpdate = true;
    }
    this.#sampleScreenLighting();
  }

  #showNoSignal() {
    this.#clearScreenLighting();
    this.#applyContentMapping(16, 9);
    this.#sourceRectUniform.value.set(0, 0, 1, 1);
    if (this.#screenMaterial.map === this.#noSignalTexture) return;
    this.#screenMaterial.map = this.#noSignalTexture;
    this.#screenMaterial.needsUpdate = true;
  }

  #updateVisibleVideoMapping() {
    if (this.#screenMaterial.map !== this.#videoTexture) return;
    this.#updateVideoContentMapping();
  }

  #updateVideoContentMapping() {
    const rect = this.#activePictureRect;
    this.#applyContentMapping(
      this.#video.videoWidth * rect.width,
      this.#video.videoHeight * rect.height,
    );
    this.#sourceRectUniform.value.set(
      rect.x,
      1 - rect.y - rect.height,
      rect.x + rect.width,
      1 - rect.y,
    );
  }

  #applyContentMapping(mediaWidth: number, mediaHeight: number) {
    const mapping = getTvContentMapping(
      mediaWidth,
      mediaHeight,
      this.#screenAspect,
      this.#screenSafeArea,
    );
    this.#contentCenterUniform.value.set(mapping.center.x, mapping.center.y);
    this.#contentScaleUniform.value.set(mapping.scale.x, mapping.scale.y);
  }

  #emitStateChange() {
    if (this.#disposed) return;
    this.#onStateChange?.();
  }
}
