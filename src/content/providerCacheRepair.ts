import {randomUUID} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {basename, dirname, relative, resolve, sep} from "node:path";
import {readImageDimensions} from "~/content/imageDimensions";
import type {LibraryProviderRegistry} from "~/content/providers/registry";
import {
  createRepresentativePagePlan,
  finalizeProviderPublicationDocument,
  type DownloadedProviderPage,
} from "~/content/providers/sdk";
import type {LocalPublicationDocument} from "~/content/schema";
import {
  parseLocalPublicationDocument,
  resolveContainedPath,
} from "~/content/validation";

const PUBLICATION_MANIFEST_FILE = "publication.json";

interface CachedProviderPublication {
  document: LocalPublicationDocument;
  manifestPath: string;
  publicationDirectory: string;
  sourceId: string;
}

export interface ProviderCacheRepairDiagnostic {
  message: string;
  providerId: string;
  sourceId: string;
}

export interface ProviderCacheRepairReport {
  diagnostics: ProviderCacheRepairDiagnostic[];
  failedCount: number;
  repairedCount: number;
  requestedCount: number;
}

export interface ProviderCacheRepairOptions {
  onProgress?: (message: string) => void;
  providerRegistry: LibraryProviderRegistry;
  sourceDirectory: string;
}

const portablePath = (path: string) => path.split(sep).join("/");

