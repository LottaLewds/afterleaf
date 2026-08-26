export const ACTIVE_LIBRARY_ROUTE_PREFIX = "/api/media/library";
export const ACTIVE_LIBRARY_CATALOG_ENDPOINT = `${ACTIVE_LIBRARY_ROUTE_PREFIX}/catalog.json`;
export const SPARSE_LIBRARY_PAGE_ROUTE_PREFIX = "/api/media/library/pages";

export const isSparseLibraryPageUrl = (url: string) =>
  (url.split(/[?#]/u, 1)[0] ?? "").startsWith(
    `${SPARSE_LIBRARY_PAGE_ROUTE_PREFIX}/`,
  );

export type SparseLibraryPageRequest =
  | {kind: "invalid"}
  | {kind: "page"; pageNumber: number; publicationId: string}
  | {kind: "unscoped"};

export const parseSparseLibraryPageRequest = (
  requestUrl: string,
): SparseLibraryPageRequest => {
  const rawPathname = requestUrl.split(/[?#]/u, 1)[0] ?? "";
  const wasScoped = rawPathname.startsWith(
    `${SPARSE_LIBRARY_PAGE_ROUTE_PREFIX}/`,
  );
  let pathname: string;
  try {
    pathname = decodeURIComponent(
      new URL(requestUrl, "http://afterleaf.local").pathname,
    );
  } catch {
    return {kind: "invalid"};
  }
  if (!pathname.startsWith(`${SPARSE_LIBRARY_PAGE_ROUTE_PREFIX}/`))
    return {kind: wasScoped ? "invalid" : "unscoped"};
  const match = pathname.match(
    /^\/api\/media\/library\/pages\/([a-z0-9][a-z0-9._-]{0,199})\/([1-9][0-9]{0,3})$/u,
  );
  if (!match) return {kind: "invalid"};
  const publicationId = match[1];
  const pageNumber = Number(match[2]);
  if (!publicationId || !Number.isSafeInteger(pageNumber) || pageNumber > 2_000)
    return {kind: "invalid"};
  return {kind: "page", pageNumber, publicationId};
};

export const activeLibraryAssetUrl = (assetPath: string) =>
  `${ACTIVE_LIBRARY_ROUTE_PREFIX}/${assetPath.replace(/^\/+/, "")}`;
