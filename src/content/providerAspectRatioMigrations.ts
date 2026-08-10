import {readFile, realpath} from "node:fs/promises";
import {isAbsolute, relative, sep} from "node:path";
import {
  BOOK_ASPECT_RATIO_INFERENCE_VERSION,
  bookAspectRatioSamplePageIndices,
  inferRepresentativeBookAspectRatio,
  type ImageDimensions,
} from "~/content/bookAspectRatio";
import {readImageDimensions} from "~/content/imageDimensions";
import type {LibrarySourceMigration} from "~/content/librarySourceMigrations";
import type {LibraryProvider} from "~/content/providers/types";
import type {LocalPublicationDocument} from "~/content/schema";
import {resolveContainedPath} from "~/content/validation";

const DEFAULT_BOOK_ASPECT_RATIO = 2 / 3;

interface ProviderAspectRatioMigrationOptions {
  loadProvider(providerId: string): Promise<LibraryProvider>;
  providerIds: ReadonlySet<string>;
}

const publicationNeedsAspectRatioMigration = (
  document: LocalPublicationDocument,
) => {
  if (
    document.aspectRatioInferenceVersion === BOOK_ASPECT_RATIO_INFERENCE_VERSION
  )
    return false;
  return (
    document.aspectRatioInferenceVersion !== undefined ||
    document.physical?.aspectRatio === undefined
  );
};

const localPageDimensions = async (
  document: LocalPublicationDocument,
  publicationDirectory: string,
  resolvedPublicationDirectory: string,
  pageIndex: number,
) => {
  const assetPath = document.assets.pages[pageIndex];
  if (!assetPath) return;
  try {
    const resolvedPage = await realpath(
      resolveContainedPath(publicationDirectory, assetPath),
    );
    const relativePage = relative(resolvedPublicationDirectory, resolvedPage);
    if (
      relativePage === "" ||
      relativePage === ".." ||
      relativePage.startsWith(`..${sep}`) ||
      isAbsolute(relativePage)
    )
      return;
    return await readImageDimensions(await readFile(resolvedPage));
  } catch {
    return;
  }
};

const remotePageDimensions = async (
  provider: LibraryProvider,
  document: LocalPublicationDocument,
  publicationDirectory: string,
  pageCount: number,
  pageIndex: number,
) => {
  const metadataHash = document.source?.metadataHash;
  if (!metadataHash)
    throw new Error("the publication has no source metadata hash");
  if (!provider.materializePage)
    throw new Error("the provider does not support exact-page acquisition");
  const dimensions = await readImageDimensions(
    await provider.materializePage({
      metadataHash,
      pageCount,
      pageNumber: pageIndex + 1,
      publication: document,
      sourceDirectory: publicationDirectory,
    }),
  );
  if (!dimensions)
    throw new Error(`page ${pageIndex + 1} dimensions could not be decoded`);
  return dimensions;
};

export const createProviderAspectRatioMigration = (
  options: ProviderAspectRatioMigrationOptions,
): LibrarySourceMigration => {
  const providerPromises = new Map<string, Promise<LibraryProvider>>();
  return {
    applies: ({document}) => {
      const providerId = document.source?.provider;
      return (
        providerId !== undefined &&
        options.providerIds.has(providerId) &&
        publicationNeedsAspectRatioMigration(document)
      );
    },
    id: "provider-aspect-ratio-inference",
    label: "aspect-ratio inference",
    migrate: async ({document, publicationDirectory}) => {
      const providerId = document.source?.provider;
      if (!providerId)
        throw new Error("the publication has no source provider");
      const pageCount = document.pageCount ?? document.assets.pages.length;
      const interiorSampleIndices = bookAspectRatioSamplePageIndices(pageCount);
      const sampleIndices =
        interiorSampleIndices.length > 0
          ? interiorSampleIndices
          : [...new Set([0, pageCount - 1])];
      const dimensions: ImageDimensions[] = [];
      const resolvedPublicationDirectory = await realpath(publicationDirectory);
      for (const pageIndex of sampleIndices) {
        const local = await localPageDimensions(
          document,
          publicationDirectory,
          resolvedPublicationDirectory,
          pageIndex,
        );
        if (local) {
          dimensions.push(local);
          continue;
        }
        let providerPromise = providerPromises.get(providerId);
        if (!providerPromise) {
          providerPromise = options.loadProvider(providerId);
          providerPromises.set(providerId, providerPromise);
        }
        dimensions.push(
          await remotePageDimensions(
            await providerPromise,
            document,
            publicationDirectory,
            pageCount,
            pageIndex,
          ),
        );
      }
      const aspectRatio = inferRepresentativeBookAspectRatio(
        dimensions,
        DEFAULT_BOOK_ASPECT_RATIO,
      );
      return {
        ...document,
        aspectRatioInferenceVersion: BOOK_ASPECT_RATIO_INFERENCE_VERSION,
        physical: {...(document.physical ?? {}), aspectRatio},
      };
    },
  };
};
