import type {BookRecord} from "~/game/bookFactory";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import type {InteractionScanner} from "~/game/interactionScanner";
import type {ShopBookLifecycle} from "~/game/shopBookLifecycle";
import type {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {MovablePropRecord} from "~/game/shopTypes";
import type {ShopTelevision, ShopTelevisionInteraction} from "~/game/ShopTelevision";

export type ShopTargetStateHost = {
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

export type ShopTargetState = {
  setArcadeTargeted: (cabinet: ShopArcadeCabinet | undefined) => void;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  setPropTargeted: (record: MovablePropRecord | undefined) => void;
  setTelevisionTargeted: (
    targeted: boolean,
    interaction?: ShopTelevisionInteraction,
    television?: ShopTelevision,
  ) => void;
  setTrashTargeted: (targeted: boolean) => void;
};

/** Centralizes reticle target transitions and the visual state they trigger. */
export const createShopTargetState = (targetHost: ShopTargetStateHost): ShopTargetState => {
  const setTelevisionTargeted = (
    targeted: boolean,
    interaction?: ShopTelevisionInteraction,
    television?: ShopTelevision,
  ) => {
    const host = targetHost;
    const nextTelevision = targeted ? television : undefined;
    const nextInteraction = targeted ? (interaction ?? "screen") : undefined;
    if (nextInteraction === host.currentTelevisionInteraction() && nextTelevision === host.currentTelevision()) return;
    if (nextTelevision !== host.currentTelevision()) host.resetTelevisionWheel();
    host.currentTelevision()?.setTargeted(undefined);
    host.setTelevisionState(nextInteraction !== undefined, nextInteraction, nextTelevision);
    nextTelevision?.setTargeted(nextInteraction);
    host.emitGameState();
  };

  const setArcadeTargeted = (cabinet: ShopArcadeCabinet | undefined) => {
    const host = targetHost;
    if (cabinet === host.currentArcadeCabinet()) return;
    host.currentArcadeCabinet()?.setTargeted(false);
    host.setArcadeCabinet(cabinet);
    cabinet?.setTargeted(true);
    host.emitGameState();
  };

  const setTrashTargeted = (targeted: boolean) => {
    const host = targetHost;
    if (targeted === host.scanner().trashTargeted) return;
    host.scanner().trashTargeted = targeted;
    host.bookLifecycle().applyBookStates();
    host.emitGameState();
  };

  const setPropTargeted = (record: MovablePropRecord | undefined) => {
    const host = targetHost;
    if (record === host.currentProp()) return;
    host.setProp(record);
    host.emitGameState();
  };

  const setHoveredPublicationId = (publicationId: string | undefined) => {
    const host = targetHost;
    if (publicationId === undefined) host.scanner().shelfBrowsePublicationId = undefined;
    if (publicationId === host.hoveredPublicationId()) return;
    host.setHoveredPublicationId(publicationId);
    const record = publicationId ? host.booksById().get(publicationId) : undefined;
    if (record && publicationId !== undefined) host.bookTextures().ensureStandaloneBookTextures(publicationId, record);
    host.bookLifecycle().applyBookStates();
    host.emitGameState();
  };

  return {
    setArcadeTargeted,
    setHoveredPublicationId,
    setPropTargeted,
    setTelevisionTargeted,
    setTrashTargeted,
  };
};
