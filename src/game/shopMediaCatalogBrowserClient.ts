import {parseShopMediaCatalog, SHOP_MEDIA_CATALOG_ENDPOINT, type ShopMediaCatalog} from "~/game/shopMediaCatalog";

export const loadShopMediaCatalog = async (signal: AbortSignal): Promise<ShopMediaCatalog> => {
  const response = await fetch(SHOP_MEDIA_CATALOG_ENDPOINT, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(`Shop media discovery failed (${response.status})`);
  return parseShopMediaCatalog(await response.json());
};
