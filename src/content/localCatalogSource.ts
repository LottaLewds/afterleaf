import {readdir, readFile} from "node:fs/promises";
import {dirname, relative, resolve, sep} from "node:path";
import {createHash} from "node:crypto";
import {
  type ContentSeedDiagnostic,
  type PublicationCandidate,
  type PublicationMaterial,
  type PublicationSearchQuery,
  type PublicationSource,
  type PublicationSourceReference,
} from "~/content/schema";
import {
  languagePriority,
  normalizeTags,
  parseSupportedLanguage,
} from "~/content/normalize";
import {associatePublicationAlternates} from "~/content/publicationAlternates";
import {
  parseLocalPublicationDocument,
  resolveContainedPath,
} from "~/content/validation";

const MANIFEST_FILE_NAME = "publication.json";

interface LocalCatalogEntry {
  candidate: PublicationCandidate;
  material: PublicationMaterial;
  reference: PublicationSourceReference;
}

interface LocalCatalogRoot {
  directory: string;
  sourcePrefix: string;
}

interface LocalManifestPath {
  manifestPath: string;
  root: LocalCatalogRoot;
}

export interface LocalCatalogSourceOptions {
  excludedPublicationIds?: ReadonlySet<string>;
  requiresLanguageTag?: (providerId: string) => boolean;
}

const toPortablePath = (path: string) => path.split(sep).join("/");

const matchesQuery = (
  candidate: PublicationCandidate,
  query: PublicationSearchQuery,
) => {
  if (!query.languages.includes(candidate.language)) return false;
  if (query.excludedTags.some((tag) => candidate.normalizedTags.includes(tag)))
    return false;
  if (query.tags.length === 0) return true;
  if (query.match === "all")
    return query.tags.every((tag) => candidate.normalizedTags.includes(tag));
  return query.tags.some((tag) => candidate.normalizedTags.includes(tag));
};

const seededRank = (seed: string, id: string) =>
  createHash("sha256").update(seed).update("\0").update(id).digest("hex");

const resolveMaterial = (
  sourceDirectory: string,
  assets: PublicationCandidate["document"]["assets"],
): PublicationMaterial => ({
  pages: assets.pages.map((page) =>
    resolveContainedPath(sourceDirectory, page),
  ),
  ...(assets.front === undefined
    ? {}
    : {front: resolveContainedPath(sourceDirectory, assets.front)}),
  ...(assets.back === undefined
    ? {}
    : {back: resolveContainedPath(sourceDirectory, assets.back)}),
  ...(assets.spine === undefined
    ? {}
    : {spine: resolveContainedPath(sourceDirectory, assets.spine)}),
});

export class LocalCatalogSource implements PublicationSource {
  readonly name = "local-catalog";
  diagnostics: readonly ContentSeedDiagnostic[] = [];

  readonly #catalogRoots: readonly LocalCatalogRoot[];
  readonly #excludedPublicationIds: ReadonlySet<string>;
  readonly #requiresLanguageTag: ((providerId: string) => boolean) | undefined;
  #entries = new Map<string, LocalCatalogEntry>();

