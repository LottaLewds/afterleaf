import {createHash, randomUUID} from "node:crypto";
import {access, mkdir, readFile, readdir, rename, rm, writeFile} from "node:fs/promises";
import {basename, dirname, extname, relative, resolve, sep} from "node:path";
import {discoverLocalMedia} from "~/content/localMediaDiscovery";
import {normalizeTag, normalizeTags} from "~/content/normalize";
import {
  CONTENT_SCHEMA_VERSION,
  type LocalPublicationDocument,
  type PublicationIssue,
  type PublicationKind,
  type SupportedLanguage,
} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";

const VALID_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const IMAGE_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const FRONT_FILE_NAMES = new Set(["cover", "folder", "front"]);
const BACK_FILE_NAMES = new Set(["back", "rear"]);
const SPINE_FILE_NAMES = new Set(["spine"]);
const NATURAL_COLLATOR = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

const LANGUAGE_HINTS: readonly {
  label: string;
  language?: SupportedLanguage;
  pattern: RegExp;
}[] = [
  {
    label: "Chinese",
    pattern: /(?:[[(]\s*(?:chinese|中文|汉化|漢化)\s*[\])]|(?:chinese|中文|汉化|漢化)\s*$)/iu,
  },
  {
    label: "Korean",
    pattern: /(?:[[(]\s*(?:korean|한국어|한글)\s*[\])]|(?:korean|한국어|한글)\s*$)/iu,
  },
  {
    label: "other language",
    pattern:
      /(?:[[(]\s*(?:french|german|italian|portuguese|russian|spanish)\s*[\])]|(?:french|german|italian|portuguese|russian|spanish)\s*$)/iu,
  },
  {
    label: "Japanese",
    language: "japanese",
    pattern: /(?:[[(]\s*(?:japanese|日本語)\s*[\])]|(?:japanese|日本語)\s*$)/iu,
  },
  {
    label: "English",
    language: "english",
    pattern:
      /(?:[[(]\s*(?:english|eng(?:lish)?[ ._-]*translated)\s*[\])]|(?:english|eng(?:lish)?[ ._-]*translated)\s*$)/iu,
  },
];
const READING_DIRECTION_HINTS = [
  {
    direction: "ltr",
    pattern: /(?:[[(]\s*(?:ltr|left[ ._-]*to[ ._-]*right)\s*[\])]|(?:ltr|left[ ._-]*to[ ._-]*right)\s*$)/iu,
  },
  {
    direction: "rtl",
    pattern: /(?:[[(]\s*(?:rtl|right[ ._-]*to[ ._-]*left)\s*[\])]|(?:rtl|right[ ._-]*to[ ._-]*left)\s*$)/iu,
  },
] as const;

const LANGUAGE_ANNOTATION_PATTERN =
  /[[(]\s*(?:chinese|english(?:[ ._-]*translated)?|french|german|italian|japanese|korean|left[ ._-]*to[ ._-]*right|ltr|portuguese|right[ ._-]*to[ ._-]*left|rtl|russian|spanish|中文|日本語|한국어)\s*[\])]/giu;
const YEAR_MONTH_COMIC_PATTERN =
  /^(?<group>comic\s+.+?)[\s._/-]+(?<year>(?:19|20)\d{2})(?:\s*[-._/年]\s*|\s+)(?<month>0?[1-9]|1[0-2])(?:\s*月)?(?:\s*号)?$/iu;
const NUMBERED_COMIC_PATTERN =
  /^(?<group>comic\s+.+?)(?:[\s._-]+(?:(?:issue|no\.?|vol(?:ume)?)\s*)?)(?<number>\d{1,4})$/iu;
const EDGE_BRACKET_GROUPS_PATTERN = /^(?:\s*\[[^\]]+\])+|(?:\s*\[[^\]]+\])+\s*$/gu;

export interface PreparedPublicationIdentity {
  groupId?: string;
  issue?: PublicationIssue;
  kind?: PublicationKind;
  title: string;
  tags: string[];
}

export interface ContentPrepareDiagnostic {
  code:
    | "conflicting-reading-direction"
    | "existing-manifest"
    | "ignored-container-images"
    | "inferred-magazine"
    | "missing-tags"
    | "no-images"
    | "processing-failed"
    | "shadowed-manifest"
    | "skipped-language"
    | "skipped-symlink";
  directory: string;
  message: string;
}

