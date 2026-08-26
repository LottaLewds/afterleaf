const NHENTAI_GALLERY_URL_PATTERN =
  /https?:\/\/(?:www\.)?nhentai\.net\/g\/([1-9]\d*)(?:\/(?=[?#\s),.!;:'"]|$)|(?=[?#\s),.!;:'"]|$))/iu;

export const nhentaiGalleryIdFromText = (text: string) => {
  const match = text.match(NHENTAI_GALLERY_URL_PATTERN);
  if (!match?.[1]) return;
  const galleryId = Number(match[1]);
  return Number.isSafeInteger(galleryId) ? galleryId : undefined;
};

export const nhentaiGalleryUrl = (galleryId: number) => `https://nhentai.net/g/${galleryId}/`;