const cachedProviderPublications = async (
  sourceDirectory: string,
  providerIds: ReadonlySet<string>,
) => {
  const pendingDirectories = [sourceDirectory];
  const publications: CachedProviderPublication[] = [];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) break;
    let entries;
    try {
      entries = await readdir(directory, {withFileTypes: true});
    } catch (error) {
      if (
        directory === sourceDirectory &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return [];
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) pendingDirectories.push(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== PUBLICATION_MANIFEST_FILE) continue;
      try {
        const document = parseLocalPublicationDocument(
          JSON.parse(await readFile(path, "utf8")) as unknown,
          path,
        );
        const publicationDirectory = dirname(path);
        const providerId = document.source?.provider;
        if (
          document.id !== basename(publicationDirectory) ||
          !providerId ||
          !providerIds.has(providerId)
        )
          continue;
        publications.push({
          document,
          manifestPath: path,
          publicationDirectory,
          sourceId: portablePath(
            relative(sourceDirectory, publicationDirectory),
          ),
        });
      } catch {
        // The normal catalog scan reports invalid manifests.
      }
    }
  }
  return publications.toSorted((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
};

const assertAssetParentIsContained = async (
  publicationDirectory: string,
  assetPath: string,
) => {
  const target = resolveContainedPath(publicationDirectory, assetPath);
  const parent = dirname(target);
  const relativeParent = relative(publicationDirectory, parent);
  let current = publicationDirectory;
  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Asset parent is a symbolic link: ${assetPath}`);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        break;
      throw error;
    }
  }
  return target;
};

const assetPageNumbers = (
  document: LocalPublicationDocument,
  pageCount: number,
) => {
  const pageNumberByAsset = new Map<string, number>();
  const add = (assetPath: string | undefined, pageNumber: number) => {
    if (!assetPath) return;
    const existing = pageNumberByAsset.get(assetPath);
    if (existing !== undefined && existing !== pageNumber)
      throw new Error(
        `Asset ${JSON.stringify(assetPath)} represents multiple remote pages`,
      );
    pageNumberByAsset.set(assetPath, pageNumber);
  };
  document.assets.pages.forEach((assetPath, index) =>
    add(assetPath, index + 1),
  );
  add(document.assets.front, 1);
  add(document.assets.back, pageCount);
  return pageNumberByAsset;
};

const repairPublication = async (
  candidate: CachedProviderPublication,
  providerRegistry: LibraryProviderRegistry,
) => {
  const providerId = candidate.document.source?.provider;
  const metadataHash = candidate.document.source?.metadataHash;
  if (!providerId || !metadataHash)
    throw new Error("the cached publication has incomplete provider metadata");
  const provider = await providerRegistry.load(providerId);
  const materializePage = provider.materializePage;
  if (!materializePage)
    throw new Error("the provider does not support cached-page repair");
  const pageCount =
    candidate.document.pageCount ?? candidate.document.assets.pages.length;
  const pageNumberByAsset = assetPageNumbers(candidate.document, pageCount);
  const pagePlan = createRepresentativePagePlan(
    pageCount,
    Math.max(1, candidate.document.assets.pages.length),
  );
  const requestedPageIndexes = [
    ...new Set([
      ...pagePlan.acquisitionPageIndexes,
      ...[...pageNumberByAsset.values()].map((pageNumber) => pageNumber - 1),
    ]),
  ];
  const downloadedPages: DownloadedProviderPage[] = [];
  let nextIndex = 0;
  const workers = await Promise.allSettled(
    Array.from({length: Math.min(3, requestedPageIndexes.length)}, async () => {
      while (nextIndex < requestedPageIndexes.length) {
        const pageIndex = requestedPageIndexes[nextIndex];
        nextIndex += 1;
        if (pageIndex === undefined) continue;
        const bytes = await materializePage({
          metadataHash,
          pageCount,
          pageNumber: pageIndex + 1,
          publication: candidate.document,
          sourceDirectory: candidate.publicationDirectory,
        });
        if (!(await readImageDimensions(bytes)))
          throw new Error(`page ${pageIndex + 1} is not a supported image`);
        downloadedPages.push({bytes, pageIndex});
      }
    }),
  );
  const failedWorker = workers.find(
    (worker): worker is PromiseRejectedResult => worker.status === "rejected",
  );
  if (failedWorker) throw failedWorker.reason;
  const bytesByPageNumber = new Map(
    downloadedPages.map(({bytes, pageIndex}) => [pageIndex + 1, bytes]),
  );
  const stagedAssets: Array<{stagedPath: string; targetPath: string}> = [];
  let stagedManifest: string | undefined;
  try {
    for (const [assetPath, pageNumber] of pageNumberByAsset) {
      const bytes = bytesByPageNumber.get(pageNumber);
      if (!bytes) throw new Error(`page ${pageNumber} was not materialized`);
      const targetPath = await assertAssetParentIsContained(
        candidate.publicationDirectory,
        assetPath,
      );
      await mkdir(dirname(targetPath), {recursive: true});
      const stagedPath = `${targetPath}.repair-${randomUUID()}`;
      await writeFile(stagedPath, bytes);
      stagedAssets.push({stagedPath, targetPath});
    }
    for (const asset of stagedAssets)
      await rename(asset.stagedPath, asset.targetPath);
    const document = await finalizeProviderPublicationDocument(
      candidate.document,
      downloadedPages,
    );
    stagedManifest = `${candidate.manifestPath}.repair-${randomUUID()}`;
    await writeFile(stagedManifest, `${JSON.stringify(document, null, 2)}\n`);
    await rename(stagedManifest, candidate.manifestPath);
    stagedManifest = undefined;
  } finally {
    await Promise.all(
      [
        ...stagedAssets.map(({stagedPath}) => stagedPath),
        ...(stagedManifest ? [stagedManifest] : []),
      ].map((path) => rm(path, {force: true})),
    );
  }
};

export const repairCachedProviderPublications = async (
  options: ProviderCacheRepairOptions,
): Promise<ProviderCacheRepairReport> => {
  const providerIds = new Set(
    options.providerRegistry.descriptors().map(({id}) => id),
  );
  const publications = await cachedProviderPublications(
    options.sourceDirectory,
    providerIds,
  );
  const diagnostics: ProviderCacheRepairDiagnostic[] = [];
  let repairedCount = 0;
  if (publications.length === 0)
    return {diagnostics, failedCount: 0, repairedCount, requestedCount: 0};
  options.onProgress?.(
    `Deep remote repair: 0/${publications.length} cached publications complete`,
  );
  for (const [index, publication] of publications.entries()) {
    const providerId = publication.document.source?.provider;
    if (!providerId) continue;
    options.onProgress?.(
      `Deep remote repair: repairing ${publication.sourceId} (${index + 1}/${publications.length})`,
    );
    try {
      await repairPublication(publication, options.providerRegistry);
      repairedCount += 1;
    } catch (error) {
      diagnostics.push({
        message: `Could not repair ${publication.sourceId} from ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
        providerId,
        sourceId: publication.sourceId,
      });
    }
  }
  options.onProgress?.(
    `Deep remote repair: ${publications.length}/${publications.length} cached publications complete (${repairedCount} repaired, ${diagnostics.length} failed)`,
  );
  return {
    diagnostics,
    failedCount: diagnostics.length,
    repairedCount,
    requestedCount: publications.length,
  };
};
