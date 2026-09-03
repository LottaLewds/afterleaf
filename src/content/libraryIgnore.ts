import {readFile} from "node:fs/promises";
import {isAbsolute, relative, resolve, sep} from "node:path";

// Name of the marker/pattern file that excludes content from library scans.
// Place an empty file with this name inside any folder to skip that folder
// entirely, or add gitignore-inspired patterns (one per line) to filter
// specific names. `*` matches any characters including `/` for simplicity.
export const LIBRARY_IGNORE_FILE_NAME = ".afterleaf-ignore";

export interface LibraryIgnorePattern {
  anchored: boolean;
  dirOnly: boolean;
  exactRegex: RegExp;
  negated: boolean;
  raw: string;
  regex: RegExp;
}

interface LibraryIgnoreScope {
  baseRel: string;
  patterns: LibraryIgnorePattern[];
}

const REGEXP_SPECIALS = new Set([".", "^", "$", "+", "{", "}", "(", ")", "|", "\\"]);

const escapeRegExpChar = (character: string) =>
  REGEXP_SPECIALS.has(character) ||
  character === "*" ||
  character === "?" ||
  character === "[" ||
  character === "]" ||
  character === "(" ||
  character === ")" ||
  character === "{" ||
  character === "}" ||
  character === "+" ||
  character === "^" ||
  character === "$" ||
  character === "." ||
  character === "|"
    ? `\\${character}`
    : character;

export const convertGlobToRegExpSource = (glob: string): string => {
  let output = "";
  let index = 0;
  while (index < glob.length) {
    const character = glob[index];
    if (character === "\\") {
      const next = glob[index + 1];
      if (next === undefined) {
        output += "\\\\";
        index += 1;
        continue;
      }
      output += escapeRegExpChar(next);
      index += 2;
      continue;
    }
    if (character === "*") {
      let end = index;
      while (glob[end] === "*") end += 1;
      output += ".*";
      index = end;
      continue;
    }
    if (character === "?") {
      output += ".";
      index += 1;
      continue;
    }
    if (character === "[") {
      let closing = -1;
      for (let scan = index + 1; scan < glob.length; scan += 1) {
        if (glob[scan] === "]" && scan > index + 1) {
          closing = scan;
          break;
        }
      }
      if (closing === -1) {
        output += "\\[";
        index += 1;
        continue;
      }
      const classContent = glob.slice(index + 1, closing);
      if (classContent.startsWith("!")) {
        const rest = classContent.slice(1).replace(/\\/gu, "\\\\");
        output += `[^${rest}]`;
      } else if (classContent.startsWith("^")) {
        const rest = classContent.slice(1).replace(/\\/gu, "\\\\");
        output += `[\\^${rest}]`;
      } else {
        output += `[${classContent.replace(/\\/gu, "\\\\")}]`;
      }
      index = closing + 1;
      continue;
    }
    if (character === undefined) break;
    output += REGEXP_SPECIALS.has(character) ? `\\${character}` : character;
    index += 1;
  }
  return output;
};

export const parseLibraryIgnoreContent = (content: string): LibraryIgnorePattern[] => {
  const patterns: LibraryIgnorePattern[] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("#")) continue;
    let negated = false;
    let body = line;
    if (body.startsWith("\\#") || body.startsWith("\\!")) {
      body = body.slice(1);
    } else if (body.startsWith("!")) {
      negated = true;
      body = body.slice(1).trim();
      if (body === "") continue;
    }
    let dirOnly = false;
    if (body.endsWith("/")) {
      dirOnly = true;
      body = body.replace(/\/+$/u, "").trim();
      if (body === "") continue;
    }
    let anchored = false;
    if (body.startsWith("/")) {
      anchored = true;
      body = body.replace(/^\/+/u, "");
      if (body === "") continue;
    } else if (body.includes("/")) {
      anchored = true;
    }
    if (body === "") continue;
    const converted = convertGlobToRegExpSource(body);
    const fullSource = anchored ? `^${converted}(?:/.*)?$` : `^(?:.*/)?${converted}(?:/.*)?$`;
    const exactSource = anchored ? `^${converted}$` : `^(?:.*/)?${converted}$`;
    try {
      patterns.push({
        anchored,
        dirOnly,
        exactRegex: new RegExp(exactSource),
        negated,
        raw: rawLine,
        regex: new RegExp(fullSource),
      });
    } catch {
      continue;
    }
  }
  return patterns;
};

export const isEmptyLibraryIgnoreContent = (content: string): boolean =>
  parseLibraryIgnoreContent(content).length === 0;