export interface ContentPrepareOptions {
  defaultLanguage: SupportedLanguage;
  force: boolean;
  readingDirection?: "ltr" | "rtl";
  rootDirectory: string;
  refreshExisting?: boolean;
  tags: string[];
  write: boolean;
}

export interface PreparedPublication {
  directory: string;
  manifestPath: string;
  document: LocalPublicationDocument;
}

export interface ContentPrepareReport {
  rootDirectory: string;
  wroteManifests: boolean;
  preparedCount: number;
  skippedCount: number;
  publications: PreparedPublication[];
  diagnostics: ContentPrepareDiagnostic[];
}

const toPortablePath = (path: string) => path.split(sep).join("/");

const fileExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const prettifyDirectoryName = (directoryName: string) =>
  directoryName
    .normalize("NFKC")
    .replace(LANGUAGE_ANNOTATION_PATTERN, " ")
    .replace(/_/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const parseComicIssue = (title: string) => {
  const undecoratedTitle = title.replace(EDGE_BRACKET_GROUPS_PATTERN, "").trim();
  const comicIndex = undecoratedTitle.search(/\bcomic\s+/iu);
  const candidateTitle = comicIndex < 0 ? undecoratedTitle : undecoratedTitle.slice(comicIndex);
  const datedMatch = YEAR_MONTH_COMIC_PATTERN.exec(candidateTitle);
  if (datedMatch?.groups) {
    const group = datedMatch.groups.group?.trim();
    const year = Number(datedMatch.groups.year);
    const month = Number(datedMatch.groups.month);
    if (group && Number.isSafeInteger(year) && Number.isSafeInteger(month))
      return {group, issue: {year, month} satisfies PublicationIssue};
  }

  const numberedMatch = NUMBERED_COMIC_PATTERN.exec(candidateTitle);
  if (!numberedMatch?.groups) return undefined;
  const group = numberedMatch.groups.group?.trim();
  const value = Number(numberedMatch.groups.number);
  if (!group || !Number.isSafeInteger(value)) return undefined;
  const issue: PublicationIssue = value >= 1900 && value <= 2200 ? {year: value} : {number: value};
  return {group, issue};
};

export const inferPreparedPublicationIdentity = (
  directoryName: string,
  baseTags: readonly string[],
): PreparedPublicationIdentity => {
  const title = prettifyDirectoryName(directoryName);
  const comicIssue = parseComicIssue(title);
  if (!comicIssue) return {title, tags: normalizeTags(baseTags)};
  const groupId = normalizeTag(comicIssue.group);
  return {
    groupId,
    issue: comicIssue.issue,
    kind: "magazine",
    title,
    tags: normalizeTags([...baseTags, "magazine", groupId]),
  };
};

export const detectPreparedPublicationLanguage = (directoryName: string, defaultLanguage: SupportedLanguage) => {
  const hint = LANGUAGE_HINTS.find((candidate) => candidate.pattern.test(directoryName));
  if (!hint) return {language: defaultLanguage};
  if (hint.language) return {language: hint.language};
  return {unsupportedLabel: hint.label};
};

export const detectPreparedPublicationReadingDirection = (directoryName: string) =>
  READING_DIRECTION_HINTS.find((hint) => hint.pattern.test(directoryName))?.direction;

const findImages = async (publicationDirectory: string, diagnostics: ContentPrepareDiagnostic[]) => {
  const pendingDirectories = [publicationDirectory];
  const paths: string[] = [];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) break;
    const entries = await readdir(directory, {withFileTypes: true});
    entries.sort((left, right) => NATURAL_COLLATOR.compare(left.name, right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        diagnostics.push({
          code: "skipped-symlink",
          directory: toPortablePath(relative(publicationDirectory, dirname(path))),
          message: `Skipped symbolic link ${toPortablePath(relative(publicationDirectory, path))}`,
        });
        continue;
      }
      if (entry.isDirectory()) {
        pendingDirectories.push(path);
        continue;
      }
      if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) paths.push(path);
    }
  }

  return paths.sort((left, right) =>
    NATURAL_COLLATOR.compare(
      toPortablePath(relative(publicationDirectory, left)),
      toPortablePath(relative(publicationDirectory, right)),
    ),
  );
};

const findNamedImage = (paths: readonly string[], names: ReadonlySet<string>) =>
  paths.find((path) => names.has(basename(path, extname(path)).toLowerCase()));

