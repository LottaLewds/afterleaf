import {lstat, readdir, realpath} from "node:fs/promises";
import {basename, extname, relative, resolve, sep} from "node:path";

import type {ModelAsset} from "~/models/protocol";

export type ModelMediaUrlBuilder = (modelId: string) => string;

export type DiscoveredModel = ModelAsset & {
  filePath: string;
};

const compareNames = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const modelLabel = (id: string) =>
  basename(id, extname(id))
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

const modelFilesIn = async (
  rootDirectory: string,
  directory = rootDirectory,
): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    compareNames(left.name, right.name),
  )) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await modelFilesIn(rootDirectory, entryPath)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".glb")
      files.push(entryPath);
  }
  return files;
};

export const discoverModels = async (
  modelDirectories: readonly string[],
  mediaUrl: ModelMediaUrlBuilder,
): Promise<readonly DiscoveredModel[]> => {
  const discovered: DiscoveredModel[] = [];
  const modelIds = new Set<string>();
  for (const modelDirectory of modelDirectories) {
    const root = resolve(modelDirectory);
    for (const filePath of await modelFilesIn(root)) {
      try {
        const file = await lstat(filePath);
        if (!file.isFile() || file.isSymbolicLink() || file.size <= 0) continue;
        const id = relative(root, filePath).split(sep).join("/");
        if (modelIds.has(id)) continue;
        const label = modelLabel(id);
        if (!label) continue;
        modelIds.add(id);
        discovered.push({filePath, id, label, url: mediaUrl(id)});
      } catch {
        continue;
      }
    }
  }
  return discovered;
};

export const resolveModelPath = async (
  modelDirectories: readonly string[],
  modelId: string,
) => {
  if (extname(modelId).toLowerCase() !== ".glb") return;
  for (const modelDirectory of modelDirectories) {
    const root = resolve(modelDirectory);
    const candidate = resolve(root, ...modelId.split("/"));
    const candidateRelativePath = relative(root, candidate);
    if (
      candidateRelativePath.length === 0 ||
      candidateRelativePath.startsWith("..") ||
      resolve(root, candidateRelativePath) !== candidate
    )
      continue;
    try {
      const [realRoot, realCandidate] = await Promise.all([
        realpath(root),
        realpath(candidate),
      ]);
      const realCandidateRelativePath = relative(realRoot, realCandidate);
      if (
        realCandidateRelativePath.length === 0 ||
        realCandidateRelativePath.startsWith("..") ||
        resolve(realRoot, realCandidateRelativePath) !== realCandidate
      )
        continue;
      const file = await lstat(candidate);
      if (!file.isFile() || file.isSymbolicLink() || file.size <= 0) continue;
      return candidate;
    } catch {
      continue;
    }
  }
};
