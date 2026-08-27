import {resolve} from "node:path";
import {preparedCatalogDirectory} from "~/content/dataRoot";
import {normalizeTags, parseSupportedLanguage} from "~/content/normalize";
import {prepareLocalCatalog, type ContentPrepareOptions} from "~/content/prepare";

const VALUE_OPTIONS = new Set(["language", "root", "tags"]);
const FLAG_OPTIONS = new Set(["force", "help", "write"]);

interface ParsedArguments {
  flags: Set<string>;
  values: Map<string, string>;
}

export interface ContentPrepareCliOptions {
  help: boolean;
  prepareOptions: ContentPrepareOptions;
}

const splitOption = (argument: string) => {
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex === -1) return {name: argument.slice(2), inlineValue: undefined};
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
    if (!argument?.startsWith("--")) throw new Error(`Unexpected positional argument: ${argument ?? ""}`);
    const {name, inlineValue} = splitOption(argument);
    if (FLAG_OPTIONS.has(name)) {
      if (inlineValue !== undefined) throw new Error(`--${name} does not accept a value`);
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = inlineValue ?? arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value`);
    if (inlineValue === undefined) index += 1;
    values.set(name, value);
  }
  return {flags, values};
};

const parseLanguage = (value: string | undefined) => {
  const language = parseSupportedLanguage(value ?? "english");
  if (!language) throw new Error('--language must be either "english" or "japanese"');
  return language;
};

export const parseContentPrepareCliOptions = (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): ContentPrepareCliOptions => {
  const parsed = parseArguments(arguments_);
  const help = parsed.flags.has("help");
  if (parsed.flags.has("force") && !parsed.flags.has("write"))
    throw new Error("--force is only meaningful together with --write");
  return {
    help,
    prepareOptions: {
      defaultLanguage: parseLanguage(parsed.values.get("language")),
      force: parsed.flags.has("force"),
      rootDirectory:
        parsed.values.get("root") === undefined
          ? preparedCatalogDirectory(workingDirectory)
          : resolve(workingDirectory, parsed.values.get("root") ?? ""),
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

export const CONTENT_PREPARE_HELP = `Prepare Afterleaf publication manifests for local image folders.

Usage:
  bun run content:prepare [options]

Options:
  --root <directory>       Folder containing one subfolder per publication
                           (default: game/.cache/prepared in the data folder)
  --tags <tag,tag>         Tags applied to every discovered publication
  --language <language>    Fallback for names without a language hint
                           (default: english; supports english or japanese)
  --write                  Write publication.json files (default: preview only)
  --force                  Atomically replace existing manifests with --write
  --help                   Show this help

Folder names containing English/Japanese hints override --language. Chinese and
other recognized languages are skipped. "Comic ____" date/issue suffixes are
recognized as magazine families and emitted as structured issue metadata.
`;

export const runContentPrepareCli = async (arguments_: readonly string[], workingDirectory = process.cwd()) => {
  const options = parseContentPrepareCliOptions(arguments_, workingDirectory);
  if (options.help) return undefined;
  return prepareLocalCatalog(options.prepareOptions);
};
