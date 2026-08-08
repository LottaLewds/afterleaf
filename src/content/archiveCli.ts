import {resolve} from "node:path";
import {
  importContentArchives,
  type ArchiveImportOptions,
} from "~/content/archive";
import {normalizeTags, parseSupportedLanguage} from "~/content/normalize";

const VALUE_OPTIONS = new Set(["archives", "language", "out", "tags"]);
const FLAG_OPTIONS = new Set(["force", "help", "write"]);

interface ParsedArguments {
  flags: Set<string>;
  values: Map<string, string>;
}

export interface ArchiveImportCliOptions {
  help: boolean;
  importOptions: ArchiveImportOptions;
}

const splitOption = (argument: string) => {
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex === -1)
    return {name: argument.slice(2), inlineValue: undefined};
  return {
    name: argument.slice(2, equalsIndex),
    inlineValue: argument.slice(equalsIndex + 1),
  };
};

const parseArguments = (arguments_: readonly string[]): ParsedArguments => {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith("--"))
      throw new Error(`Unexpected positional argument: ${argument ?? ""}`);
    const {name, inlineValue} = splitOption(argument);
    if (FLAG_OPTIONS.has(name)) {
      if (inlineValue !== undefined)
        throw new Error(`--${name} does not accept a value`);
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = inlineValue ?? arguments_[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`--${name} requires a value`);
    if (inlineValue === undefined) index += 1;
    values.set(name, value);
  }
  return {flags, values};
};

const parseLanguage = (value: string | undefined) => {
  const language = parseSupportedLanguage(value ?? "english");
  if (!language)
    throw new Error('--language must be either "english" or "japanese"');
  return language;
};

export const parseArchiveImportCliOptions = (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): ArchiveImportCliOptions => {
  const parsed = parseArguments(arguments_);
  const help = parsed.flags.has("help");
  if (parsed.flags.has("force") && !parsed.flags.has("write"))
    throw new Error("--force is only meaningful together with --write");
  return {
    help,
    importOptions: {
      archivesDirectory: resolve(
        workingDirectory,
        parsed.values.get("archives") ?? "content/books",
      ),
      defaultLanguage: parseLanguage(parsed.values.get("language")),
      force: parsed.flags.has("force"),
      outputDirectory: resolve(
        workingDirectory,
        parsed.values.get("out") ?? "content-sources/catalog",
      ),
      tags: normalizeTags(
        parsed.values
          .get("tags")
          ?.split(",")
          .map((tag) => tag.trim()) ?? [],
      ),
      write: parsed.flags.has("write"),
    },
  };
};

export const ARCHIVE_IMPORT_HELP = `Import CBZ/ZIP/CBR/RAR publications into an Afterleaf local catalog.

Usage:
  bun run content:import-cbz [options]

Options:
  --archives <directory>   Folder containing CBZ/ZIP/CBR/RAR files and optional
                           comics/ and manga/ directive subdirectories
                           (default: content/books)
  --out <directory>        Prepared local-catalog destination
                           (default: content-sources/catalog)
  --tags <tag,tag>         Tags applied to every imported publication
  --language <language>    Fallback for names without a language hint
                           (default: english; supports english or japanese)
  --write                  Write thin manifests/shelf sources (default: preflight only)
  --force                  Atomically replace colliding publications with --write
  --help                   Show this help

Each archive becomes one publication folder. The importer preflights encryption,
paths, entry counts, sizes, compression ratios, methods, and duplicate names;
generates front/back shelf sources without unpacking reader pages; and commits
through a staging directory. Language and Comic-issue inference use archive names;
reading direction comes only from comics/manga directories or explicit filename
hints.
`;

export const runArchiveImportCli = async (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
) => {
  const options = parseArchiveImportCliOptions(arguments_, workingDirectory);
  if (options.help) return undefined;
  return importContentArchives(options.importOptions);
};
