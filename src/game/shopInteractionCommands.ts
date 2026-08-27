import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookCarryActions} from "~/game/bookCarryActions";
import type {BookRecord} from "~/game/bookFactory";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import type {InspectionController} from "~/game/inspection/InspectionController";
import type {InteractionScanner} from "~/game/interactionScanner";
import type {MovablePropLifecycle} from "~/game/movablePropSystem";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {ShopTelevision, ShopTelevisionInteraction} from "~/game/ShopTelevision";
import type {MovablePropRecord} from "~/game/shopTypes";

export type ShopInteractionCommandsHost = {
  artFrames: () => ArtFrameSystem;
  bookActions: () => BookCarryActions;
  bookTextures: () => BookTextureRuntime;
  booksById: () => ReadonlyMap<string, BookRecord>;
  carriedPublicationId: () => string | undefined;
  carriedPublicationIds: () => string[];
  emitGameState: () => void;
  hoveredPublicationId: () => string | undefined;
  inspection: () => InspectionController;
  posters: () => PosterSystem;
  props: () => MovablePropLifecycle;
  scanner: () => InteractionScanner;
  setCarriedPublicationId: (publicationId: string | undefined) => void;
  signs: () => ShopSignSystem;
  syncCarriedBookPresentation: () => void;
  targetedArcadeCabinet: () => ShopArcadeCabinet | undefined;
  targetedProp: () => MovablePropRecord | undefined;
  targetedTelevision: () => ShopTelevision | undefined;
  televisionInteraction: () => ShopTelevisionInteraction | undefined;
  televisionTargeted: () => boolean;
  updateHeldPhysicsTarget: () => void;
};

export type ShopInteractionCommands = {
  cycleCarriedBook: (direction: number) => boolean;
  interact: (allowNonBookPropPickup?: boolean) => void;
};

const canCycleCarriedBook = (host: ShopInteractionCommandsHost, direction: number) =>
  direction !== 0 &&
  !host.bookActions().discardBusy &&
  !host.bookActions().throwChargeActive &&
  host.inspection().inspectionMode === "none" &&
  host.carriedPublicationIds().length >= 2;

/** Routes player interaction to the already-owned book, prop, and media systems. */
export const createShopInteractionCommands = (commandHost: ShopInteractionCommandsHost): ShopInteractionCommands => {
  const cycleCarriedBook = (direction: number) => {
    const host = commandHost;
    if (!canCycleCarriedBook(host, direction)) return false;
    if (direction > 0) {
      const front = host.carriedPublicationIds().shift();
      if (front) host.carriedPublicationIds().push(front);
    } else {
      const back = host.carriedPublicationIds().pop();
      if (back) host.carriedPublicationIds().unshift(back);
    }
    const carriedPublicationId = host.carriedPublicationIds()[0];
    host.setCarriedPublicationId(carriedPublicationId);
    const record = carriedPublicationId ? host.booksById().get(carriedPublicationId) : undefined;
    if (record && carriedPublicationId) host.bookTextures().promoteBookCoverTexture(carriedPublicationId, record);
    host.syncCarriedBookPresentation();
    host.updateHeldPhysicsTarget();
    host.scanner().update();
    host.emitGameState();
    return true;
  };

  const interactPlacement = (): boolean => {
    const host = commandHost;
    if (host.artFrames().placement) {
      host.artFrames().placeDigitalArtFrame();
      return true;
    }
    if (host.posters().placement) {
      host.posters().placePoster();
      return true;
    }
    if (host.props().carriedProp) {
      host.props().dropCarriedProp();
      return true;
    }
    return false;
  };

  const interactCarriedBook = (): boolean => {
    const host = commandHost;
    if (!host.carriedPublicationId()) return false;
    const hoveredPublicationId = host.hoveredPublicationId();
    if (hoveredPublicationId) host.bookActions().pickUpBook(hoveredPublicationId);
    else if (host.scanner().trashTargeted) void host.bookActions().discardCarriedBook();
    else if (host.scanner().shelfTargeted) host.bookActions().shelveCarriedBook();
    return true;
  };

  const interactTelevision = (allowNonBookPropPickup: boolean): boolean => {
    const host = commandHost;
    if (!host.televisionTargeted()) return false;
    const targetedTelevision = host.targetedTelevision();
    const televisionProp = targetedTelevision ? host.props().televisionProps.get(targetedTelevision) : undefined;
    if (host.televisionInteraction() === "body" && televisionProp) {
      if (allowNonBookPropPickup) host.props().pickUpProp(televisionProp);
      return true;
    }
    targetedTelevision?.interactTargeted();
    return true;
  };

  const interactTargetedProp = (allowNonBookPropPickup: boolean): boolean => {
    const host = commandHost;
    const targetedProp = host.targetedProp();
    if (!targetedProp) return false;
    if (allowNonBookPropPickup) host.props().pickUpProp(targetedProp);
    return true;
  };

  const interactDigitalArtFrame = (): boolean => {
    const host = commandHost;
    const targetedArtFrameId = host.artFrames().targetedId;
    if (!targetedArtFrameId) return false;
    const record = host.artFrames().records.get(targetedArtFrameId);
    const imageId =
      record?.frame.currentImageId() ??
      host.artFrames().channels.find((channel) => channel.id === record?.frame.channelId())?.images[0]?.id;
    const assetIndex = imageId ? host.artFrames().assets.findIndex((asset) => asset.id === imageId) : -1;
    if (record && assetIndex >= 0)
      host
        .artFrames()
        .startDigitalArtFramePlacement(
          assetIndex,
          record.id,
          record.height,
          record.rotation,
          record.frame.aspectRatio(),
          record.frame.fit(),
          record.frame.intervalSeconds(),
        );
    return true;
  };

  const interactPoster = (): boolean => {
    const host = commandHost;
    const targetedPosterId = host.posters().targetedId;
    if (!targetedPosterId) return false;
    const record = host.posters().records.get(targetedPosterId);
    const assetIndex = record ? host.posters().assets.findIndex((asset) => asset.id === record.asset.id) : -1;
    if (record && assetIndex >= 0)
      void host.posters().startPosterPlacement(assetIndex, record.id, record.height, record.rotation);
    return true;
  };

  const interactSpecialTarget = (allowNonBookPropPickup: boolean): boolean => {
    const host = commandHost;
    const targetedArcadeCabinet = host.targetedArcadeCabinet();
    if (targetedArcadeCabinet) {
      targetedArcadeCabinet.interact();
      return true;
    }
    if (interactTelevision(allowNonBookPropPickup)) return true;
    if (interactTargetedProp(allowNonBookPropPickup)) return true;
    if (host.signs().targetedKey !== undefined) {
      host.signs().requestEdit();
      return true;
    }
    if (interactDigitalArtFrame()) return true;
    return interactPoster();
  };

  const interact = (allowNonBookPropPickup = true) => {
    const host = commandHost;
    if (host.bookActions().discardBusy || host.bookActions().shelveAnimation) return;
    if (interactPlacement() || interactCarriedBook()) return;
    if (interactSpecialTarget(allowNonBookPropPickup)) return;
    const hoveredPublicationId = host.hoveredPublicationId();
    if (hoveredPublicationId) host.bookActions().pickUpBook(hoveredPublicationId);
  };

  return {cycleCarriedBook, interact};
};
