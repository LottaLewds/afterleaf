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

import {arcadeGameId, findArcadeSystem} from "~/arcade/systems";
import {
  launchEmulator,
  type EmulatorSession,
  type ForwardedKeyEvent,
} from "~/arcade/emulatorHost";
import arcadeCabinetModelUrl from "~/assets/models/arcade_cabinet_ms_pacman.glb?url";
import {
  findModelTelevisionScreen,
  getModelTelevisionScreenAspect,
  normalizeModelScreenUvs,
} from "~/game/modelTelevision";

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
  /** Called when the player activates the cabinet (E while targeting). */
  onInteractRequest: (cabinet: ShopArcadeCabinet) => void;
  /** Called whenever the cabinet's session state changes. */
  onStateChange: () => void;
};

const ATTRACT_FPS = 12;

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
  readonly #onInteractRequest: (cabinet: ShopArcadeCabinet) => void;
  readonly #onStateChange: () => void;
  #liveCanvas: HTMLCanvasElement | undefined;
  #targeted = false;
  #attractTime = 0;
  #sinceAttractRedraw = 0;
  #disposed = false;

  // Per-cabinet emulator session. Each cabinet can run its own game at the
  // same time; only the active one receives forwarded keyboard input.
  #sessionStatus: ArcadeSessionStatus | undefined;
  #sessionSystemId: string | undefined;
  #sessionDetail: string | undefined;
  #sessionRomName: string | undefined;
  #host: EmulatorSession | undefined;

  constructor(options: ShopArcadeCabinetOptions) {
    this.id = `arcade-${ShopArcadeCabinet.nextId++}`;
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
      this.#liveTexture.image = canvas;
      this.#liveTexture.needsUpdate = true;
      this.#material.map = this.#liveTexture;
    } else {
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
    });
    this.#host = host;
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

  private destroyHost() {
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
    context.fillText(ticker, width - offset, height * 0.93);
    context.fillText(ticker, -offset, height * 0.93);
    context.textAlign = "center";

    // Static-ish CRT scanlines.
    context.fillStyle = "rgba(0,0,0,0.16)";
    for (let y = 0; y < height; y += 3) context.fillRect(0, y, width, 1);
  }

  update(deltaSeconds: number) {
    if (this.#disposed) return;
    if (this.#liveCanvas) {
      // Copy the emulator's frames onto the GPU every rendered frame.
      this.#liveTexture.needsUpdate = true;
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