const normalizeIgnoreRel = (path: string): string => {
  let normalized = path.split("\\").join("/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  while (normalized.startsWith("/")) normalized = normalized.slice(1);
  while (normalized.endsWith("/") && normalized.length > 0) normalized = normalized.slice(0, -1);
  if (normalized === ".") return "";
  return normalized;
};

export const toLibraryIgnoreRel = (portableRelativePath: string): string => normalizeIgnoreRel(portableRelativePath);

export class LibraryIgnoreFilter {
  private markers: string[] = [];
  private scopes: LibraryIgnoreScope[] = [];

  constructor(readonly root: string) {}

  addMarker(baseRel: string) {
    const normalized = normalizeIgnoreRel(baseRel);
    if (!this.markers.includes(normalized)) this.markers.push(normalized);
  }

  addScope(baseRel: string, patterns: readonly LibraryIgnorePattern[]) {
    if (patterns.length === 0) return;
    this.scopes.push({baseRel: normalizeIgnoreRel(baseRel), patterns: [...patterns]});
  }

  isIgnored(relativePath: string, isDirectory: boolean): boolean {
    const rel = normalizeIgnoreRel(relativePath);
    if (rel === "") return this.markers.includes("");
    for (const prefix of this.markers) {
      if (prefix === "") return true;
      if (rel === prefix || rel.startsWith(`${prefix}/`)) return true;
    }
    let ignored = false;
    for (const scope of this.scopes) {
      const base = scope.baseRel;
      let relToBase: string | undefined;
      if (base === "") {
        relToBase = rel;
      } else {
        if (rel === base) continue;
        if (!rel.startsWith(`${base}/`)) continue;
        relToBase = rel.slice(base.length + 1);
      }
      if (!relToBase) continue;
      for (const pattern of scope.patterns) {
        try {
          let matched = pattern.regex.test(relToBase);
          if (matched && pattern.dirOnly && !isDirectory && pattern.exactRegex.test(relToBase)) matched = false;
          if (matched) ignored = !pattern.negated;
        } catch {
          continue;
        }
      }
    }
    return ignored;
  }
}

export const updateIgnoreFilterFromEntries = async (
  filter: LibraryIgnoreFilter,
  absoluteDirectory: string,
  baseRel: string,
  entries: readonly {name: string}[],
): Promise<boolean> => {
  if (!entries.some((entry) => entry.name === LIBRARY_IGNORE_FILE_NAME)) return false;
  let content: string;
  try {
    content = await readFile(resolve(absoluteDirectory, LIBRARY_IGNORE_FILE_NAME), "utf8");
  } catch {
    return false;
  }
  const patterns = parseLibraryIgnoreContent(content);
  if (patterns.length === 0) {
    filter.addMarker(baseRel);
    return true;
  }
  filter.addScope(baseRel, patterns);
  return false;
};

type IgnoreDirectoryCache = Map<string, {marker: boolean; patterns: LibraryIgnorePattern[]}>;

const readIgnoreDirectoryCached = async (
  absoluteDirectory: string,
  cache?: IgnoreDirectoryCache,
): Promise<{marker: boolean; patterns: LibraryIgnorePattern[]} | undefined> => {
  const key = resolve(absoluteDirectory);
  const cached = cache?.get(key);
  if (cached) return cached;
  let content: string;
  try {
    content = await readFile(resolve(key, LIBRARY_IGNORE_FILE_NAME), "utf8");
  } catch {
    return undefined;
  }
  const patterns = parseLibraryIgnoreContent(content);
  const result =
    patterns.length === 0 ? {marker: true, patterns: [] as LibraryIgnorePattern[]} : {marker: false, patterns};
  cache?.set(key, result);
  return result;
};

export const isAbsolutePathIgnoredByRoot = async (
  rootDirectory: string,
  absolutePath: string,
  isDirectory: boolean,
  cache?: IgnoreDirectoryCache,
): Promise<boolean> => {
  const root = resolve(rootDirectory);
  const candidate = resolve(absolutePath);
  const rel = relative(root, candidate).split(sep).join("/");
  const normalizedRel = normalizeIgnoreRel(rel);
  if (normalizedRel === "") {
    const rootIgnore = await readIgnoreDirectoryCached(root, cache);
    return rootIgnore?.marker === true;
  }
  if (normalizedRel.startsWith("..") || isAbsolute(normalizedRel)) return false;
  const parts = normalizedRel.split("/");
  const parentDepth = isDirectory ? parts.length : parts.length - 1;
  const filter = new LibraryIgnoreFilter(root);
  for (let depth = 0; depth <= parentDepth; depth += 1) {
    const prefix = depth === 0 ? "" : parts.slice(0, depth).join("/");
    const directory = depth === 0 ? root : resolve(root, ...parts.slice(0, depth));
    const ignore = await readIgnoreDirectoryCached(directory, cache);
    if (!ignore) continue;
    if (ignore.marker) return true;
    if (ignore.patterns.length > 0) filter.addScope(prefix, ignore.patterns);
  }
  return filter.isIgnored(normalizedRel, isDirectory);
};

export const createIgnoreDirectoryCache = (): IgnoreDirectoryCache => new Map();
