import type {CatalogItem} from "~/catalog";
import type {BookRecord} from "~/game/bookFactory";
import type {BookCarryActions} from "~/game/bookCarryActions";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import type {ShopBookLifecycle} from "~/game/shopBookLifecycle";

export type ShopCatalogSyncHost = {
  catalogAvailable: () => boolean;
  catalogItems: () => readonly CatalogItem[];
  newPublicationIds: () => readonly string[];
  observedArrivalIds: Set<string>;
  selectedPublicationId: () => string | null | undefined;
  lastSelectedPublicationId: () => string | null | undefined;
  setLastSelectedPublicationId: (
    publicationId: string | null | undefined,
  ) => void;
  booksById: () => ReadonlyMap<string, BookRecord>;
  bookActions: () => BookCarryActions;
  bookLifecycle: () => ShopBookLifecycle;
  bookTextures: () => BookTextureRuntime;
};

/** Keeps catalog synchronization state outside the scene runtime. */
export class ShopCatalogSync {
  readonly #host: ShopCatalogSyncHost;
  #lastItems: readonly CatalogItem[] | undefined;
  #lastNewPublicationIds: readonly string[] | undefined;

  constructor(host: ShopCatalogSyncHost) {
    this.#host = host;
  }

  sync() {
    const host = this.#host;
    if (!host.catalogAvailable()) return;
    const items = host.catalogItems();
    const newPublicationIds = host.newPublicationIds();
    const itemsChanged = items !== this.#lastItems;
    const arrivalsChanged = newPublicationIds !== this.#lastNewPublicationIds;
    if (itemsChanged || arrivalsChanged) {
      const hasUnobservedArrivals =
        arrivalsChanged &&
        newPublicationIds.some(
          (publicationId) => !host.observedArrivalIds.has(publicationId),
        );
      const discardOnlyUpdate =
        itemsChanged &&
        !hasUnobservedArrivals &&
        this.#isDiscardOnlyCatalogUpdate(items);
      this.#lastItems = items;
      this.#lastNewPublicationIds = newPublicationIds;
      if ((itemsChanged || hasUnobservedArrivals) && !discardOnlyUpdate)
        host.bookLifecycle().syncBooks(items, newPublicationIds);
    }

    const selectedPublicationId = host.selectedPublicationId();
    if (selectedPublicationId === host.lastSelectedPublicationId()) return;
    host.setLastSelectedPublicationId(selectedPublicationId);
    const record = selectedPublicationId
      ? host.booksById().get(selectedPublicationId)
      : undefined;
    if (record && selectedPublicationId)
      host
        .bookTextures()
        .ensureStandaloneBookTextures(selectedPublicationId, record);
    host.bookLifecycle().applyBookStates();
  }

  #isDiscardOnlyCatalogUpdate(items: readonly CatalogItem[]) {
    const previousItems = this.#lastItems;
    if (!previousItems || items.length >= previousItems.length) return false;

    let itemIndex = 0;
    let removedCount = 0;
    for (const previousItem of previousItems) {
      const item = items[itemIndex];
      if (item?.id === previousItem.id) {
        if (bookSignature(item) !== bookSignature(previousItem)) return false;
        itemIndex += 1;
        continue;
      }

      const bookActions = this.#host.bookActions();
      const discardPending =
        previousItem.id === bookActions.pendingDiscardPublicationId;
      if (
        !discardPending &&
        !bookActions.discardedPublicationIds.has(previousItem.id)
      )
        return false;
      removedCount += 1;
    }

    return removedCount > 0 && itemIndex === items.length;
  }
}

export const bookSignature = (item: CatalogItem) =>
  `${item.cover}|${item.detailCover ?? "no-detail-cover"}|${item.back ?? "solid-back"}|${item.spine ?? "generated-spine"}|${item.accent}|${item.thicknessMm}|${item.aspectRatio ?? "default-aspect"}|${item.direction}|${item.title}`;
