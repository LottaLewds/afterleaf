import {DEV} from "solid-js";

import type {ArtFrameImage} from "~/artFrames/protocol";
import type {ArtFrameSystem, DigitalArtFramePasteTarget} from "~/game/artFrameSystem";
import type {MovablePropLifecycle} from "~/game/movablePropSystem";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopTelevision} from "~/game/ShopTelevision";
import type {ShopMediaCatalog} from "~/game/shopMediaCatalog";
import type {PosterAsset} from "~/posters/protocol";
import {DEFAULT_TV_CHANNEL_ID, type TvChannel, tvVideoImportUrl} from "~/tv/protocol";
import type {TvVideoImporter} from "~/game/tvVideoImporter";

export type ShopMediaControllerHost = {
  abortSignal: AbortSignal;
  artFrames: () => ArtFrameSystem;
  disposed: () => boolean;
  emitGameState: () => void;
  importArtFrameImage: ((image: Blob, channelId: string, signal: AbortSignal) => Promise<ArtFrameImage>) | undefined;
  importPoster: ((image: Blob, signal: AbortSignal) => Promise<PosterAsset>) | undefined;
  loadMediaCatalog: (signal: AbortSignal) => Promise<ShopMediaCatalog>;
  onTextPaste: ((text: string) => boolean | Promise<boolean>) | undefined;
  paused: () => boolean;
  posters: () => PosterSystem;
  props: () => MovablePropLifecycle;
  targetedTelevision: () => ShopTelevision | undefined;
  televisionTargeted: () => boolean;
  televisions: () => readonly ShopTelevision[];
  tvVideos: () => TvVideoImporter;
};

/** Coordinates the media catalog and clipboard fallbacks without owning media systems. */
export class ShopMediaController {
  readonly #host: ShopMediaControllerHost;
  #mediaCatalogRequestPending = false;
  #tvChannels: readonly TvChannel[] = [];

  constructor(host: ShopMediaControllerHost) {
    this.#host = host;
  }

  tvChannels() {
    return this.#tvChannels;
  }

  readonly refreshIfActive = () => {
    const host = this.#host;
    if (document.visibilityState !== "visible" || !document.hasFocus() || host.disposed()) return;
    void this.refresh();
  };

  async refresh() {
    const host = this.#host;
    if (this.#mediaCatalogRequestPending || host.disposed()) return;
    this.#mediaCatalogRequestPending = true;
    try {
      const catalog = await host.loadMediaCatalog(host.abortSignal);
      if (host.disposed()) return;
      host.props().applyModelCatalog(catalog.models.models);
      await host.props().restoreSavedModelProps();
      host.posters().applyPosterCatalog(catalog.posters.posters);
      if (!host.posters().saveRestoreCompleted) await host.posters().restoreSavedPosters(catalog.posters.posters);
      host.artFrames().applyArtFrameCatalog(catalog.artFrames.channels);
      if (!host.artFrames().saveRestoreCompleted)
        await host.artFrames().restoreSavedDigitalArtFrames(catalog.artFrames.channels);
      this.#tvChannels = catalog.tv.channels;
      for (const television of host.televisions()) television.setChannels(catalog.tv.channels);
      host.emitGameState();
    } catch (error) {
      for (const television of host.televisions()) television.setChannelLoadError(error);
      if (DEV && !host.abortSignal.aborted) console.warn("Afterleaf could not load the shop media catalog.", error);
    } finally {
      this.#mediaCatalogRequestPending = false;
    }
  }

  readonly handleImagePaste = (event: ClipboardEvent) => {
    const host = this.#host;
    if (host.paused()) return;
    const artFrameTarget = host.artFrames().digitalArtFramePasteTarget();
    const imageItem = Array.from(event.clipboardData?.items ?? []).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const image = imageItem?.getAsFile();
    if (this.#tryHandlePastedImage(event, image, artFrameTarget)) return;
    this.#handleClipboardText(event);
  };

  #tryHandlePastedImage(
    event: ClipboardEvent,
    image: File | null | undefined,
    artFrameTarget: DigitalArtFramePasteTarget | undefined,
  ) {
    if (!image) return false;
    return this.#handlePastedImage(event, image, artFrameTarget);
  }

  #handleClipboardText(event: ClipboardEvent) {
    const clipboardText = event.clipboardData?.getData("text/plain") || event.clipboardData?.getData("text/uri-list");
    if (!clipboardText) return;
    const host = this.#host;
    const television = host.televisionTargeted() ? host.targetedTelevision() : undefined;
    const channelId = television?.selectedChannelId();
    event.preventDefault();
    void this.#handlePastedText(
      clipboardText,
      television,
      channelId ?? (television ? DEFAULT_TV_CHANNEL_ID : undefined),
      television?.selectedChannelLabel() ?? channelId ?? (television ? "Afterleaf TV" : undefined),
    );
  }

  #handlePastedImage(event: ClipboardEvent, image: File, artFrameTarget: DigitalArtFramePasteTarget | undefined) {
    const host = this.#host;
    if (artFrameTarget && host.importArtFrameImage) {
      event.preventDefault();
      void host.artFrames().importPastedArtFrameImage(image, artFrameTarget);
      return true;
    }
    if (host.posters().placement && host.importPoster) {
      event.preventDefault();
      void host.posters().importPastedPoster(image);
      return true;
    }
    return false;
  }

  async #handlePastedText(
    text: string,
    television: ShopTelevision | undefined,
    channelId: string | undefined,
    channelLabel: string | undefined,
  ) {
    let handled = false;
    try {
      handled = (await this.#host.onTextPaste?.(text)) === true;
    } catch {
      // A provider resolver must not prevent the existing TV paste fallback.
    }
    if (handled) return;
    const url = tvVideoImportUrl(text);
    if (!television || !channelId || !channelLabel || !url) return;
    await this.#host.tvVideos().import(television, url, channelId, channelLabel);
  }
}
