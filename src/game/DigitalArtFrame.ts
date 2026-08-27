import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
  Vector4,
  type Texture,
} from "three";
import {DEV} from "solid-js";

import {getArtFrameImageMapping, type ArtFrameFit} from "~/artFrames/aspect";
import type {ArtFrameChannel, ArtFrameImage} from "~/artFrames/protocol";
import {ART_FRAME_CROSSFADE_SECONDS, artFrameCrossfadeOpacity} from "~/artFrames/transition";

const FRAME_BORDER = 0.045;
const FRAME_DEPTH = 0.055;
const SCREEN_OFFSET = 0.031;
const PRELOAD_AFTER_TRANSITION_DELAY_SECONDS = 0.75;

export type DigitalArtFrameOptions = {
  aspectRatio: number;
  channelId: string;
  channels: readonly ArtFrameChannel[];
  fit: ArtFrameFit;
  imageId?: string;
  intervalSeconds: number;
  loadTexture: (image: ArtFrameImage, priority: "display" | "preload") => Promise<Texture>;
  onImageChange?: () => void;
  releaseTexture: (imageId: string) => void;
};

type DigitalArtFrameDisplay = {
  brightness: {value: number};
  currentContentScale: {value: Vector2};
  currentSourceRect: {value: Vector4};
  incomingContentScale: {value: Vector2};
  incomingMap: {value: Texture | null};
  incomingSourceRect: {value: Vector4};
  material: MeshBasicMaterial;
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  transitionProgress: {value: number};
};

type DigitalArtFrameTransition = {
  elapsedSeconds: number;
  image: ArtFrameImage;
  texture: Texture;
};

type PreloadedArtFrameImage = {
  image: ArtFrameImage;
  texture: Promise<Texture>;
};

export class DigitalArtFrame {
  readonly object = new Group();
  readonly target: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #aspectRatio: number;
  readonly #display: DigitalArtFrameDisplay;
  readonly #loadTexture: DigitalArtFrameOptions["loadTexture"];
  readonly #onImageChange: (() => void) | undefined;
  readonly #releaseTexture: DigitalArtFrameOptions["releaseTexture"];
  #channelId: string;
  #channels: readonly ArtFrameChannel[];
  #currentImage: ArtFrameImage | undefined;
  #displayImage: ArtFrameImage | undefined;
  #disposed = false;
  #fit: ArtFrameFit;
  #intervalSeconds: number;
  #preloadDelaySeconds = 0;
  #remainingSeconds: number;
  #preloadedImage: PreloadedArtFrameImage | undefined;
  #revision = 0;
  #shuffleBag: string[] = [];
  #transition: DigitalArtFrameTransition | undefined;

