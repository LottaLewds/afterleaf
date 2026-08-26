import type {BookRecord} from "~/game/bookFactory";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import type {InteractionScanner} from "~/game/interactionScanner";
import type {ShopBookLifecycle} from "~/game/shopBookLifecycle";
import type {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {MovablePropRecord} from "~/game/shopTypes";
import type {
  ShopTelevision,
  ShopTelevisionInteraction,
} from "~/game/ShopTelevision";

export type ShopTargetingControllerHost = {
  bookLifecycle: () => ShopBookLifecycle;
  bookTextures: () => BookTextureRuntime;
  booksById: () => ReadonlyMap<string, BookRecord>;
  currentArcadeCabinet: () => ShopArcadeCabinet | undefined;
  currentProp: () => MovablePropRecord | undefined;
  currentTelevision: () => ShopTelevision | undefined;
  currentTelevisionInteraction: () => ShopTelevisionInteraction | undefined;
  emitGameState: () => void;
  hoveredPublicationId: () => string | undefined;
  scanner: () => InteractionScanner;
  setArcadeCabinet: (cabinet: ShopArcadeCabinet | undefined) => void;
  setProp: (record: MovablePropRecord | undefined) => void;
  setTelevisionState: (
    targeted: boolean,
    interaction: ShopTelevisionInteraction | undefined,
    television: ShopTelevision | undefined,
  ) => void;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  resetTelevisionWheel: () => void;
};

/** Centralizes reticle target transitions and the visual state they trigger. */
export class ShopTargetingController {
  readonly #host: ShopTargetingControllerHost;

  constructor(host: ShopTargetingControllerHost) {
    this.#host = host;
  }

  setTelevisionTargeted(
    targeted: boolean,
    interaction?: ShopTelevisionInteraction,
    television?: ShopTelevision,
  ) {
    const host = this.#host;
    const nextTelevision = targeted ? television : undefined;
    const nextInteraction = targeted ? (interaction ?? "screen") : undefined;
    if (
      nextInteraction === host.currentTelevisionInteraction() &&
      nextTelevision === host.currentTelevision()
    )
      return;
    if (nextTelevision !== host.currentTelevision())
      host.resetTelevisionWheel();
    host.currentTelevision()?.setTargeted(undefined);
    host.setTelevisionState(
      nextInteraction !== undefined,
      nextInteraction,
      nextTelevision,
    );
    nextTelevision?.setTargeted(nextInteraction);
    host.emitGameState();
  }

  setArcadeTargeted(cabinet: ShopArcadeCabinet | undefined) {
    const host = this.#host;
    if (cabinet === host.currentArcadeCabinet()) return;
    host.currentArcadeCabinet()?.setTargeted(false);
    host.setArcadeCabinet(cabinet);
    cabinet?.setTargeted(true);
    host.emitGameState();
  }

  setTrashTargeted(targeted: boolean) {
    const host = this.#host;
    if (targeted === host.scanner().trashTargeted) return;
    host.scanner().trashTargeted = targeted;
    host.bookLifecycle().applyBookStates();
    host.emitGameState();
  }

  setPropTargeted(record: MovablePropRecord | undefined) {
    const host = this.#host;
    if (record === host.currentProp()) return;
    host.setProp(record);
    host.emitGameState();
  }

  setHoveredPublicationId(publicationId: string | undefined) {
    const host = this.#host;
    if (publicationId === undefined)
      host.scanner().shelfBrowsePublicationId = undefined;
    if (publicationId === host.hoveredPublicationId()) return;
    host.setHoveredPublicationId(publicationId);
    const record = publicationId
      ? host.booksById().get(publicationId)
      : undefined;
    if (record && publicationId !== undefined)
      host.bookTextures().ensureStandaloneBookTextures(publicationId, record);
    host.bookLifecycle().applyBookStates();
    host.emitGameState();
  }
}
