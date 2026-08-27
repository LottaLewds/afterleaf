/** How often the readout recomputes its rates. */
const SAMPLE_INTERVAL_S = 0.5;

export type FpsHudSample = {
  /** Emulated frame counter of the active session, when one exists. */
  frameCount?: number | undefined;
  canvasWidth?: number | undefined;
  canvasHeight?: number | undefined;
};

/**
 * Scene-level FPS readout (bottom-right overlay): HOST is the render loop's
 * cadence, MAX the slowest frame in the window - spikes there are what
 * dropped or unevenly-timed frames feel like - and CORE is emulated frames
 * per wall second for the active arcade session, straight from the core's
 * frame counter.
 */
export class FpsHud {
  readonly #element: HTMLDivElement;
  #elapsed = 0;
  #hostFrames = 0;
  #worstFrameMs = 0;
  #lastCoreFrames: number | undefined;

  constructor() {
    const hud = document.createElement("div");
    hud.style.position = "fixed";
    hud.style.right = "4px";
    hud.style.bottom = "4px";
    hud.style.zIndex = "60";
    hud.style.padding = "2px 6px";
    hud.style.borderRadius = "4px";
    hud.style.background = "rgba(7,16,15,0.78)";
    hud.style.color = "#a8e6b0";
    hud.style.font = "10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace";
    hud.style.pointerEvents = "none";
    hud.style.whiteSpace = "pre";
    hud.textContent = "HOST …";
    document.body.appendChild(hud);
    this.#element = hud;
  }

  update(deltaSeconds: number, sample?: FpsHudSample) {
    const frameMs = deltaSeconds * 1000;
    if (frameMs > this.#worstFrameMs) this.#worstFrameMs = frameMs;
    this.#hostFrames += 1;
    this.#elapsed += deltaSeconds;
    if (this.#elapsed < SAMPLE_INTERVAL_S) return;

    let text = `HOST ${(this.#hostFrames / this.#elapsed).toFixed(1)} fps`;
    text += ` · MAX ${this.#worstFrameMs.toFixed(1)}ms`;
    const coreFrames = sample?.frameCount;
    if (coreFrames === undefined) {
      text += " · CORE n/a";
    } else {
      if (this.#lastCoreFrames !== undefined)
        text += ` · CORE ${((coreFrames - this.#lastCoreFrames) / this.#elapsed).toFixed(1)} fps`;
      this.#lastCoreFrames = coreFrames;
    }
    if (sample?.canvasWidth && sample.canvasHeight) text += ` · ${sample.canvasWidth}×${sample.canvasHeight}`;
    this.#element.textContent = text;
    this.#hostFrames = 0;
    this.#elapsed = 0;
    this.#worstFrameMs = 0;
  }

  dispose() {
    this.#element.remove();
  }
}
