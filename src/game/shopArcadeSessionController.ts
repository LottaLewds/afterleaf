import {MathUtils, Vector3, type Object3D, type PerspectiveCamera} from "three";
import type {
  ArcadeSessionStatus,
  ShopArcadeCabinet,
  ShopArcadePlayRequest,
} from "~/game/ShopArcadeCabinet";
import {ARCADE_CABINET_HEIGHT} from "~/game/ShopArcadeCabinet";
import {DEFAULT_PITCH_LIMIT} from "~/game/shopGameplay";

export type ShopArcadeSessionControllerHost = {
  camera: () => PerspectiveCamera;
  disposed: () => boolean;
  emitGameState: () => void;
  lookTarget: () => {pitch: number; yaw: number};
  paused: () => boolean;
  releasePointerLock: () => void;
  requestPointerLock: () => void;
};

/** Owns the active arcade session and its UI escape ladder. */
export class ShopArcadeSessionController {
  readonly cabinets: ShopArcadeCabinet[] = [];
  activeArcadeCabinet: ShopArcadeCabinet | undefined;
  readonly #arcadeAimTarget = new Vector3();
  readonly #host: ShopArcadeSessionControllerHost;

  constructor(host: ShopArcadeSessionControllerHost) {
    this.#host = host;
  }

  playArcadeRom(cabinetId: string, request: ShopArcadePlayRequest) {
    if (this.#host.disposed()) return;
    const cabinet = this.cabinets.find((entry) => entry.id === cabinetId);
    if (!cabinet) return;
    this.activeArcadeCabinet = cabinet;
    cabinet.play(request);
    this.#host.emitGameState();
    // Re-capture the cursor on the picker's own click gesture: launching and
    // playing keep it hidden, matching free roam.
    if (!this.#host.paused()) this.#host.requestPointerLock();
  }

  quitActiveArcadeGame() {
    if (this.#host.disposed()) return;
    this.activeArcadeCabinet?.quitGame();
    this.#host.emitGameState();
  }

  /**
   * Escape ladder for the UI-active session: a running game steps away from
   * its cabinet (emulation keeps running), an open picker or boot overlay
   * exits entirely. Called by the shared modal stack, which owns Escape
   * routing while a session is active.
   */
  backOutOfArcade() {
    if (this.#host.disposed()) return;
    const cabinet = this.activeArcadeCabinet;
    if (!cabinet) return;
    if (cabinet.sessionStatus === "playing") this.stepAwayFromArcade();
    else this.exitArcadeUi();
  }

  /**
   * Backs out of any arcade UI: an open picker or a running game closes and
   * the player returns to walking around the shop.
   */
  exitArcadeUi() {
    if (this.#host.disposed()) return;
    const activeCabinet = this.activeArcadeCabinet;
    this.activeArcadeCabinet = undefined;
    activeCabinet?.exitToIdle();
    // Any other cabinet left in a UI state closes too; independent cabinets
    // that are actively playing keep running.
    for (const cabinet of this.cabinets)
      if (
        cabinet !== activeCabinet &&
        cabinet.sessionStatus &&
        cabinet.sessionStatus !== "playing"
      )
        cabinet.exitToIdle();
    this.#host.emitGameState();
    // Hand control back immediately (called from an activating gesture such
    // as Escape or the Leave button), mirroring inspection close.
    if (!this.#host.paused()) this.#host.requestPointerLock();
  }

  /**
   * Steps away from the active session's UI without stopping emulation: the
   * world unfreezes, keys stop forwarding, and the cabinet keeps playing
   * until the player targets it again (E resumes) or quits through the ROM
   * picker. Pointer lock is held through the whole cycle; if the browser
   * force-released it (Escape), standard click-to-lock recovers.
   */
  stepAwayFromArcade() {
    if (this.#host.disposed() || !this.activeArcadeCabinet) return;
    this.activeArcadeCabinet = undefined;
    this.#host.emitGameState();
  }

  /**
   * Activates a targeted cabinet's UI: a live session reattaches where it
   * left off, a free one opens its ROM picker, and boots in progress stay
   * owned by the surface that started them.
   */
  enterArcadeBrowsing(cabinet: ShopArcadeCabinet) {
    const status = cabinet.sessionStatus;
    console.warn("[arcade] interact:", cabinet.id, status);
    if (status === "downloading" || status === "launching") return;
    this.activeArcadeCabinet = cabinet;
    this.#aimCameraAtObject(cabinet.object);
    if (!status) {
      // Only the ROM picker needs a visible cursor; resuming a live session
      // keeps the pointer exactly where walking left it.
      this.#host.releasePointerLock();
      cabinet.beginBrowsing();
    }
    this.#host.emitGameState();
  }

  /** Snapshot fields describing the UI-active cabinet's session, if any. */
  arcadeStatusForUi(): ArcadeSessionStatus | undefined {
    return this.activeArcadeCabinet?.sessionStatus;
  }

  /** System of the ROM most recently played on the UI-active cabinet. */
  arcadeSystemIdForUi(): string | undefined {
    return this.activeArcadeCabinet?.sessionSystemId;
  }

  update(deltaSeconds: number) {
    for (const cabinet of this.cabinets) cabinet.update(deltaSeconds);
  }

  dispose() {
    for (const cabinet of this.cabinets) cabinet.dispose();
    this.cabinets.length = 0;
    this.activeArcadeCabinet = undefined;
  }

  /** Gently turns the player's view toward a cabinet's screen on entry. */
  #aimCameraAtObject(object: Object3D) {
    object.getWorldPosition(this.#arcadeAimTarget);
    // Center-origin model; the screen sits a little above the middle.
    this.#arcadeAimTarget.y += ARCADE_CABINET_HEIGHT * 0.14;
    const camera = this.#host.camera();
    const deltaX = this.#arcadeAimTarget.x - camera.position.x;
    const deltaY = this.#arcadeAimTarget.y - camera.position.y;
    const deltaZ = this.#arcadeAimTarget.z - camera.position.z;
    const horizontal = Math.hypot(deltaX, deltaZ);
    if (horizontal < Number.EPSILON) return;
    const lookTarget = this.#host.lookTarget();
    lookTarget.yaw = Math.atan2(-deltaX, -deltaZ);
    lookTarget.pitch = MathUtils.clamp(
      Math.atan2(deltaY, horizontal),
      -DEFAULT_PITCH_LIMIT,
      DEFAULT_PITCH_LIMIT,
    );
  }
}
