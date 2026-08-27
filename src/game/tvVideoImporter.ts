import type {ShopTelevision} from "~/game/ShopTelevision";
import type {TvVideo} from "~/tv/protocol";

/**
 * Scene services the TV video importer needs. `importTvVideo` performs the
 * actual server round-trip; the importer owns the busy/message UI state.
 */
export type TvVideoImporterHost = {
  abortSignal: AbortSignal;
  emitGameState: () => void;
  importTvVideo?: ((url: string, channelId: string, signal: AbortSignal) => Promise<TvVideo>) | undefined;
  isDisposed: () => boolean;
};

/** Owns the paste-a-URL-onto-a-TV flow and its transient status message. */
export class TvVideoImporter {
  #count = 0;
  #error: string | undefined;
  #message: string | undefined;
  #messageTimer: number | undefined;
  readonly #host: TvVideoImporterHost;

  constructor(host: TvVideoImporterHost) {
    this.#host = host;
  }

  get count(): number {
    return this.#count;
  }
  get error(): string | undefined {
    return this.#error;
  }
  get message(): string | undefined {
    return this.#message;
  }

  /** Clears any pending status message timer (used during disposal). */
  clearMessageTimer(): void {
    if (this.#messageTimer !== undefined) window.clearTimeout(this.#messageTimer);
    this.#messageTimer = undefined;
  }

  async import(
    television: ShopTelevision,
    url: string,
    channelId: string,
    channelLabel: string,
    selectImportedChannel = false,
  ) {
    const importVideo = this.#host.importTvVideo;
    if (!importVideo) return false;
    this.#count += 1;
    this.#error = undefined;
    this.#message = undefined;
    if (this.#messageTimer !== undefined) window.clearTimeout(this.#messageTimer);
    this.#messageTimer = undefined;
    this.#host.emitGameState();
    try {
      const video = await importVideo(url, channelId, this.#host.abortSignal);
      if (this.#host.isDisposed()) return false;
      if (selectImportedChannel) television.playImportedChannel(channelId, video, channelLabel);
      else television.playVideoIfChannelSelected(channelId, video, channelLabel);
      this.#message = `Added ${video.id} to ${channelLabel}`;
      this.#messageTimer = window.setTimeout(() => {
        this.#messageTimer = undefined;
        this.#message = undefined;
        if (!this.#host.isDisposed()) this.#host.emitGameState();
      }, 6_000);
      return true;
    } catch (error) {
      if (this.#host.abortSignal.aborted) return false;
      this.#error = error instanceof Error && error.message ? error.message : "Video URL could not be imported";
      return false;
    } finally {
      this.#count = Math.max(0, this.#count - 1);
      if (!this.#host.isDisposed()) this.#host.emitGameState();
    }
  }
}
