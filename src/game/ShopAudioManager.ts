import {AudioListener, AudioLoader, Matrix4, Object3D, PositionalAudio} from "three";
import {DEV} from "solid-js";

export type PositionalAudioOptions = {
  cone?: {innerAngle: number; outerAngle: number; outerGain: number};
  refDistance: number;
  rolloffFactor: number;
  volume: number;
};

export type PositionalMediaAudioHandle = {
  node: PositionalAudio;
  dispose: () => void;
  resume: () => Promise<void>;
};

export type PositionalStreamAudioHandle = {
  node: PositionalAudio;
  dispose: () => void;
};

export type PositionalSfxHandle = {
  node: PositionalAudio;
  dispose: () => void;
  play: (detune?: number) => void;
};

type AudioBus = "media" | "music" | "sfx";

class TransformAwarePositionalAudio extends PositionalAudio {
  readonly #lastPannerMatrixWorld = new Matrix4();
  #pannerTransformInitialized = false;

  override updateMatrixWorld(force?: boolean) {
    Object3D.prototype.updateMatrixWorld.call(this, force);
    if (this.hasPlaybackControl && !this.isPlaying) return;
    if (this.#pannerTransformInitialized && this.#lastPannerMatrixWorld.equals(this.matrixWorld)) return;
    this.#lastPannerMatrixWorld.copy(this.matrixWorld);
    this.#pannerTransformInitialized = true;
    super.updateMatrixWorld(false);
  }
}

export class ShopAudioManager {
  readonly listener = new AudioListener();
  readonly #buffers = new Map<string, Promise<AudioBuffer>>();
  readonly #loader = new AudioLoader();
  readonly #mediaGain = this.listener.context.createGain();
  readonly #musicGain = this.listener.context.createGain();
  readonly #sfxGain = this.listener.context.createGain();
  readonly #sources = new Set<PositionalAudio>();

  #disposed = false;

  constructor() {
    const listenerInput = this.listener.getInput();
    this.#mediaGain.connect(listenerInput);
    this.#musicGain.connect(listenerInput);
    this.#sfxGain.connect(listenerInput);
  }

  createPositionalMediaElement(
    mediaElement: HTMLMediaElement,
    options: PositionalAudioOptions,
  ): PositionalMediaAudioHandle {
    const node = this.#createPositionalAudio("media", options);
    node.setMediaElementSource(mediaElement);
    let disposed = false;
    return {
      node,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.#disposeSource(node);
      },
      resume: () => this.resume(),
    };
  }

  /**
   * Spatializes a live MediaStream (e.g. an emulator audio tap) from another
   * AudioContext. The stream feeds the positional node's gain, mirroring the
   * media-element path; loudness stays under the media bus.
   */
  createPositionalMediaStream(stream: MediaStream, options: PositionalAudioOptions): PositionalStreamAudioHandle {
    const node = this.#createPositionalAudio("media", options);
    // Mirror setMediaElementSource: the stream must feed the PANNER, not
    // node.gain - PositionalAudio's graph is source -> panner -> gain, so
    // wiring into gain bypasses spatialization entirely (flat stereo).
    // Stream sources also have no playback control; TransformAwarePositional-
    // Audio relies on that flag to keep updating the panner with world
    // transforms. The property is only typed readonly - three.js mutates it
    // in its own setMediaElementSource implementation.
    (node as {hasPlaybackControl: boolean}).hasPlaybackControl = false;
    const source = this.listener.context.createMediaStreamSource(stream);
    source.connect(node.getOutput());
    let disposed = false;
    return {
      node,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        try {
          source.disconnect();
        } catch (error) {
          if (DEV) console.warn("Afterleaf could not disconnect audio.", error);
        }
        this.#disposeSource(node);
      },
    };
  }

  createPositionalSfx(url: string, options: PositionalAudioOptions): PositionalSfxHandle {
    const node = this.#createPositionalAudio("sfx", options);
    let disposed = false;
    let pendingDetune: number | undefined;
    void this.#loadBuffer(url)
      .then((buffer) => {
        if (disposed || this.#disposed) return;
        node.setBuffer(buffer);
        if (pendingDetune === undefined) return;
        const detune = pendingDetune;
        pendingDetune = undefined;
        this.#playSfx(node, detune);
      })
      .catch((error: unknown) => {
        if (DEV && !disposed && !this.#disposed) console.warn(`Afterleaf could not load audio ${url}.`, error);
      });

    return {
      node,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        pendingDetune = undefined;
        this.#disposeSource(node);
      },
      play: (detune = 0) => {
        if (disposed || this.#disposed) return;
        void this.resume();
        if (!node.buffer) {
          pendingDetune = detune;
          return;
        }
        this.#playSfx(node, detune);
      },
    };
  }

  resume() {
    return this.listener.context.resume();
  }

  setMediaVolume(volume: number) {
    this.#setBusVolume(this.#mediaGain, volume);
  }

  setMusicVolume(volume: number) {
    this.#setBusVolume(this.#musicGain, volume);
  }

  setSfxVolume(volume: number) {
    this.#setBusVolume(this.#sfxGain, volume);
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const source of [...this.#sources]) this.#disposeSource(source);
    this.#buffers.clear();
    this.#mediaGain.disconnect();
    this.#musicGain.disconnect();
    this.#sfxGain.disconnect();
    this.listener.removeFromParent();
  }

  #createPositionalAudio(bus: AudioBus, options: PositionalAudioOptions) {
    const node = new TransformAwarePositionalAudio(this.listener);
    node.gain.disconnect(this.listener.getInput());
    node.gain.connect(this.#busGain(bus));
    node.setDistanceModel("inverse");
    node.setRefDistance(options.refDistance);
    node.setRolloffFactor(options.rolloffFactor);
    node.setVolume(options.volume);
    const cone = options.cone;
    if (cone) node.setDirectionalCone(cone.innerAngle, cone.outerAngle, cone.outerGain);
    this.#sources.add(node);
    return node;
  }

  #busGain(bus: AudioBus) {
    if (bus === "media") return this.#mediaGain;
    if (bus === "music") return this.#musicGain;
    return this.#sfxGain;
  }

  #disposeSource(node: PositionalAudio) {
    if (!this.#sources.delete(node)) return;
    if (node.hasPlaybackControl && node.isPlaying) node.stop();
    try {
      node.disconnect();
    } catch (error) {
      if (DEV) console.warn("Afterleaf could not disconnect audio.", error);
    }
    node.gain.disconnect();
    node.removeFromParent();
  }

  #loadBuffer(url: string) {
    const existing = this.#buffers.get(url);
    if (existing) return existing;
    const pending = this.#loader.loadAsync(url);
    this.#buffers.set(url, pending);
    void pending.catch(() => {
      if (this.#buffers.get(url) === pending) this.#buffers.delete(url);
    });
    return pending;
  }

  #playSfx(node: PositionalAudio, detune: number) {
    if (node.isPlaying) node.stop();
    node.setDetune(detune);
    node.play();
  }

  #setBusVolume(gain: GainNode, volume: number) {
    const clampedVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
    gain.gain.setValueAtTime(clampedVolume, this.listener.context.currentTime);
  }
}
