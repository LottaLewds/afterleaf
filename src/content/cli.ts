import {basename, resolve} from "node:path";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {
  normalizeTag,
  normalizeTags,
  parseSupportedLanguage,
} from "~/content/normalize";
import {
  type MatchMode,
  type SeedContentPackOptions,
  type SupportedLanguage,
} from "~/content/schema";
import {seedContentPack} from "~/content/seed";

const VALUE_OPTIONS = new Set([
  "catalog",
  "exclude-tags",
  "languages",
  "limit",
  "match",
  "out",
  "pack-id",
  "seed",
  "source",
  "tags",
]);
const FLAG_OPTIONS = new Set(["dry-run", "force", "help"]);

interface ParsedArguments {
  flags: Set<string>;
  values: Map<string, string>;
}

export interface ContentSeedCliOptions {
  catalogDirectory: string;
  help: boolean;
  seedOptions: SeedContentPackOptions;
  source: "local-catalog";
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

const parseCommaSeparated = (value: string | undefined) =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

const parseLanguages = (value: string | undefined): SupportedLanguage[] => {
  const requested = parseCommaSeparated(value ?? "english,japanese");
  const languages = requested.map((language) => {
    const supported = parseSupportedLanguage(language);
    if (!supported)
      throw new Error(
        `Unsupported --languages value ${JSON.stringify(language)}; expected english or japanese`,
      );
    return supported;
  });
  return [...new Set(languages)];
};

const parseLimit = (value: string | undefined) => {
  const limit = Number(value ?? "20");
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new Error("--limit must be a positive integer");
  return limit;
};

const parseMatch = (value: string | undefined): MatchMode => {
  const match = value ?? "all";
  if (match !== "all" && match !== "any")
    throw new Error('--match must be either "all" or "any"');
  return match;
};

const parsePackId = (value: string | undefined, outputDirectory: string) => {
  const packId = value ?? normalizeTag(basename(outputDirectory));
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(packId))
    throw new Error(
      "--pack-id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, or hyphens",
    );
  return packId;
};

export const parseContentSeedCliOptions = (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): ContentSeedCliOptions => {
  const parsed = parseArguments(arguments_);
  const source = parsed.values.get("source") ?? "local-catalog";
  if (source !== "local-catalog")
    throw new Error(`Unsupported --source ${JSON.stringify(source)}`);
  const outputDirectory = resolve(
    workingDirectory,
    parsed.values.get("out") ?? "content-packs/seed",
  );
  const tags = normalizeTags(parseCommaSeparated(parsed.values.get("tags")));
  const excludedTags = normalizeTags(
    parseCommaSeparated(parsed.values.get("exclude-tags")),
  );
  return {
    catalogDirectory: resolve(
      workingDirectory,
      parsed.values.get("catalog") ?? "content-sources/catalog",
    ),
    help: parsed.flags.has("help"),
    source,
    seedOptions: {
      tags,
      excludedTags,
      languages: parseLanguages(parsed.values.get("languages")),
      limit: parseLimit(parsed.values.get("limit")),
      match: parseMatch(parsed.values.get("match")),
      seed: parsed.values.get("seed") ?? "afterleaf",
      dryRun: parsed.flags.has("dry-run"),
      force: parsed.flags.has("force"),
      outputDirectory,
      packId: parsePackId(parsed.values.get("pack-id"), outputDirectory),
    },
  };
};

export const CONTENT_SEED_HELP = `Seed an Afterleaf content pack from local images.

Usage:
  bun run content:seed [options]

Options:
  --source local-catalog       Source adapter (default: local-catalog)
  --catalog <directory>        Catalog root (default: content-sources/catalog)
  --tags <tag,tag>             Required/desired normalized tags
  --exclude-tags <tag,tag>     Reject candidates containing any listed tag
  --match <all|any>            Tag matching mode (default: all)
  --languages <language,...>   english and/or japanese (default: english,japanese)
  --limit <count>              Hard upper bound after validation (default: 20)
  --seed <text>                Stable selection seed (default: afterleaf)
  --out <directory>            Pack output (default: content-packs/seed)
  --pack-id <id>               Stable pack ID (default: output directory name)
  --dry-run                    Validate and print the selection without writing
  --force                      Atomically replace an existing output directory
  --help                       Show this help
`;

export const runContentSeedCli = async (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
) => {
  const options = parseContentSeedCliOptions(arguments_, workingDirectory);
  if (options.help) return undefined;
  return seedContentPack(
    new LocalCatalogSource(options.catalogDirectory),
    options.seedOptions,
  );
};
