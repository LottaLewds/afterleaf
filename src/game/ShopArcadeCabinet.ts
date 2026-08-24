import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PointLight,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from "three";
import {DEV} from "solid-js";

import {arcadeGameId, findArcadeSystem} from "~/arcade/systems";
import {buildDefaultControllers} from "~/arcade/controllerMappings";
import {
  launchEmulator,
  type EmulatorSession,
  type ForwardedKeyEvent,
} from "~/arcade/emulatorHost";
import {
  type PositionalStreamAudioHandle,
  type ShopAudioManager,
} from "~/game/ShopAudioManager";
import arcadeCabinetModelUrl from "~/assets/models/arcade_cabinet_ms_pacman.glb?url";
import {
  findModelTelevisionScreen,
  getModelTelevisionScreenAspect,
  normalizeModelScreenUvs,
} from "~/game/modelTelevision";
import {buildMergedStaticParts} from "~/game/staticModelBatching";

export const ARCADE_CABINET_HEIGHT = 1.72;
export const ARCADE_CABINET_SCREEN_NODE_NAME = "TVScreen";

export type ArcadeCabinetInteraction = "body" | "screen";

/** Lifecycle of one cabinet's emulator; undefined means attract mode. */
export type ArcadeSessionStatus =
  | "browsing"
  | "downloading"
  | "launching"
  | "playing";

export type ShopArcadePlayRequest = {
  systemId: string;
  name: string;
  /** Same-origin blob URL of the downloaded ROM. */
  romUrl: string;
};

export type ShopArcadeCabinetOptions = {
  parent: Object3D;
  position: readonly [number, number, number];
  rotationY?: number;
  /** Shared positional audio buses; game audio plays through the media bus. */
  audioManager: ShopAudioManager;
  /** Called when the player activates the cabinet (E while targeting). */
  onInteractRequest: (cabinet: ShopArcadeCabinet) => void;
  /** Called whenever the cabinet's session state changes. */
  onStateChange: () => void;
};

const ATTRACT_FPS = 12;

/** How long the on-screen volume indicator stays visible. */
const OSD_DURATION_MS = 1_400;

/** Speaker tuning for the live game audio tap; falloff matches the TVs. */
const ARCADE_SPEAKER_AUDIO = {
  cone: {innerAngle: 150, outerAngle: 270, outerGain: 0.22},
  refDistance: 1.7,
  rolloffFactor: 0.85,
} as const;

/**
 * Base speaker gain before the user's volume preference. Tuned against the
 * television loudness (TELEVISION_MAX_VOLUME 0.72): the tapped stream runs
 * quieter than a media element's direct signal, so this sits above unity to
 * make a cabinet at 100% read comparable to a TV at 100% at the same spot.
 */
const ARCADE_MAX_VOLUME = 2;
const ARCADE_VOLUME_STEP = 0.05;
const ARCADE_VOLUME_MIN = 0;
/** Above 1 boosts past unity, matching the requested up-to-150% range. */
const ARCADE_VOLUME_MAX = 1.5;
const ARCADE_VOLUME_STORAGE_KEY = "afterleaf.arcade.volume";

const clampArcadeVolume = (volume: number): number =>
  Number.isFinite(volume)
    ? Math.min(
        ARCADE_VOLUME_MAX,
        Math.max(ARCADE_VOLUME_MIN, Math.round(volume * 100) / 100),
      )
    : 1;

const loadStoredArcadeVolume = (): number => {
  try {
    const raw = localStorage.getItem(ARCADE_VOLUME_STORAGE_KEY);
    return raw === null ? 1 : clampArcadeVolume(Number.parseFloat(raw));
  } catch (error) {
    if (DEV) console.warn("Afterleaf could not read arcade volume.", error);
    return 1;
  }
};

const storeArcadeVolume = (volume: number) => {
  try {
    localStorage.setItem(ARCADE_VOLUME_STORAGE_KEY, String(volume));
  } catch (error) {
    if (DEV) console.warn("Afterleaf could not store arcade volume.", error);
  }
};

/**
 * The physical arcade cabinet prop: loads the ms-pac-man GLB, wires its
 * TVScreen mesh to either the attract-mode canvas or the live emulator
 * canvas, and exposes raycast interaction targets for the shop's reticle.
 */
