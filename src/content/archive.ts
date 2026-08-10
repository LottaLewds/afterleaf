import {randomUUID} from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {basename, dirname, extname, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
  ARCHIVE_SOURCE_PROVIDER,
  inspectContentArchive,
  isContentArchivePath,
  readContentArchiveImage,
  type ArchiveInspection,
} from "~/content/archiveReader";
import {
  BOOK_ASPECT_RATIO_INFERENCE_VERSION,
  bookAspectRatioSamplePageIndices,
  inferRepresentativeBookAspectRatio,
} from "~/content/bookAspectRatio";
import {
  detectPreparedPublicationLanguage,
  detectPreparedPublicationReadingDirection,
  inferPreparedPublicationIdentity,
} from "~/content/prepare";
import {createReaderPageDerivative} from "~/content/readerImage";
import {normalizeTag} from "~/content/normalize";
import {
  CONTENT_SCHEMA_VERSION,
  type LocalPublicationDocument,
  type PublicationPhysical,
  type PublicationIssue,
  type PublicationKind,
  type SupportedLanguage,
} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";
import sharp from "~/media/sharpRuntime";

export {
  ARCHIVE_SOURCE_PROVIDER,
  inspectContentArchive,
  readContentArchiveImage,
};
export type {ArchiveInspection};

const NATURAL_COLLATOR = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});
const FRONT_SOURCE_FILE = "front.webp";
const BACK_SOURCE_FILE = "back.webp";
const DEFAULT_ARCHIVE_ASPECT_RATIO = 2 / 3;
const EARLY_INTERIOR_ASPECT_SAMPLE_COUNT = 4;

export interface ArchivePath {
  path: string;
  readingDirection?: "ltr" | "rtl";
}

export interface ArchiveImportOptions {
  archivePaths?: readonly (string | ArchivePath)[];
  archivesDirectory: string;
  defaultLanguage: SupportedLanguage;
  force: boolean;
  outputDirectory: string;
  tags: string[];
  write: boolean;
}

export interface ArchiveImportDiagnostic {
  archive: string;
  code:
    | "duplicate-destination"
    | "existing-destination"
    | "invalid-archive"
    | "skipped-language"
    | "skipped-symlink";
  message: string;
}

export interface ArchiveImportPublication {
  archive: string;
  destination: string;
  groupId?: string;
  imageCount: number;
  issue?: PublicationIssue;
  kind?: PublicationKind;
  language: SupportedLanguage;
  title: string;
  totalUncompressedBytes: number;
  document?: LocalPublicationDocument;
}

export interface ArchiveImportReport {
  archivesDirectory: string;
  outputDirectory: string;
  wroteCatalog: boolean;
  discoveredCount: number;
  preparedCount: number;
  skippedCount: number;
  publications: ArchiveImportPublication[];
  diagnostics: ArchiveImportDiagnostic[];
}

interface ArchivePlan {
  archivePath: string;
  archiveName: string;
  destinationName: string;
  destinationPath: string;
  document?: LocalPublicationDocument;
  groupId?: string;
  inspection: ArchiveInspection;
  issue?: PublicationIssue;
  kind?: PublicationKind;
  language: SupportedLanguage;
  readingDirection?: "ltr" | "rtl";
  replaceExisting: boolean;
  tags: string[];
  title: string;
}

const fileExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const sanitizeDestinationName = (archiveName: string) =>
  [...archiveName.normalize("NFKC")]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 ? "-" : character;
    })
    .join("")
    .replace(/[<>:"/\\|?*]/gu, "-")
    .replace(/[. ]+$/gu, "")
    .trim();

interface DiscoveredArchive {
  archiveName: string;
  archivePath: string;
  readingDirection?: "ltr" | "rtl";
}

const DIRECTION_DIRECTORIES = {
  comics: "ltr",
  manga: "rtl",
} as const;

const findArchives = async (
  archivesDirectory: string,
  diagnostics: ArchiveImportDiagnostic[],
  configuredReadingDirection?: "ltr" | "rtl",
) => {
  const archives: DiscoveredArchive[] = [];
  const scanDirectory = async (
    directory: string,
    prefix: string,
    readingDirection: "ltr" | "rtl" | undefined,
  ) => {
    const entries = await readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      const archiveName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        diagnostics.push({
          archive: archiveName,
          code: "skipped-symlink",
          message: `Skipped symbolic-link archive ${archiveName}`,
        });
        continue;
      }
      const path = resolve(directory, entry.name);
      if (entry.isFile() && isContentArchivePath(entry.name)) {
        archives.push({
          archiveName,
          archivePath: path,
          ...(readingDirection === undefined ? {} : {readingDirection}),
        });
        continue;
      }
      if (!entry.isDirectory()) continue;
      const direction =
        readingDirection ??
        DIRECTION_DIRECTORIES[
          entry.name.toLowerCase() as keyof typeof DIRECTION_DIRECTORIES
        ];
      await scanDirectory(path, archiveName, direction);
    }
  };
  try {
    const sourceStat = await lstat(archivesDirectory);
    if (sourceStat.isSymbolicLink()) {
      diagnostics.push({
        archive: basename(archivesDirectory),
        code: "skipped-symlink",
        message: `Skipped symbolic-link archive ${basename(archivesDirectory)}`,
      });
    } else if (sourceStat.isFile() && isContentArchivePath(archivesDirectory)) {
      archives.push({
        archiveName: basename(archivesDirectory),
        archivePath: archivesDirectory,
        ...(configuredReadingDirection === undefined
          ? {}
          : {readingDirection: configuredReadingDirection}),
      });
    } else if (sourceStat.isDirectory()) {
      await scanDirectory(archivesDirectory, "", configuredReadingDirection);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return archives.sort((left, right) =>
    NATURAL_COLLATOR.compare(left.archiveName, right.archiveName),
  );
};

const createArchiveDocument = (
  plan: ArchivePlan,
  inferredAspectRatio: number,
): LocalPublicationDocument => {
  if (plan.document) {
    if (!archiveNeedsAspectRatioInference(plan.document)) return plan.document;
    return {
      ...plan.document,
      aspectRatioInferenceVersion: BOOK_ASPECT_RATIO_INFERENCE_VERSION,
      physical: {
        ...(plan.document.physical ?? {}),
        aspectRatio: inferredAspectRatio,
      },
    };
  }
  const id = normalizeTag(plan.title);
  if (!id)
    throw new Error(
      `Could not derive a publication ID from ${plan.archiveName}`,
    );
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    aspectRatioInferenceVersion: BOOK_ASPECT_RATIO_INFERENCE_VERSION,
    id,
    ...(plan.groupId === undefined ? {} : {groupId: plan.groupId}),
    ...(plan.issue === undefined ? {} : {issue: plan.issue}),
    ...(plan.kind === undefined ? {} : {kind: plan.kind}),
    title: plan.title,
    language: plan.language,
    pageCount: plan.inspection.imageEntries.length,
    tags: plan.tags.length === 0 ? ["unclassified"] : plan.tags,
    assets: {
      pages: [],
      front: FRONT_SOURCE_FILE,
      back:
        plan.inspection.imageEntries.length === 1
          ? FRONT_SOURCE_FILE
          : BACK_SOURCE_FILE,
    },
    source: {
      provider: ARCHIVE_SOURCE_PROVIDER,
      remoteId: plan.archiveName,
      sourceUrl: pathToFileURL(plan.archivePath).href,
      retrievedAt: plan.inspection.modifiedAt,
      metadataHash: plan.inspection.metadataHash,
    },
    physical: {
      aspectRatio: inferredAspectRatio,
      ...(plan.readingDirection === undefined
        ? {}
        : {readingDirection: plan.readingDirection}),
    },
  };
};

const archiveNeedsAspectRatioInference = (document: LocalPublicationDocument) =>
  document.physical?.aspectRatio === undefined ||
  (document.source?.provider === ARCHIVE_SOURCE_PROVIDER &&
    document.aspectRatioInferenceVersion !==
      BOOK_ASPECT_RATIO_INFERENCE_VERSION);

const readArchiveAspectSamples = async (plan: ArchivePlan) => {
  const lastPageIndex = plan.inspection.imageEntries.length - 1;
  // The adjacent midpoint page makes it unlikely that one unlucky spread is
  // the only evidence away from covers and translator-added terminal pages.
  const aspectSampleIndices = bookAspectRatioSamplePageIndices(
    plan.inspection.imageEntries.length,
    EARLY_INTERIOR_ASPECT_SAMPLE_COUNT,
  );
  const sourceIndices = [
    ...new Set([0, lastPageIndex, ...aspectSampleIndices]),
  ];
  const sources = new Map(
    await Promise.all(
      sourceIndices.map(
        async (index) =>
          [
            index,
            await readContentArchiveImage(
              plan.archivePath,
              index,
              plan.inspection.metadataHash,
            ),
          ] as const,
      ),
    ),
  );
  const representativeIndices =
    aspectSampleIndices.length > 0 ? aspectSampleIndices : sourceIndices;
  const dimensions = await Promise.all(
    representativeIndices.flatMap((index) => {
      const source = sources.get(index);
      return source
        ? [sharp(source, {limitInputPixels: 100_000_000}).metadata()]
        : [];
    }),
  );
  return {
    aspectRatio: inferRepresentativeBookAspectRatio(
      dimensions.flatMap((metadata) =>
        metadata.width && metadata.height
          ? [
              {
                height: metadata.height,
                ...(metadata.orientation === undefined
                  ? {}
                  : {orientation: metadata.orientation}),
                width: metadata.width,
              },
            ]
          : [],
      ),
      DEFAULT_ARCHIVE_ASPECT_RATIO,
    ),
    sources,
  };
};

const materializeArchivePlan = async (
  plan: ArchivePlan,
  publicationDirectory: string,
) => {
  if (plan.document && !archiveNeedsAspectRatioInference(plan.document)) {
    await cp(plan.destinationPath, publicationDirectory, {recursive: true});
    await writeFile(
      resolve(publicationDirectory, "publication.json"),
      `${JSON.stringify(plan.document, null, 2)}\n`,
    );
    return plan.document;
  }
  const {aspectRatio, sources} = await readArchiveAspectSamples(plan);
  const document = createArchiveDocument(plan, aspectRatio);
  if (plan.document) {
    await cp(plan.destinationPath, publicationDirectory, {recursive: true});
    await writeFile(
      resolve(publicationDirectory, "publication.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    return document;
  }
  await mkdir(publicationDirectory, {recursive: true});
  const lastPageIndex = plan.inspection.imageEntries.length - 1;
  const frontSource = sources.get(0);
  if (!frontSource) throw new Error("Archive has no front image sample");
  const backSource =
    lastPageIndex === 0 ? undefined : sources.get(lastPageIndex);
  if (lastPageIndex > 0 && !backSource)
    throw new Error("Archive has no back image sample");
  const [front, back] = await Promise.all([
    createReaderPageDerivative(frontSource),
    backSource === undefined
      ? undefined
      : createReaderPageDerivative(backSource),
  ]);
  await Promise.all([
    writeFile(resolve(publicationDirectory, FRONT_SOURCE_FILE), front),
    ...(back === undefined
      ? []
      : [writeFile(resolve(publicationDirectory, BACK_SOURCE_FILE), back)]),
    writeFile(
      resolve(publicationDirectory, "publication.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    ),
  ]);
  return document;
};

interface CommitMove {
  backupPath?: string;
  destinationPath: string;
  replaceExisting: boolean;
  sourcePath: string;
}

const commitImportedDirectories = async (moves: CommitMove[]) => {
  const backedUp: CommitMove[] = [];
  const committed: CommitMove[] = [];
  try {
    for (const move of moves) {
      if (!(await fileExists(move.destinationPath))) continue;
      if (!move.replaceExisting)
        throw new Error(
          `Import destination already exists: ${move.destinationPath}`,
        );
      const backupPath = `${move.destinationPath}.backup-${randomUUID()}`;
      await rename(move.destinationPath, backupPath);
      move.backupPath = backupPath;
      backedUp.push(move);
    }
    for (const move of moves) {
      await rename(move.sourcePath, move.destinationPath);
      committed.push(move);
    }
  } catch (error) {
    for (const move of committed.reverse())
      if (await fileExists(move.destinationPath))
        await rename(move.destinationPath, move.sourcePath);
    for (const move of backedUp.reverse())
      if (move.backupPath && (await fileExists(move.backupPath)))
        await rename(move.backupPath, move.destinationPath);
    throw error;
  }
  for (const move of backedUp)
    if (move.backupPath)
      await rm(move.backupPath, {recursive: true, force: true});
};

const readExistingArchiveDocument = async (destinationPath: string) => {
  try {
    return parseLocalPublicationDocument(
      JSON.parse(
        await readFile(resolve(destinationPath, "publication.json"), "utf8"),
      ) as unknown,
      "publication.json",
    );
  } catch {
    return undefined;
  }
};

const refreshArchiveMetadata = (
  document: LocalPublicationDocument,
  plan: ArchivePlan,
) => {
  if (document.source?.provider !== ARCHIVE_SOURCE_PROVIDER) return undefined;
  const physical: PublicationPhysical = {...(document.physical ?? {})};
  delete physical.readingDirection;
  if (plan.readingDirection) physical.readingDirection = plan.readingDirection;
  const sourceUrl = pathToFileURL(plan.archivePath).href;
  const changed =
    document.physical?.readingDirection !== plan.readingDirection ||
    document.pageCount !== plan.inspection.imageEntries.length ||
    document.source.metadataHash !== plan.inspection.metadataHash ||
    document.source.remoteId !== plan.archiveName ||
    document.source.sourceUrl !== sourceUrl;
  if (!changed) return document;
  const {physical: _physical, source: _source, ...metadata} = document;
  return {
    ...metadata,
    ...(Object.keys(physical).length === 0 ? {} : {physical}),
    pageCount: plan.inspection.imageEntries.length,
    assets: {
      pages: [],
      front: FRONT_SOURCE_FILE,
      ...(plan.inspection.imageEntries.length < 2
        ? {}
        : {back: BACK_SOURCE_FILE}),
    },
    source: {
      ...document.source,
      metadataHash: plan.inspection.metadataHash,
      remoteId: plan.archiveName,
      retrievedAt: new Date().toISOString(),
      sourceUrl,
    },
  } satisfies LocalPublicationDocument;
};

const toReportPublication = (
  plan: ArchivePlan,
  document?: LocalPublicationDocument,
): ArchiveImportPublication => ({
  archive: plan.archiveName,
  destination: plan.destinationPath,
  ...(plan.groupId === undefined ? {} : {groupId: plan.groupId}),
  imageCount: plan.inspection.imageEntries.length,
  ...(plan.issue === undefined ? {} : {issue: plan.issue}),
  ...(plan.kind === undefined ? {} : {kind: plan.kind}),
  language: plan.language,
  title: plan.title,
  totalUncompressedBytes: plan.inspection.totalUncompressedBytes,
  ...(document === undefined ? {} : {document}),
});

export const importContentArchives = async (
  options: ArchiveImportOptions,
): Promise<ArchiveImportReport> => {
  const archivesDirectory = resolve(options.archivesDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const diagnostics: ArchiveImportDiagnostic[] = [];
  const archivePaths = options.archivePaths ?? [archivesDirectory];
  const archives: DiscoveredArchive[] = [];
  for (const archiveEntry of archivePaths) {
    const archivePath =
      typeof archiveEntry === "string" ? {path: archiveEntry} : archiveEntry;
    archives.push(
      ...(await findArchives(
        resolve(archivePath.path),
        diagnostics,
        archivePath.readingDirection,
      )),
    );
  }
  archives.sort((left, right) =>
    NATURAL_COLLATOR.compare(left.archiveName, right.archiveName),
  );
  const plans: ArchivePlan[] = [];
  const destinationKeys = new Set<string>();

  for (const archive of archives) {
    const {archiveName, archivePath} = archive;
    const fileName = basename(archivePath);
    const stem = basename(fileName, extname(fileName));
    const detectedLanguage = detectPreparedPublicationLanguage(
      stem,
      options.defaultLanguage,
    );
    const filenameDirection = detectPreparedPublicationReadingDirection(stem);
    if (
      archive.readingDirection &&
      filenameDirection &&
      archive.readingDirection !== filenameDirection
    ) {
      diagnostics.push({
        archive: archiveName,
        code: "invalid-archive",
        message: `Skipped ${archiveName} because its directory and filename reading-direction directives conflict`,
      });
      continue;
    }
    const readingDirection = filenameDirection ?? archive.readingDirection;
    if (!detectedLanguage.language) {
      diagnostics.push({
        archive: archiveName,
        code: "skipped-language",
        message: `Skipped ${archiveName} because its name indicates ${detectedLanguage.unsupportedLabel ?? "an unsupported language"}`,
      });
      continue;
    }
    const destinationName = sanitizeDestinationName(stem);
    if (!destinationName) {
      diagnostics.push({
        archive: archiveName,
        code: "invalid-archive",
        message: "Archive name cannot produce a safe destination directory",
      });
      continue;
    }
    const destinationKey = destinationName.toLocaleLowerCase("en-US");
    if (destinationKeys.has(destinationKey)) {
      diagnostics.push({
        archive: archiveName,
        code: "duplicate-destination",
        message: `Skipped archive with colliding destination ${destinationName}`,
      });
      continue;
    }
    const destinationPath = resolve(outputDirectory, destinationName);
    const destinationExists = await fileExists(destinationPath);
    try {
      const inspection = await inspectContentArchive(archivePath);
      const identity = inferPreparedPublicationIdentity(stem, options.tags);
      destinationKeys.add(destinationKey);
      const plan: ArchivePlan = {
        archivePath,
        archiveName,
        destinationName,
        destinationPath,
        ...(identity.groupId === undefined ? {} : {groupId: identity.groupId}),
        inspection,
        ...(identity.issue === undefined ? {} : {issue: identity.issue}),
        ...(identity.kind === undefined ? {} : {kind: identity.kind}),
        language: detectedLanguage.language,
        ...(readingDirection === undefined ? {} : {readingDirection}),
        replaceExisting: destinationExists && options.force,
        tags: identity.tags,
        title: identity.title,
      };
      if (destinationExists && !options.force) {
        const existingDocument =
          await readExistingArchiveDocument(destinationPath);
        const refreshedDocument = existingDocument
          ? refreshArchiveMetadata(existingDocument, plan)
          : undefined;
        const needsAspectRatio =
          refreshedDocument !== undefined &&
          archiveNeedsAspectRatioInference(refreshedDocument);
        if (
          !refreshedDocument ||
          (refreshedDocument === existingDocument && !needsAspectRatio)
        ) {
          diagnostics.push({
            archive: archiveName,
            code: "existing-destination",
            message: `Skipped existing destination ${destinationPath}; pass --force with --write to replace it`,
          });
          continue;
        }
        plan.document = refreshedDocument;
        plan.replaceExisting = true;
      }
      plans.push(plan);
    } catch (error) {
      diagnostics.push({
        archive: archiveName,
        code: "invalid-archive",
        message: `Skipped invalid archive: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (!options.write)
    return {
      archivesDirectory,
      outputDirectory,
      wroteCatalog: false,
      discoveredCount: archives.length,
      preparedCount: plans.length,
      skippedCount: archives.length - plans.length,
      publications: plans.map((plan) => toReportPublication(plan)),
      diagnostics,
    };

  await mkdir(outputDirectory, {recursive: true});
  const stagingRoot = resolve(
    dirname(outputDirectory),
    `.${basename(outputDirectory)}.archive-staging-${randomUUID()}`,
  );
  await mkdir(stagingRoot, {recursive: true});
  try {
    const documentsByDirectory = new Map<string, LocalPublicationDocument>();
    for (const plan of plans) {
      const publicationDirectory = resolve(stagingRoot, plan.destinationName);
      documentsByDirectory.set(
        plan.destinationName,
        await materializeArchivePlan(plan, publicationDirectory),
      );
    }
    await commitImportedDirectories(
      plans.map((plan) => ({
        sourcePath: resolve(stagingRoot, plan.destinationName),
        destinationPath: plan.destinationPath,
        replaceExisting: plan.replaceExisting,
      })),
    );
    return {
      archivesDirectory,
      outputDirectory,
      wroteCatalog: true,
      discoveredCount: archives.length,
      preparedCount: plans.length,
      skippedCount: archives.length - plans.length,
      publications: plans.map((plan) =>
        toReportPublication(
          plan,
          documentsByDirectory.get(plan.destinationName),
        ),
      ),
      diagnostics,
    };
  } finally {
    await rm(stagingRoot, {recursive: true, force: true});
  }
};
