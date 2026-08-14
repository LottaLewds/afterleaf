import {parseArtFrameCatalog, type ArtFrameCatalog} from "~/artFrames/protocol";
import {SHOP_MEDIA_CATALOG_ENDPOINT} from "~/game/shopMediaCatalogHttp";
import {parseModelCatalog, type ModelCatalog} from "~/models/protocol";
import {parsePosterCatalog, type PosterCatalog} from "~/posters/protocol";
import {parseTvChannelManifest, type TvChannelManifest} from "~/tv/protocol";

export {SHOP_MEDIA_CATALOG_ENDPOINT};

export type ShopMediaCatalog = {
  artFrames: ArtFrameCatalog;
  models: ModelCatalog;
  posters: PosterCatalog;
  tv: TvChannelManifest;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseShopMediaCatalog = (value: unknown): ShopMediaCatalog => {
  if (!isRecord(value)) throw new Error("Shop media catalog is invalid");
  return {
    artFrames: parseArtFrameCatalog(value.artFrames),
    models: parseModelCatalog(value.models),
    posters: parsePosterCatalog(value.posters),
    tv: parseTvChannelManifest(value.tv),
  };
};