  constructor(
    catalogDirectory: string | readonly string[],
    options: LocalCatalogSourceOptions = {},
  ) {
    const catalogDirectories = Array.isArray(catalogDirectory)
      ? catalogDirectory
      : [catalogDirectory];
    this.#catalogRoots = [
      ...new Set(catalogDirectories.map((directory) => resolve(directory))),
    ].map((directory, index) => ({
      directory,
      sourcePrefix: index === 0 ? "" : `@media-${index}/`,
    }));
    this.#excludedPublicationIds =
      options.excludedPublicationIds ?? new Set<string>();
    this.#requiresLanguageTag = options.requiresLanguageTag;
  }

  async search(
    query: PublicationSearchQuery,
  ): Promise<PublicationSourceReference[]> {
    const diagnostics: ContentSeedDiagnostic[] = [];
    const entries = await this.#loadEntries(diagnostics);
    const idCounts = new Map<string, number>();

    for (const entry of entries)
      idCounts.set(
        entry.candidate.document.id,
        (idCounts.get(entry.candidate.document.id) ?? 0) + 1,
      );

    const uniqueEntries = entries.filter((entry) => {
      const id = entry.candidate.document.id;
      if (this.#excludedPublicationIds.has(id)) return false;
      if (idCounts.get(id) === 1) return true;
      diagnostics.push({
        code: "duplicate-id",
        sourceId: entry.reference.sourceId,
        message: `Skipped duplicate publication ID ${JSON.stringify(id)}`,
      });
      return false;
    });

    const canonicalEntries = associatePublicationAlternates(
      uniqueEntries,
      diagnostics,
    );
    const matchedEntries = canonicalEntries
      .filter((entry) => matchesQuery(entry.candidate, query))
      .sort((left, right) => {
        const languageDifference =
          languagePriority(left.candidate.language) -
          languagePriority(right.candidate.language);
        if (languageDifference !== 0) return languageDifference;
        const rankDifference = seededRank(
          query.seed,
          left.candidate.document.id,
        ).localeCompare(seededRank(query.seed, right.candidate.document.id));
        if (rankDifference !== 0) return rankDifference;
        return left.candidate.document.id.localeCompare(
          right.candidate.document.id,
        );
      });

    this.#entries = new Map(
      matchedEntries.map((entry) => [entry.reference.sourceId, entry]),
    );
    this.diagnostics = diagnostics;
    return matchedEntries.map((entry) => entry.reference);
  }

  async getMetadata(
    reference: PublicationSourceReference,
  ): Promise<PublicationCandidate> {
    return this.#getEntry(reference).candidate;
  }

  async materialize(
    reference: PublicationSourceReference,
  ): Promise<PublicationMaterial> {
    return this.#getEntry(reference).material;
  }

  #getEntry(reference: PublicationSourceReference) {
    const entry = this.#entries.get(reference.sourceId);
    if (!entry)
      throw new Error(
        `Unknown local-catalog source reference: ${reference.sourceId}`,
      );
    return entry;
  }

  async #loadEntries(diagnostics: ContentSeedDiagnostic[]) {
    const manifestPaths = await this.#findManifestPaths(diagnostics);
    const entries: LocalCatalogEntry[] = [];

    for (const {manifestPath, root} of manifestPaths) {
      const sourceDirectory = dirname(manifestPath);
      const sourceId = `${root.sourcePrefix}${toPortablePath(
        relative(root.directory, sourceDirectory),
      )}`;
      try {
        const rawDocument: unknown = JSON.parse(
          await readFile(manifestPath, "utf8"),
        );
        const document = parseLocalPublicationDocument(
          rawDocument,
          toPortablePath(relative(root.directory, manifestPath)),
        );
        const language = parseSupportedLanguage(document.language);
        if (!language) {
          diagnostics.push({
            code: "unsupported-language",
            sourceId,
            message: `Skipped ${JSON.stringify(document.id)} with unsupported language ${JSON.stringify(document.language)}`,
          });
          continue;
        }
        const normalizedTags = normalizeTags(document.tags);
        if (
          document.source !== undefined &&
          this.#requiresLanguageTag?.(document.source.provider) === true &&
          !normalizedTags.includes(language)
        ) {
          diagnostics.push({
            code: "unsupported-language",
            sourceId,
            message: `Skipped ${JSON.stringify(document.id)} because its remote source tags do not include ${JSON.stringify(language)}`,
          });
          continue;
        }
        const candidate: PublicationCandidate = {
          document,
          language,
          normalizedTags,
          sourceDirectory,
        };
        entries.push({
          candidate,
          material: resolveMaterial(sourceDirectory, document.assets),
          reference: {sourceId},
        });
      } catch (error) {
        diagnostics.push({
          code: "invalid-manifest",
          sourceId,
          message: `Skipped ${sourceId}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return entries;
  }

  async #findManifestPaths(diagnostics: ContentSeedDiagnostic[]) {
    const pendingDirectories = this.#catalogRoots.map((root) => ({
      directory: root.directory,
      root,
    }));
    const manifestPaths: LocalManifestPath[] = [];

    while (pendingDirectories.length > 0) {
      const pending = pendingDirectories.pop();
      if (!pending) break;
      const entries = await readdir(pending.directory, {withFileTypes: true});
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const path = resolve(pending.directory, entry.name);
        if (entry.isSymbolicLink()) {
          diagnostics.push({
            code: "skipped-symlink",
            sourceId: `${pending.root.sourcePrefix}${toPortablePath(relative(pending.root.directory, path))}`,
            message: `Skipped symbolic link ${toPortablePath(relative(pending.root.directory, path))}`,
          });
          continue;
        }
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          pendingDirectories.push({directory: path, root: pending.root});
          continue;
        }
        if (entry.isFile() && entry.name === MANIFEST_FILE_NAME)
          manifestPaths.push({manifestPath: path, root: pending.root});
      }
    }

    return manifestPaths.sort((left, right) =>
      left.manifestPath.localeCompare(right.manifestPath),
    );
  }
}
