import path from "node:path";

import {ACTIVE_LIBRARY_ROUTE_PREFIX} from "./activeLibraryRoutes";

export type ActiveLibraryAssetRequest =
  | {kind: "invalid"}
  | {kind: "scoped"; pathname: string}
  | {kind: "unscoped"};

export type ActiveLibraryAssetResolution =
  | {kind: "invalid"}
  | {kind: "resolved"; assetPath: string};

export interface ActiveLibraryStorageLocation {
  assetDirectory: string;
  catalogDirectory: string;
  revisionId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const resolveActiveLibraryStorage = (
  libraryDirectory: string,
  index: unknown,
): ActiveLibraryStorageLocation | undefined => {
  if (!isRecord(index) || !Array.isArray(index.snapshots)) return undefined;
  const revisionId = index.activeSnapshotId;
  if (
    typeof revisionId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]*$/u.test(revisionId)
  )
    return undefined;
  const descriptor = index.snapshots.find(
    (value) => isRecord(value) && value.snapshotId === revisionId,
  );
  if (!descriptor) return undefined;
  const expectedDirectories = [
    `revisions/${revisionId}`,
    `snapshots/${revisionId}`,
  ];
  const directory = descriptor.directory;
  if (
    typeof directory !== "string" ||
    !expectedDirectories.includes(directory) ||
    descriptor.catalogPath !== `${directory}/catalog.json`
  )
    return undefined;
  const catalogDirectory = path.resolve(libraryDirectory, directory);
  return {
    assetDirectory: directory.startsWith("revisions/")
      ? path.resolve(libraryDirectory)
      : catalogDirectory,
    catalogDirectory,
    revisionId,
  };
};

const isActiveLibraryPath = (pathname: string) =>
  pathname === "/catalog.json" ||
  pathname.startsWith("/assets/") ||
  pathname.startsWith("/atlases/") ||
  pathname.startsWith("/publications/");

const unprefixActiveLibraryPath = (pathname: string) =>
  pathname.startsWith(`${ACTIVE_LIBRARY_ROUTE_PREFIX}/`)
    ? pathname.slice(ACTIVE_LIBRARY_ROUTE_PREFIX.length)
    : pathname;

export const parseActiveLibraryAssetRequest = (
  requestUrl: string,
): ActiveLibraryAssetRequest => {
  let encodedPathname: string;
  try {
    encodedPathname = new URL(requestUrl, "http://afterleaf.local").pathname;
  } catch {
    return {kind: "unscoped"};
  }
  const encodedAssetPathname = unprefixActiveLibraryPath(encodedPathname);
  if (!isActiveLibraryPath(encodedAssetPathname)) return {kind: "unscoped"};

  let pathname: string;
  try {
    pathname = decodeURIComponent(encodedAssetPathname);
  } catch {
    return {kind: "invalid"};
  }
  if (!isActiveLibraryPath(pathname)) return {kind: "invalid"};
  if (pathname.split(/[\\/]/u).some((segment) => segment === ".."))
    return {kind: "invalid"};

  return {kind: "scoped", pathname};
};

export const resolveActiveLibraryAssetPath = (
  snapshotDirectory: string,
  pathname: string,
): ActiveLibraryAssetResolution => {
  const assetPath = path.resolve(snapshotDirectory, pathname.slice(1));
  const relativePath = path.relative(snapshotDirectory, assetPath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  )
    return {kind: "invalid"};
  return {assetPath, kind: "resolved"};
};
