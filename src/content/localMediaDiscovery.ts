import {readdir} from "node:fs/promises";
import {extname, relative, resolve, sep} from "node:path";
import {isContentArchivePath} from "~/content/archiveReader";

export const LOCAL_PUBLICATION_MANIFEST = "publication.json";

const IMAGE_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);

export interface LocalMediaDiscoveryDiagnostic {
  code: "ignored-container-images" | "shadowed-manifest" | "skipped-symlink";
  path: string;
}

export interface LocalMediaDiscoveryResult {
  archives: string[];
  diagnostics: LocalMediaDiscoveryDiagnostic[];
  publicationDirectories: string[];
}

interface DirectoryNode {
  archives: string[];
  childDirectories: string[];
  directImageCount: number;
  hasManifest: boolean;
}

interface DirectoryResult {
  archives: string[];
  hasManifest: boolean;
  publicationDirectories: string[];
}

const NATURAL_COLLATOR = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

const toPortablePath = (path: string) => path.split(sep).join("/");

export const discoverLocalMedia = async (
  rootDirectory: string,
): Promise<LocalMediaDiscoveryResult> => {
  const root = resolve(rootDirectory);
  const diagnostics: LocalMediaDiscoveryDiagnostic[] = [];
  const nodes = new Map<string, DirectoryNode>();
  const results = new Map<string, DirectoryResult>();
  const pending: Array<{directory: string; visited: boolean}> = [
    {directory: root, visited: false},
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    if (!current.visited) {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await readdir(current.directory, {withFileTypes: true});
      } catch (error) {
        // Roots may not exist yet on a fresh install; they are simply empty.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      entries.sort((left, right) =>
        NATURAL_COLLATOR.compare(left.name, right.name),
      );
      const childDirectories: string[] = [];
      const archives: string[] = [];
      let directImageCount = 0;
      let hasManifest = false;

      for (const entry of entries) {
        const path = resolve(current.directory, entry.name);
        if (entry.isSymbolicLink()) {
          diagnostics.push({
            code: "skipped-symlink",
            path: toPortablePath(relative(root, path)),
          });
          continue;
        }
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")) childDirectories.push(path);
          continue;
        }
        if (!entry.isFile()) continue;
        if (entry.name === LOCAL_PUBLICATION_MANIFEST) {
          hasManifest = true;
          continue;
        }
        if (isContentArchivePath(entry.name)) {
          archives.push(path);
          continue;
        }
        if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
          directImageCount += 1;
      }

      nodes.set(current.directory, {
        archives,
        childDirectories,
        directImageCount,
        hasManifest,
      });
      pending.push({directory: current.directory, visited: true});
      for (let index = childDirectories.length - 1; index >= 0; index -= 1) {
        const directory = childDirectories[index];
        if (directory) pending.push({directory, visited: false});
      }
      continue;
    }

    const node = nodes.get(current.directory);
    if (!node) continue;
    const childResults = node.childDirectories.flatMap((directory) => {
      const result = results.get(directory);
      return result ? [result] : [];
    });
    const descendantArchives = childResults.flatMap(({archives}) => archives);
    const descendantPublications = childResults.flatMap(
      ({publicationDirectories}) => publicationDirectories,
    );
    const hasDescendantManifest = childResults.some(
      ({hasManifest}) => hasManifest,
    );
    const archives = [...node.archives, ...descendantArchives];
    const hasDescendantMedia =
      archives.length > 0 || descendantPublications.length > 0;
    let publicationDirectories: string[];

    if (node.hasManifest && !hasDescendantManifest && archives.length === 0) {
      publicationDirectories = [current.directory];
    } else if (hasDescendantMedia) {
      publicationDirectories = descendantPublications;
      if (node.directImageCount > 0)
        diagnostics.push({
          code: "ignored-container-images",
          path: toPortablePath(relative(root, current.directory) || "."),
        });
      if (node.hasManifest)
        diagnostics.push({
          code: "shadowed-manifest",
          path: toPortablePath(
            relative(
              root,
              resolve(current.directory, LOCAL_PUBLICATION_MANIFEST),
            ),
          ),
        });
    } else if (node.directImageCount > 0) {
      publicationDirectories = [current.directory];
    } else {
      publicationDirectories = [];
    }

    results.set(current.directory, {
      archives,
      hasManifest: node.hasManifest || hasDescendantManifest,
      publicationDirectories,
    });
  }

  const result = results.get(root);
  return {
    archives:
      result?.archives.toSorted((left, right) =>
        NATURAL_COLLATOR.compare(
          toPortablePath(relative(root, left)),
          toPortablePath(relative(root, right)),
        ),
      ) ?? [],
    diagnostics,
    publicationDirectories:
      result?.publicationDirectories.toSorted((left, right) =>
        NATURAL_COLLATOR.compare(
          toPortablePath(relative(root, left)),
          toPortablePath(relative(root, right)),
        ),
      ) ?? [],
  };
};
