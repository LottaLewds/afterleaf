export const SHOP_ROSTER_LIMIT = 20;

export type ShopRosterSelectionOptions = {
  catalogPublicationIds: readonly string[];
  currentBatchHasLooseBooks: boolean;
  currentPublicationIds: readonly string[];
  initializeRoster: boolean;
  newPublicationIds: readonly string[];
  pendingArrivalIds: readonly string[];
  savedPublicationIds?: readonly string[];
};

export type ShopRosterSelection = {
  pendingArrivalIds: string[];
  promotedArrivalIds: string[];
  publicationIds: string[];
};

const appendAvailableIds = (
  output: string[],
  candidates: readonly string[],
  availableIds: ReadonlySet<string>,
  limit = Number.POSITIVE_INFINITY,
) => {
  const includedIds = new Set(output);
  for (const publicationId of candidates) {
    if (output.length >= limit) break;
    if (!availableIds.has(publicationId) || includedIds.has(publicationId)) continue;
    includedIds.add(publicationId);
    output.push(publicationId);
  }
  return output;
};

/**
 * Chooses the bounded physical aisle without treating the off-screen catalog as
 * newly delivered stock. Arrivals fill spare live-scene capacity immediately;
 * once full, overflow waits until the current loose work has been cleared.
 */
export const selectShopRoster = (
  options: ShopRosterSelectionOptions,
  limit = SHOP_ROSTER_LIMIT,
): ShopRosterSelection => {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const availableIds = new Set(options.catalogPublicationIds);
  const basePublicationIds: string[] = [];

  if (options.initializeRoster) {
    appendAvailableIds(basePublicationIds, options.savedPublicationIds ?? [], availableIds, boundedLimit);
    appendAvailableIds(basePublicationIds, options.catalogPublicationIds, availableIds, boundedLimit);
  } else {
    appendAvailableIds(basePublicationIds, options.currentPublicationIds, availableIds, boundedLimit);
  }

  const baseIds = new Set(basePublicationIds);
  const queuedArrivalIds: string[] = [];
  appendAvailableIds(queuedArrivalIds, [...options.pendingArrivalIds, ...options.newPublicationIds], availableIds);
  const pendingArrivalIds = queuedArrivalIds.filter((publicationId) => !baseIds.has(publicationId));
  if (pendingArrivalIds.length === 0)
    return {
      pendingArrivalIds,
      promotedArrivalIds: [],
      publicationIds: basePublicationIds,
    };

  const openSlotCount = Math.max(0, boundedLimit - basePublicationIds.length);
  const openSlotArrivals = pendingArrivalIds.slice(0, openSlotCount);
  if (options.currentBatchHasLooseBooks || openSlotArrivals.length > 0)
    return {
      pendingArrivalIds: pendingArrivalIds.slice(openSlotArrivals.length),
      promotedArrivalIds: openSlotArrivals,
      publicationIds: [...basePublicationIds, ...openSlotArrivals],
    };

  const promotedArrivalIds = pendingArrivalIds.slice(0, boundedLimit);
  const publicationIds = [...promotedArrivalIds];
  appendAvailableIds(publicationIds, basePublicationIds, availableIds, boundedLimit);
  return {
    pendingArrivalIds: pendingArrivalIds.slice(promotedArrivalIds.length),
    promotedArrivalIds,
    publicationIds,
  };
};