  constructor(options: DigitalArtFrameOptions) {
    this.#aspectRatio = options.aspectRatio;
    this.#channelId = options.channelId;
    this.#channels = options.channels;
    this.#fit = options.fit;
    this.#intervalSeconds = options.intervalSeconds;
    this.#remainingSeconds = options.intervalSeconds;
    this.#loadTexture = options.loadTexture;
    this.#onImageChange = options.onImageChange;
    this.#releaseTexture = options.releaseTexture;

    this.object.name = "digital-art-frame";
    const backing = new Mesh(
      new BoxGeometry(this.#aspectRatio + FRAME_BORDER * 2, 1 + FRAME_BORDER * 2, FRAME_DEPTH),
      new MeshStandardMaterial({
        color: "#171918",
        metalness: 0.72,
        roughness: 0.28,
      }),
    );
    backing.castShadow = true;
    backing.receiveShadow = true;
    this.object.add(backing);

    this.#display = this.#createDisplay();
    this.object.add(this.#display.mesh);

    this.target = new Mesh(
      new PlaneGeometry(this.#aspectRatio + FRAME_BORDER * 2, 1 + FRAME_BORDER * 2),
      new MeshBasicMaterial({colorWrite: false, depthWrite: false}),
    );
    this.target.name = "digital-art-frame-target";
    this.target.position.z = SCREEN_OFFSET + 0.002;
    this.object.add(this.target);

    const initialImage = this.#findImage(options.imageId) ?? this.#channel()?.images[0];
    if (initialImage) void this.#showImage(initialImage, false);
  }

  aspectRatio() {
    return this.#aspectRatio;
  }

  channelId() {
    return this.#channelId;
  }

  channelLabel() {
    return this.#channel()?.label ?? this.#channelId;
  }

  currentImageId() {
    return this.#currentImage?.id;
  }

  fit() {
    return this.#fit;
  }

  intervalSeconds() {
    return this.#intervalSeconds;
  }

  setTargeted(targeted: boolean) {
    this.#display.brightness.value = targeted ? 1.12 : 1;
  }

  setFit(fit: ArtFrameFit) {
    if (fit === this.#fit) return;
    this.#fit = fit;
    this.#updateMappings();
  }

  setIntervalSeconds(intervalSeconds: number) {
    this.#intervalSeconds = intervalSeconds;
    this.#remainingSeconds = intervalSeconds;
  }

  setChannels(channels: readonly ArtFrameChannel[]) {
    this.#releasePreloadedImage();
    this.#channels = channels;
    this.#shuffleBag = [];
    const channel = this.#channel();
    if (!channel) return;
    const currentImage = this.#currentImage
      ? channel.images.find((image) => image.id === this.#currentImage?.id)
      : undefined;
    if (currentImage) {
      this.#currentImage = currentImage;
      if (this.#displayImage?.id === currentImage.id) this.#displayImage = currentImage;
      if (this.#transition?.image.id === currentImage.id) this.#transition.image = currentImage;
      this.#updateMappings();
      this.#preloadNextImage();
      return;
    }
    const image = channel.images[0];
    if (image) void this.#showImage(image, true);
  }

  changeChannel(direction: -1 | 1) {
    if (this.#channels.length <= 1) return;
    const channelIndex = this.#channels.findIndex((channel) => channel.id === this.#channelId);
    const nextIndex =
      ((channelIndex >= 0 ? channelIndex : -1) + direction + this.#channels.length) % this.#channels.length;
    const channel = this.#channels[nextIndex];
    const image = channel?.images[0];
    if (!channel || !image) return;
    this.setChannel(channel.id, image.id);
  }

  setChannel(channelId: string, imageId?: string) {
    const channel = this.#channels.find((candidate) => candidate.id === channelId);
    const image = channel?.images.find((candidate) => candidate.id === imageId) ?? channel?.images[0];
    if (!channel || !image) return false;
    this.#releasePreloadedImage();
    this.#channelId = channel.id;
    this.#shuffleBag = [];
    this.#remainingSeconds = this.#intervalSeconds;
    void this.#showImage(image, true);
    return true;
  }

  skip() {
    const image = this.#preloadedImage?.image ?? this.#takeShuffledImage();
    if (image?.id === this.#currentImage?.id) return;
    if (image) void this.#showImage(image, true);
    this.#remainingSeconds = this.#intervalSeconds;
  }

  update(deltaSeconds: number) {
    this.#updateTransition(deltaSeconds);
    this.#updatePreload(deltaSeconds);
    if (this.#intervalSeconds <= 0 || !this.#currentImage) return;
    this.#remainingSeconds -= deltaSeconds;
    if (this.#remainingSeconds > 0) return;
    this.skip();
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#revision += 1;
    this.#releasePreloadedImage();
    if (this.#displayImage) this.#releaseTexture(this.#displayImage.id);
    if (this.#transition) this.#releaseTexture(this.#transition.image.id);
    this.#displayImage = undefined;
    this.#transition = undefined;
    this.object.removeFromParent();
    this.object.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }

  #channel() {
    return this.#channels.find((channel) => channel.id === this.#channelId);
  }

  #findImage(imageId?: string) {
    if (!imageId) return;
    return this.#channel()?.images.find((image) => image.id === imageId);
  }

  #takeShuffledImage() {
    const images = this.#channel()?.images ?? [];
    if (images.length === 0) return;
    if (images.length === 1) return images[0];
    if (this.#shuffleBag.length === 0) {
      this.#shuffleBag = images.filter((image) => image.id !== this.#currentImage?.id).map((image) => image.id);
      for (let index = this.#shuffleBag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        const value = this.#shuffleBag[index];
        const swapValue = this.#shuffleBag[swapIndex];
        if (value === undefined || swapValue === undefined) continue;
        this.#shuffleBag[index] = swapValue;
        this.#shuffleBag[swapIndex] = value;
      }
    }
    const imageId = this.#shuffleBag.pop();
    return images.find((image) => image.id === imageId) ?? images[0];
  }

  #applyLoadedImage(image: ArtFrameImage, loadedTexture: Texture, notify: boolean) {
    if (this.#currentImage?.id === image.id && !this.#transition) {
      this.#releaseTexture(image.id);
      this.#currentImage = image;
      this.#displayImage = image;
      this.#updateMappings();
      this.#preloadNextImage();
      return;
    }
    this.#finishTransition();
    this.#currentImage = image;
    if (this.#displayImage) {
      this.#transition = {elapsedSeconds: 0, image, texture: loadedTexture};
      this.#display.incomingMap.value = loadedTexture;
      this.#display.transitionProgress.value = 0;
      this.#updateMappings();
    } else {
      this.#displayImage = image;
      this.#display.material.map = loadedTexture;
      this.#display.incomingMap.value = loadedTexture;
      this.#display.material.needsUpdate = true;
      this.#display.mesh.visible = true;
      this.#updateMappings();
    }
    if (notify) this.#onImageChange?.();
    if (!this.#transition) this.#preloadNextImage();
  }

  async #showImage(image: ArtFrameImage, notify: boolean) {
    const revision = (this.#revision += 1);
    const preloadedImage = this.#preloadedImage?.image.id === image.id ? this.#preloadedImage : undefined;
    const texture = this.#loadTexture(image, "display");
    if (preloadedImage) {
      this.#preloadedImage = undefined;
      this.#releaseTexture(image.id);
    } else this.#releasePreloadedImage();
    let ownsTexture = true;
    try {
      const loadedTexture = await texture;
      if (this.#disposed || revision !== this.#revision) {
        this.#releaseTexture(image.id);
        ownsTexture = false;
        return;
      }
      ownsTexture = false;
      this.#applyLoadedImage(image, loadedTexture, notify);
    } catch (error) {
      if (ownsTexture) this.#releaseTexture(image.id);
      if (DEV) console.warn(`Afterleaf could not load art frame image ${image.id}.`, error);
    }
  }

  #createDisplay(): DigitalArtFrameDisplay {
    const brightness = {value: 1};
    const currentContentScale = {value: new Vector2(1, 1)};
    const currentSourceRect = {value: new Vector4(0, 0, 1, 1)};
    const incomingContentScale = {value: new Vector2(1, 1)};
    const incomingMap = {value: null as Texture | null};
    const incomingSourceRect = {value: new Vector4(0, 0, 1, 1)};
    const transitionProgress = {value: 0};
    const material = new MeshBasicMaterial({color: "#ffffff"});
    material.onBeforeCompile = (shader) => {
      shader.uniforms.afterleafBrightness = brightness;
      shader.uniforms.afterleafCurrentContentScale = currentContentScale;
      shader.uniforms.afterleafCurrentSourceRect = currentSourceRect;
      shader.uniforms.afterleafIncomingContentScale = incomingContentScale;
      shader.uniforms.afterleafIncomingMap = incomingMap;
      shader.uniforms.afterleafIncomingSourceRect = incomingSourceRect;
      shader.uniforms.afterleafTransitionProgress = transitionProgress;
      shader.fragmentShader = `uniform float afterleafBrightness;
uniform vec2 afterleafCurrentContentScale;
uniform vec4 afterleafCurrentSourceRect;
uniform vec2 afterleafIncomingContentScale;
uniform sampler2D afterleafIncomingMap;
uniform vec4 afterleafIncomingSourceRect;
uniform float afterleafTransitionProgress;

vec4 afterleafSampleImage(
  sampler2D imageMap,
  vec2 imageUv,
  vec2 contentScale,
  vec4 sourceRect
) {
  vec2 centeredUv = imageUv - 0.5;
  vec2 fittedUv = centeredUv / contentScale + 0.5;
  vec2 sourceUv = mix(
    sourceRect.xy,
    sourceRect.zw,
    clamp(fittedUv, 0.0, 1.0)
  );
  float insideImage =
    step(abs(centeredUv.x), contentScale.x * 0.5) *
    step(abs(centeredUv.y), contentScale.y * 0.5);
  return mix(
    vec4(0.0, 0.0, 0.0, 1.0),
    texture2D(imageMap, sourceUv),
    insideImage
  );
}
${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
        vec4 sampledDiffuseColor = mix(
          afterleafSampleImage(
            map,
            vMapUv,
            afterleafCurrentContentScale,
            afterleafCurrentSourceRect
          ),
          afterleafSampleImage(
            afterleafIncomingMap,
            vMapUv,
            afterleafIncomingContentScale,
            afterleafIncomingSourceRect
          ),
          afterleafTransitionProgress
        );
        diffuseColor *= sampledDiffuseColor;
        diffuseColor.rgb *= afterleafBrightness;
        #endif`,
      );
    };
    material.customProgramCacheKey = () => "afterleaf-digital-art-frame-v3";
    const mesh = new Mesh(new PlaneGeometry(this.#aspectRatio, 1), material);
    mesh.name = "digital-art-frame-display";
    mesh.position.z = SCREEN_OFFSET;
    mesh.visible = false;
    return {
      brightness,
      currentContentScale,
      currentSourceRect,
      incomingContentScale,
      incomingMap,
      incomingSourceRect,
      material,
      mesh,
      transitionProgress,
    };
  }

  #updateTransition(deltaSeconds: number) {
    const transition = this.#transition;
    if (!transition) return;
    transition.elapsedSeconds += deltaSeconds;
    this.#display.transitionProgress.value = artFrameCrossfadeOpacity(transition.elapsedSeconds);
    if (transition.elapsedSeconds < ART_FRAME_CROSSFADE_SECONDS) return;
    this.#finishTransition(true);
  }

  #finishTransition(preloadNext = false) {
    const transition = this.#transition;
    if (!transition) return;
    if (this.#displayImage) this.#releaseTexture(this.#displayImage.id);
    this.#displayImage = transition.image;
    this.#display.material.map = transition.texture;
    this.#display.incomingMap.value = transition.texture;
    this.#display.currentContentScale.value.copy(this.#display.incomingContentScale.value);
    this.#display.currentSourceRect.value.copy(this.#display.incomingSourceRect.value);
    this.#display.transitionProgress.value = 0;
    this.#transition = undefined;
    if (preloadNext) this.#preloadDelaySeconds = PRELOAD_AFTER_TRANSITION_DELAY_SECONDS;
  }

  #updatePreload(deltaSeconds: number) {
    if (this.#preloadDelaySeconds <= 0) return;
    this.#preloadDelaySeconds -= deltaSeconds;
    if (this.#preloadDelaySeconds > 0) return;
    this.#preloadDelaySeconds = 0;
    if (!this.#disposed && !this.#transition) this.#preloadNextImage();
  }

  #preloadNextImage() {
    this.#preloadDelaySeconds = 0;
    this.#releasePreloadedImage();
    const image = this.#takeShuffledImage();
    if (!image || image.id === this.#currentImage?.id) return;
    const texture = this.#loadTexture(image, "preload");
    this.#preloadedImage = {image, texture};
    void texture.catch(() => {});
  }

  #releasePreloadedImage() {
    const preloadedImage = this.#preloadedImage;
    if (!preloadedImage) return;
    this.#preloadedImage = undefined;
    this.#releaseTexture(preloadedImage.image.id);
  }

  #updateMappings() {
    if (this.#displayImage)
      this.#updateMapping(
        this.#displayImage,
        this.#display.currentContentScale.value,
        this.#display.currentSourceRect.value,
      );
    if (this.#transition)
      this.#updateMapping(
        this.#transition.image,
        this.#display.incomingContentScale.value,
        this.#display.incomingSourceRect.value,
      );
  }

  #updateMapping(image: ArtFrameImage, contentScale: Vector2, sourceRect: Vector4) {
    const mapping = getArtFrameImageMapping(image.aspectRatio, this.#aspectRatio, this.#fit);
    contentScale.set(mapping.contentScaleX, mapping.contentScaleY);
    sourceRect.set(mapping.sourceMinimumX, mapping.sourceMinimumY, mapping.sourceMaximumX, mapping.sourceMaximumY);
  }
}