export class ShopArcadeCabinet {
  private static readonly modelLoader = new GLTFLoader();
  private static nextId = 1;

  readonly id: string;
  readonly object = new Group();
  readonly interactionTargets: Mesh[] = [];
  readonly ready: Promise<void>;

  readonly #material: MeshBasicMaterial;
  readonly #attractTexture: CanvasTexture;
  readonly #attractCanvas: HTMLCanvasElement;
  readonly #attractContext: CanvasRenderingContext2D | undefined;
  readonly #liveTexture: CanvasTexture;
  readonly #marqueeLight: PointLight;
  #screenAspect: number;
  readonly #audioManager: ShopAudioManager;
  readonly #onInteractRequest: (cabinet: ShopArcadeCabinet) => void;
  readonly #onStateChange: () => void;
  #liveCanvas: HTMLCanvasElement | undefined;
  #uploadedFrame: number | undefined;
  #uploadedWidth: number | undefined;
  #uploadedHeight: number | undefined;
  #targeted = false;
  #attractTime = 0;
  #sinceAttractRedraw = 0;
  #disposed = false;

  // Per-cabinet emulator session. Each cabinet can run its own game at the
  // same time; only the active one receives forwarded keyboard input.
  #sessionStatus: ArcadeSessionStatus | undefined;
  #sessionDetail: string | undefined;
  #sessionRomName: string | undefined;
  #sessionSystemId: string | undefined;
  #host: EmulatorSession | undefined;
  #arcadeAudio: PositionalStreamAudioHandle | undefined;
  /** User volume preference (0-1.5), persisted across sessions. */
  #arcadeUserVolume = loadStoredArcadeVolume();
  // Screen-level volume indicator: while visible the material swaps to a
  // composite canvas (live frame + OSD text) so motion stays readable.
  #osdCanvas: HTMLCanvasElement | undefined;
  #osdContext: CanvasRenderingContext2D | undefined;
  #osdTexture: CanvasTexture | undefined;
  #osdUntil = 0;
  #osdLabel = "";
  #osdColor = "#c9f0d3";