const createDocument = (
  publicationDirectory: string,
  images: readonly string[],
  language: SupportedLanguage,
  readingDirection: "ltr" | "rtl" | undefined,
  identity: PreparedPublicationIdentity,
): LocalPublicationDocument => {
  const front = findNamedImage(images, FRONT_FILE_NAMES);
  const back = findNamedImage(images, BACK_FILE_NAMES);
  const spine = findNamedImage(images, SPINE_FILE_NAMES);
  const pageImages = images.filter((path) => path !== back && path !== spine);
  const toRelativeAsset = (path: string) => toPortablePath(relative(publicationDirectory, path));
  let id = normalizeTag(identity.title);
  if (!id || !VALID_ID_PATTERN.test(id)) {
    const fallbackHash = createHash("sha256").update(publicationDirectory).digest("hex").slice(0, 10);
    id = `untitled-${fallbackHash}`;
  }
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id,
    ...(identity.groupId === undefined ? {} : {groupId: identity.groupId}),
    ...(identity.issue === undefined ? {} : {issue: identity.issue}),
    ...(identity.kind === undefined ? {} : {kind: identity.kind}),
    title: identity.title,
    language,
    tags: identity.tags.length === 0 ? ["unclassified"] : identity.tags,
    assets: {
      pages: pageImages.map(toRelativeAsset),
      ...(front === undefined ? {} : {front: toRelativeAsset(front)}),
      ...(back === undefined ? {} : {back: toRelativeAsset(back)}),
      ...(spine === undefined ? {} : {spine: toRelativeAsset(spine)}),
    },
    ...(readingDirection === undefined ? {} : {physical: {readingDirection}}),
  };
};

