import type {PerspectiveCamera, WebGLRenderer} from "three";

const MAX_PIXEL_RATIO = 2;

export type ShopViewportControllerHost = {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
};

/** Owns canvas measurement and renderer/camera sizing for the persistent shop viewport. */
export class ShopViewportController {
  readonly #camera: PerspectiveCamera;
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: WebGLRenderer;
  #height = 1;
  #lastPixelRatio = 0;
  #resizeObserver: ResizeObserver | undefined;
  #resizeDirty = true;
  #width = 1;

  constructor(host: ShopViewportControllerHost) {
    this.#camera = host.camera;
    this.#canvas = host.canvas;
    this.#renderer = host.renderer;
  }

  width() {
    return this.#width;
  }

  height() {
    return this.#height;
  }

  resizeDirty() {
    return this.#resizeDirty;
  }

  observe() {
    const bounds = this.#canvas.getBoundingClientRect();
    this.#width = bounds.width;
    this.#height = bounds.height;
    this.#resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.#width = entry.contentRect.width;
      this.#height = entry.contentRect.height;
      this.#resizeDirty = true;
    });
    this.#resizeObserver.observe(this.#canvas);
  }

  syncPixelRatio() {
    const pixelRatio = this.#pixelRatio();
    if (pixelRatio === this.#lastPixelRatio) return;
    this.#resizeDirty = true;
  }

  applyResize() {
    this.#resizeDirty = false;
    const width = Math.max(1, Math.floor(this.#width));
    const height = Math.max(1, Math.floor(this.#height));
    const pixelRatio = this.#pixelRatio();
    this.#lastPixelRatio = pixelRatio;
    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  dispose() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
  }

  #pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  }
}