  constructor(options: ShopArcadeCabinetOptions) {
    this.id = `arcade-${ShopArcadeCabinet.nextId++}`;
    this.#audioManager = options.audioManager;
    this.#onInteractRequest = options.onInteractRequest;
    this.#onStateChange = options.onStateChange;
    this.#screenAspect = 6 / 5;
    this.object.name = "shop-arcade-cabinet";
    this.object.position.set(...options.position);
    if (options.rotationY !== undefined)
      this.object.rotation.y = options.rotationY;

    this.#attractCanvas = document.createElement("canvas");
    this.#attractCanvas.width = 384;
    this.#attractCanvas.height = Math.round(384 / this.#screenAspect);
    this.#attractContext = this.#attractCanvas.getContext("2d") ?? undefined;
    this.#drawAttractFrame(0);

    this.#attractTexture = new CanvasTexture(this.#attractCanvas);
    this.#attractTexture.colorSpace = SRGBColorSpace;
    this.#attractTexture.generateMipmaps = false;
    this.#attractTexture.minFilter = LinearFilter;
    this.#attractTexture.magFilter = LinearFilter;

    // A 1x1 placeholder replaced by the emulator canvas once booted.
    const placeholder = document.createElement("canvas");
    placeholder.width = 1;
    placeholder.height = 1;
    this.#liveTexture = new CanvasTexture(placeholder);
    this.#liveTexture.colorSpace = SRGBColorSpace;
    this.#liveTexture.generateMipmaps = false;
    this.#liveTexture.minFilter = LinearFilter;
    this.#liveTexture.magFilter = NearestFilter;

    this.#material = new MeshBasicMaterial({
      map: this.#attractTexture,
      toneMapped: false,
    });

    // Soft red wash above the cabinet so it reads as "on" across the room.
    // Center-relative: the marquee sits near the top of the cabinet.
    this.#marqueeLight = new PointLight("#ff5a48", 0.85, 4.2, 2);
    this.#marqueeLight.position.set(0, ARCADE_CABINET_HEIGHT * 0.42, 0.25);
    this.object.add(this.#marqueeLight);

    options.parent.add(this.object);

    this.ready = ShopArcadeCabinet.modelLoader
      .loadAsync(arcadeCabinetModelUrl)
      .then((gltf) => {
        if (this.#disposed) return;
        this.#attachModel(gltf.scene);
      })
      .catch((cause: unknown) => {
        console.error("Afterleaf could not load the arcade cabinet.", cause);
      });
  }

  #attachModel(scene: Object3D) {
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    if (size.y > Number.EPSILON)
      scene.scale.setScalar(ARCADE_CABINET_HEIGHT / size.y);
    scene.updateMatrixWorld(true);
    const scaledBounds = new Box3().setFromObject(scene);
    const scaledCenter = scaledBounds.getCenter(new Vector3());
    // Origin sits at the model's center, matching every other movable prop:
    // physics box colliders are centered on the body origin, so a feet-level
    // origin would leave the cabinet hovering half a height above the floor.
    scene.position.sub(scaledCenter);
    this.object.add(scene);

    const screen = findModelTelevisionScreen(
      this.object,
      ARCADE_CABINET_SCREEN_NODE_NAME,
    );
    if (!screen) {
      console.error("The arcade cabinet model is missing its TVScreen node.");
      return;
    }
    const measuredAspect = getModelTelevisionScreenAspect(screen);
    if (measuredAspect && Number.isFinite(measuredAspect))
      this.#screenAspect = measuredAspect;

    normalizeModelScreenUvs(screen);
    screen.material = this.#material;
    screen.userData.arcadeInteraction = "screen";

    // The cabinet's static trim collapses into one draw call per material
    // signature; the screen stays independent for live emulator output.
    const {consumed, parts} = buildMergedStaticParts(
      scene,
      (mesh) => mesh === screen,
    );
    if (consumed.length > 1) {
      for (const original of consumed) original.removeFromParent();
      for (const {geometry, material} of parts) {
        const merged = new Mesh(geometry, material);
        merged.castShadow = true;
        merged.receiveShadow = true;
        merged.userData.arcadeInteraction = "body";
        scene.add(merged);
      }
    }

    scene.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.arcadeInteraction ??= "body";
      this.interactionTargets.push(child);
    });
  }

  setTargeted(targeted: boolean) {
    this.#targeted = targeted;
  }

  /** Swaps the screen to the running emulator's canvas (or back to attract). */
  setLiveCanvas(canvas: HTMLCanvasElement | undefined) {
    this.#liveCanvas = canvas;
    if (canvas) {
      this.#uploadedFrame = undefined;
      this.#uploadedWidth = undefined;
      this.#uploadedHeight = undefined;
      this.#liveTexture.image = canvas;
      this.#liveTexture.needsUpdate = true;
      this.#material.map = this.#liveTexture;
    } else {
      this.#disposeOsd();
      this.#material.map = this.#attractTexture;
    }
    this.#material.needsUpdate = true;
  }

  interact() {
    this.#onInteractRequest(this);
  }

  get screenAspect() {
    return this.#screenAspect;
  }

  // -- Session state (polled by ShopScene when emitting snapshots) ----------

  get sessionStatus() {
    return this.#sessionStatus;
  }

  get sessionDetail() {
    return this.#sessionDetail;
  }

  get sessionRomName() {
    return this.#sessionRomName;
  }

  get sessionSystemId() {
    return this.#sessionSystemId;
  }

  #setSession(
    status: ArcadeSessionStatus | undefined,
    detail?: string,
    romName?: string,
  ) {
    this.#sessionStatus = status;
    this.#sessionDetail = detail;
    if (romName !== undefined) this.#sessionRomName = romName;
    this.#onStateChange();
  }

  /** Opens the ROM picker state for this cabinet. */
  beginBrowsing() {
    if (this.#sessionStatus) return;
    this.#setSession("browsing", undefined);
  }

  /** Boots the emulator for a downloaded ROM and puts the screen live. */
  play(request: ShopArcadePlayRequest) {
    const system = findArcadeSystem(request.systemId);
    if (!system) {
      this.#setSession("browsing", `Unknown system ${request.systemId}.`);
      return;
    }
    this.#sessionSystemId = system.id;
    if (this.#host) this.destroyHost();
    this.#setSession("launching", "Booting the cabinet…", request.name);
    const host = launchEmulator({
      core: system.core,
      romUrl: request.romUrl,
      gameName: request.name,
      gameId: arcadeGameId(system.id, request.name),
      defaultControllers: buildDefaultControllers(system.id),
      onStart: () => {
        void host.canvasReady
          .then((canvas) => {
            if (this.#disposed || this.#host !== host) return;
            this.setLiveCanvas(canvas);
            this.#setSession("playing", undefined);
          })
          .catch((cause: unknown) => {
            console.error("Afterleaf arcade boot failed.", cause);
          });
        void host.audioStreamReady
          .then((stream) => {
            if (this.#disposed || this.#host !== host) return;
            if (!stream) return; // Tap failed; local speaker output remains.
            this.#attachArcadeAudio(host, stream);
          })
          .catch((cause: unknown) => {
            console.warn("Afterleaf arcade audio tap failed.", cause);
          });
      },
      // Driver restarts (e.g. after a hide/resume cycle) move the tap to a
      // fresh AudioContext; rewire the positional node onto the new stream.
      onAudioStreamChange: (stream) => {
        if (this.#disposed || this.#host !== host) return;
        this.#attachArcadeAudio(host, stream);
      },
      onExit: () => {
        if (this.#host !== host) return;
        this.destroyHost();
        this.#setSession("browsing", undefined);
      },
      onError: (message) => {
        this.setLiveCanvas(undefined);
        this.#setSession("browsing", message);
      },
      safeAudioContext: this.#audioManager.listener.context,
    });
    this.#host = host;
  }

  #attachArcadeAudio(host: EmulatorSession, stream: MediaStream) {
    // Replace any existing handle so the old stream's wiring is released.
    this.#arcadeAudio?.dispose();
    const handle = this.#audioManager.createPositionalMediaStream(stream, {
      ...ARCADE_SPEAKER_AUDIO,
      volume: ARCADE_MAX_VOLUME * this.#arcadeUserVolume,
    });
    if (this.#disposed || this.#host !== host) {
      handle.dispose();
      return;
    }
    this.#arcadeAudio = handle;
    this.object.add(handle.node);
    void this.#audioManager.resume();
  }

  /** Ctrl+wheel volume; persists across sessions and applies live. */
  adjustArcadeVolume(direction: -1 | 1) {
    const next = clampArcadeVolume(
      this.#arcadeUserVolume + direction * ARCADE_VOLUME_STEP,
    );
    if (next === this.#arcadeUserVolume) return;
    this.#arcadeUserVolume = next;
    storeArcadeVolume(next);
    // Live sessions re-level immediately; the next attach picks it up otherwise.
    this.#arcadeAudio?.node.setVolume(ARCADE_MAX_VOLUME * next);
    // Mirror the TV: emit so the Interact panel percent updates reactively,
    // and flash the indicator on the cabinet's own screen.
    this.#onStateChange();
    const volumePercent = Math.round(next * 100);
    this.#showScreenIndicator(
      volumePercent === 0 ? "MUTED 0%" : `VOL ${volumePercent}%`,
      volumePercent === 0 ? "#eadbc0" : "#c9f0d3",
    );
  }

  get arcadeVolumePercent() {
    return Math.round(this.#arcadeUserVolume * 100);
  }

  // -- Screen-level volume indicator -----------------------------------------

  /**
   * Builds (or rebuilds, on resolution change) the composite surface and
   * stamps the current live frame plus the OSD pill onto it.
   */
  #ensureOsdSurface(label: string, color: string): boolean {
    const canvas = this.#liveCanvas;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
    if (
      !this.#osdCanvas ||
      this.#osdCanvas.width !== canvas.width ||
      this.#osdCanvas.height !== canvas.height
    ) {
      this.#disposeOsd();
      this.#osdCanvas = document.createElement("canvas");
      this.#osdCanvas.width = canvas.width;
      this.#osdCanvas.height = canvas.height;
      this.#osdContext = this.#osdCanvas.getContext("2d") ?? undefined;
      this.#osdTexture = new CanvasTexture(this.#osdCanvas);
      this.#osdTexture.colorSpace = SRGBColorSpace;
      this.#osdTexture.generateMipmaps = false;
      this.#osdTexture.minFilter = LinearFilter;
      this.#osdTexture.magFilter = NearestFilter;
    }
    // Remember the label: the per-frame composite in #updateOsd repaints it.
    this.#osdLabel = label;
    this.#osdColor = color;
    return this.#compositeOsdFrame();
  }

  /** Live frame + OSD pill, from scratch. Pill geometry mirrors the TVs. */
  #compositeOsdFrame(): boolean {
    const canvas = this.#liveCanvas;
    const osdCanvas = this.#osdCanvas;
    const context = this.#osdContext;
    if (!canvas || !osdCanvas || !context) return false;
    context.clearRect(0, 0, osdCanvas.width, osdCanvas.height);
    context.drawImage(canvas, 0, 0);
    const fontSize = Math.round(osdCanvas.height * 0.18);
    const paddingX = fontSize * 0.52;
    const boxHeight = fontSize * 1.42;
    context.font = `700 ${fontSize}px monospace`;
    const boxWidth = context.measureText(this.#osdLabel).width + paddingX * 2;
    const left = (osdCanvas.width - boxWidth) / 2;
    const top = (osdCanvas.height - boxHeight) / 2;
    const radius = fontSize * 0.24;
    context.beginPath();
    context.roundRect(left, top, boxWidth, boxHeight, radius);
    context.fillStyle = "rgba(7,16,15,0.78)";
    context.fill();
    context.fillStyle = this.#osdColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(this.#osdLabel, osdCanvas.width / 2, top + boxHeight / 2);
    return true;
  }

  #showScreenIndicator(label: string, color: string) {
    if (!this.#ensureOsdSurface(label, color) || !this.#osdTexture) return;
    this.#osdUntil = performance.now() + OSD_DURATION_MS;
    if (this.#material.map !== this.#osdTexture) {
      this.#material.map = this.#osdTexture;
      this.#material.needsUpdate = true;
    }
    this.#osdTexture.needsUpdate = true;
  }

  /**
   * Keeps the OSD composited while visible (fresh live frame under the pill
   * each rendered frame); reverts to the direct texture once it expires.
   * Returns true when the OSD consumed this frame.
   */
  #updateOsd(): boolean {
    if (performance.now() >= this.#osdUntil) {
      if (this.#material.map !== this.#liveTexture) {
        this.#material.map = this.#liveTexture;
        this.#material.needsUpdate = true;
        // Force one fresh gated upload so a stale composite never lingers.
        this.#uploadedFrame = undefined;
      }
      return false;
    }
    const osdTexture = this.#osdTexture;
    if (!osdTexture) return false;
    if (!this.#compositeOsdFrame()) return false;
    osdTexture.needsUpdate = true;
    return true;
  }

  #disposeOsd() {
    this.#osdUntil = 0;
    this.#osdCanvas = undefined;
    this.#osdContext = undefined;
    if (this.#osdTexture) {
      this.#osdTexture.dispose();
      this.#osdTexture = undefined;
    }
  }

  /** Playing → back to the ROM picker. */
  quitGame() {
    if (this.#sessionStatus !== "playing") return;
    this.destroyHost();
    this.setLiveCanvas(undefined);
    this.#setSession("browsing", undefined);
  }

  /** Any session → attract mode; the player walks away. */
  exitToIdle() {
    if (!this.#sessionStatus) return;
    this.destroyHost();
    this.setLiveCanvas(undefined);
    this.#sessionSystemId = undefined;
    this.#setSession(undefined, undefined);
  }

  forwardKey(down: boolean, event: ForwardedKeyEvent) {
    this.#host?.forwardKey(down, event);
  }

  /** Telemetry for the scene-level FPS readout. */
  get perfSample() {
    return {
      frameCount: this.#host?.frameCount(),
      canvasWidth: this.#liveCanvas?.width,
      canvasHeight: this.#liveCanvas?.height,
    };
  }

  private destroyHost() {
    this.#arcadeAudio?.dispose();
    this.#arcadeAudio = undefined;
    this.#host?.destroy();
    this.#host = undefined;
  }

  #drawAttractFrame(timeSeconds: number) {
    const context = this.#attractContext;
    if (!context) return;
    const width = this.#attractCanvas.width;
    const height = this.#attractCanvas.height;

    context.fillStyle = "#050708";
    context.fillRect(0, 0, width, height);

    // Faint grid backdrop reminiscent of a boot screen.
    context.strokeStyle = "rgba(217,76,63,0.08)";
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const glowPulse = 0.72 + 0.28 * Math.sin(timeSeconds * 2.1);
    context.textAlign = "center";
    context.shadowBlur = 18 * glowPulse;

    context.shadowColor = "#d94c3f";
    context.fillStyle = "#f4b9ae";
    context.font = `bold ${Math.round(width * 0.135)}px Georgia, serif`;
    context.fillText("AFTERLEAF", width / 2, height * 0.34);

    context.shadowColor = "#62b47c";
    context.fillStyle = "#c7ecd2";
    context.font = `bold ${Math.round(width * 0.09)}px monospace`;
    context.fillText("ARCADE", width / 2, height * 0.47);

    context.shadowBlur = 0;
    context.font = `${Math.round(width * 0.05)}px monospace`;
    if (this.#targeted || Math.sin(timeSeconds * 3.4) > -0.2) {
      context.fillStyle = "#e9dfc8";
      context.fillText("INSERT COIN", width / 2, height * 0.64);
    }

    // Scanning scanline band.
    const scanY = ((timeSeconds * 60) % (height + 80)) - 40;
    const gradient = context.createLinearGradient(0, scanY - 30, 0, scanY + 30);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.05)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, scanY - 30, width, 60);

    // Scrolling marquee ticker along the bottom edge.
    const ticker =
      "HOME BREW CARTRIDGES · HIGH SCORES NIGHTLY · NO QUARTERS NEEDED · ";
    context.font = `${Math.round(width * 0.042)}px monospace`;
    const tickerWidth = context.measureText(ticker).width;
    const offset = (timeSeconds * 90) % tickerWidth;
    context.fillStyle = "rgba(141,160,152,0.85)";
    context.textAlign = "left";
    for (let x = -offset; x < width; x += tickerWidth) {
      context.fillText(ticker, x, height * 0.93);
    }
    context.textAlign = "center";

    // Static-ish CRT scanlines.
    context.fillStyle = "rgba(0,0,0,0.16)";
    for (let y = 0; y < height; y += 3) context.fillRect(0, y, width, 1);
  }

  update(deltaSeconds: number) {
    if (this.#disposed) return;
    if (this.#liveCanvas) {
      // While the volume indicator is visible the material shows the
      // composite surface instead; refresh it every rendered frame so the
      // game keeps moving under the pill.
      if (this.#updateOsd()) return;
      // The emulator canvas lives in its own WebGL context, so every
      // needsUpdate costs a GPU-GPU copy (Chromium's cross-context copy).
      // Copy only when the core actually produced a new emulated frame -
      // re-copying identical content at high refresh rates just burns
      // bandwidth. Fail open when the counter is unavailable (always copy).
      //
      // A resized backing store always forces a copy, and the GPU allocation
      // is freed first: copying into the stale allocation makes Chromium's
      // copy overflow (glCopySubTextureCHROMIUM GL_INVALID_VALUE) and stick
      // black frames.
      const canvas = this.#liveCanvas;
      const frames = this.#host?.frameCount();
      const resized =
        canvas.width !== this.#uploadedWidth ||
        canvas.height !== this.#uploadedHeight;
      if (resized) {
        this.#uploadedWidth = canvas.width;
        this.#uploadedHeight = canvas.height;
        this.#liveTexture.dispose();
        this.#uploadedFrame = frames;
        this.#liveTexture.needsUpdate = true;
      } else if (frames === undefined || frames !== this.#uploadedFrame) {
        this.#uploadedFrame = frames;
        this.#liveTexture.needsUpdate = true;
      }
      return;
    }
    this.#attractTime += deltaSeconds;
    this.#sinceAttractRedraw += deltaSeconds;
    if (this.#sinceAttractRedraw >= 1 / ATTRACT_FPS) {
      this.#drawAttractFrame(this.#attractTime);
      this.#attractTexture.needsUpdate = true;
      this.#sinceAttractRedraw = 0;
    }
    this.#marqueeLight.intensity =
      0.78 +
      0.14 * Math.sin(this.#attractTime * 9.1) +
      (this.#targeted ? 0.16 : 0);
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.destroyHost();
    this.setLiveCanvas(undefined);
    this.object.removeFromParent();
    this.#disposeOsd();
    this.#attractTexture.dispose();
    this.#liveTexture.dispose();
    this.#material.dispose();
    this.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) material?.dispose();
    });
  }
}