const writeManifestAtomically = async (manifestPath: string, document: LocalPublicationDocument) => {
  const temporaryPath = `${manifestPath}.staging-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
    flag: "wx",
  });
  try {
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, {force: true});
    throw error;
  }
};

export const prepareLocalCatalog = async (options: ContentPrepareOptions): Promise<ContentPrepareReport> => {
  const rootDirectory = resolve(options.rootDirectory);
  const diagnostics: ContentPrepareDiagnostic[] = [];
  const publications: PreparedPublication[] = [];
  let skippedCount = 0;
  const discovery = await discoverLocalMedia(rootDirectory);
  diagnostics.push(
    ...discovery.diagnostics.map((diagnostic) => {
      let message = `Skipped symbolic link ${diagnostic.path}`;
      if (diagnostic.code === "ignored-container-images")
        message = `Ignored loose images in organizational directory ${diagnostic.path} because it contains nested publications`;
      else if (diagnostic.code === "shadowed-manifest")
        message = `Ignored outer manifest ${diagnostic.path} because nested publication manifests take precedence`;
      return {code: diagnostic.code, directory: diagnostic.path, message};
    }),
  );
  const publicationDirectories = discovery.publicationDirectories;
  const claimedPublicationIds = new Set<string>();
  for (const publicationDirectory of publicationDirectories) {
    const manifestPath = resolve(publicationDirectory, "publication.json");
    if (!(await fileExists(manifestPath))) continue;
    try {
      claimedPublicationIds.add(
        parseLocalPublicationDocument(JSON.parse(await readFile(manifestPath, "utf8")) as unknown, manifestPath).id,
      );
    } catch {
      continue;
    }
  }

  const processPublicationDirectory = async (publicationDirectory: string, portableDirectory: string) => {
    const manifestPath = resolve(publicationDirectory, "publication.json");
    const manifestExists = await fileExists(manifestPath);
    if (manifestExists && !options.force && !options.refreshExisting) {
      skippedCount += 1;
      diagnostics.push({
        code: "existing-manifest",
        directory: portableDirectory,
        message: `Skipped existing manifest in ${portableDirectory}; pass --force to replace it`,
      });
      return;
    }
    const detectedLanguage = detectPreparedPublicationLanguage(basename(publicationDirectory), options.defaultLanguage);
    if (!detectedLanguage.language) {
      skippedCount += 1;
      diagnostics.push({
        code: "skipped-language",
        directory: portableDirectory,
        message: `Skipped ${portableDirectory} because its name indicates ${detectedLanguage.unsupportedLabel ?? "an unsupported language"}`,
      });
      return;
    }
    const images = await findImages(publicationDirectory, diagnostics);
    const usablePages = images.filter((path) => {
      const name = basename(path, extname(path)).toLowerCase();
      return !BACK_FILE_NAMES.has(name) && !SPINE_FILE_NAMES.has(name);
    });
    if (usablePages.length === 0) {
      skippedCount += 1;
      diagnostics.push({
        code: "no-images",
        directory: portableDirectory,
        message: `Skipped ${portableDirectory} because it contains no supported page images`,
      });
      return;
    }
    const identity = inferPreparedPublicationIdentity(basename(publicationDirectory), options.tags);
    if (identity.kind === "magazine")
      diagnostics.push({
        code: "inferred-magazine",
        directory: portableDirectory,
        message: `Inferred magazine family ${JSON.stringify(identity.groupId)} and issue ${JSON.stringify(identity.issue)}`,
      });
    if (identity.tags.length === 0)
      diagnostics.push({
        code: "missing-tags",
        directory: portableDirectory,
        message: `Assigned the fallback tag "unclassified" to ${portableDirectory}`,
      });
    const filenameReadingDirection = detectPreparedPublicationReadingDirection(basename(publicationDirectory));
    if (
      options.readingDirection !== undefined &&
      filenameReadingDirection !== undefined &&
      options.readingDirection !== filenameReadingDirection
    ) {
      skippedCount += 1;
      diagnostics.push({
        code: "conflicting-reading-direction",
        directory: portableDirectory,
        message: `Skipped ${portableDirectory} because its configured and filename reading-direction directives conflict`,
      });
      return;
    }
    const readingDirection = filenameReadingDirection ?? options.readingDirection;
    let document = createDocument(publicationDirectory, images, detectedLanguage.language, readingDirection, identity);
    if (!manifestExists) {
      if (claimedPublicationIds.has(document.id)) {
        const suffix = createHash("sha256").update(publicationDirectory).digest("hex").slice(0, 10);
        document.id = `${document.id.slice(0, 189)}-${suffix}`;
      }
      claimedPublicationIds.add(document.id);
    }
    if (manifestExists && options.refreshExisting && !options.force) {
      const existingDocument = parseLocalPublicationDocument(
        JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
        manifestPath,
      );
      if (existingDocument.source) {
        skippedCount += 1;
        diagnostics.push({
          code: "existing-manifest",
          directory: portableDirectory,
          message: `Skipped provider-managed manifest in ${portableDirectory}`,
        });
        return;
      }
      const readingDirectionChanged =
        existingDocument.physical?.readingDirection !== document.physical?.readingDirection;
      if (JSON.stringify(existingDocument.assets) === JSON.stringify(document.assets) && !readingDirectionChanged) {
        skippedCount += 1;
        diagnostics.push({
          code: "existing-manifest",
          directory: portableDirectory,
          message: `Skipped unchanged manifest in ${portableDirectory}`,
        });
        return;
      }
      const physical = {...(existingDocument.physical ?? {})};
      if (document.physical?.readingDirection === undefined) delete physical.readingDirection;
      else physical.readingDirection = document.physical.readingDirection;
      const {physical: _physical, ...existingDocumentWithoutPhysical} = existingDocument;
      document = {
        ...existingDocumentWithoutPhysical,
        assets: document.assets,
        ...(Object.keys(physical).length === 0 ? {} : {physical}),
      };
    }
    if (options.write) {
      if (manifestExists && (options.force || options.refreshExisting)) {
        const backupPath = `${manifestPath}.backup-${randomUUID()}`;
        await rename(manifestPath, backupPath);
        try {
          await writeManifestAtomically(manifestPath, document);
          await rm(backupPath, {force: true});
        } catch (error) {
          if (await fileExists(manifestPath)) await rm(manifestPath, {force: true});
          await rename(backupPath, manifestPath);
          throw error;
        }
      } else {
        try {
          await mkdir(dirname(manifestPath), {recursive: true});
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
        await writeManifestAtomically(manifestPath, document);
      }
    }
    publications.push({
      directory: portableDirectory,
      manifestPath,
      document,
    });
  };

  for (const publicationDirectory of publicationDirectories) {
    const portableDirectory = toPortablePath(relative(rootDirectory, publicationDirectory) || ".");
    try {
      await processPublicationDirectory(publicationDirectory, portableDirectory);
    } catch (error) {
      skippedCount += 1;
      diagnostics.push({
        code: "processing-failed",
        directory: portableDirectory,
        message: `Failed to process ${portableDirectory}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    rootDirectory,
    wroteManifests: options.write,
    preparedCount: publications.length,
    skippedCount,
    publications,
    diagnostics,
  };
};
