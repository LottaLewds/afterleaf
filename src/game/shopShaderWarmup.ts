import {BoxGeometry, Color, Mesh, PerspectiveCamera, Scene, WebGLRenderer} from "three";
import {DEV} from "solid-js";

import {createBookExteriorMaterial} from "~/game/bookExteriorMaterial";
import type {ShopTelevision} from "~/game/ShopTelevision";

const LATE_SHADER_PRECOMPILE_DELAY_MS = 4_000;

export type ShopShaderWarmupHost = {
  camera: PerspectiveCamera;
  disposed: () => boolean;
  renderer: WebGLRenderer;
  scene: Scene;
  televisions: () => readonly ShopTelevision[];
  tvScreenLighting: () => boolean;
};

/** Compiles the persistent scene's material variants without owning the renderer. */
export class ShopShaderWarmup {
  readonly #host: ShopShaderWarmupHost;
  #lateHandle: number | undefined;

  constructor(host: ShopShaderWarmupHost) {
    this.#host = host;
  }

  async warm() {
    const host = this.#host;
    if (host.disposed()) return;
    // The atlas-batch book material uses its own program cache key and no
    // batch mesh exists until textures stream in after ready, so warm its
    // variant here with a stand-in mesh covering all batch groups.
    const batchMaterialStandIn = new Mesh(
      new BoxGeometry(0.01, 0.01, 0.01),
      createBookExteriorMaterial(new Color("#ffffff"), -1, true, true).material,
    );
    host.scene.add(batchMaterialStandIn);
    try {
      await host.renderer.compileAsync(host.scene, host.camera);
      // Warm the rect-area-light variant set with exactly ONE television's
      // four wash lights: forcing every television would multiply the light
      // count into every program and stall the machine during compilation.
      // Multi-TV combinations stay lazy (rare, incremental).
      const sampleTelevision = host.tvScreenLighting() ? host.televisions()[0] : undefined;
      if (sampleTelevision) {
        sampleTelevision.setScreenLightsForcedVisible(true);
        await host.renderer.compileAsync(host.scene, host.camera);
        sampleTelevision.setScreenLightsForcedVisible(false);
      }
    } catch (error: unknown) {
      // Lazy compilation still works; precompilation is best-effort.
      if (DEV) console.warn("Afterleaf could not precompile shader programs.", error);
    } finally {
      host.scene.remove(batchMaterialStandIn);
      batchMaterialStandIn.geometry.dispose();
      batchMaterialStandIn.material.dispose();
    }
  }

  precompile() {
    const host = this.#host;
    if (host.disposed()) return;
    void host.renderer.compileAsync(host.scene, host.camera).catch(() => {});
    if (this.#lateHandle !== undefined) return;
    this.#lateHandle = window.setTimeout(() => {
      this.#lateHandle = undefined;
      if (host.disposed()) return;
      void this.warm();
    }, LATE_SHADER_PRECOMPILE_DELAY_MS);
  }

  dispose() {
    if (this.#lateHandle === undefined) return;
    window.clearTimeout(this.#lateHandle);
    this.#lateHandle = undefined;
  }
}
