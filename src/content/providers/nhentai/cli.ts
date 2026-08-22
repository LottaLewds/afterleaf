import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {
  normalizeTags,
  parseSupportedLanguage,
  type SupportedLanguage,
} from "@afterleaf/provider-sdk";
import {NhentaiClient} from "./client";
import {syncNhentaiCatalog, type NhentaiSyncOptions} from "./sync";

const VALUE_OPTIONS = new Set([
  "blocked-tags",
  "blocked-tags-json",
  "cookie-file",
  "flaresolverr-url",
  "languages",
  "limit",
  "max-search-pages",
  "out",
  "query",
  "user-agent",
]);
const FLAG_OPTIONS = new Set(["help", "write"]);

interface ParsedArguments {
  flags: Set<string>;
  values: Map<string, string>;
}

export interface NhentaiSyncCliOptions {
  cookieFile?: string;
  flaresolverrUrl?: string;
  help: boolean;
  syncOptions: NhentaiSyncOptions;
  userAgent?: string;
}

const parseArguments = (arguments_: readonly string[]): ParsedArguments => {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith("--"))
      throw new Error(`Unexpected positional argument: ${argument ?? ""}`);
    const equalsIndex = argument.indexOf("=");
    const name = argument.slice(
      2,
      equalsIndex === -1 ? undefined : equalsIndex,
    );
    const inlineValue =
      equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
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

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  option: string,
) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`--${option} must be a positive integer`);
  return parsed;
};

const parseCommaSeparated = (value: string | undefined) =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

const parseBlockedTags = (values: ReadonlyMap<string, string>) => {
  const commaSeparated = values.get("blocked-tags");
  const json = values.get("blocked-tags-json");
  if (commaSeparated !== undefined && json !== undefined)
    throw new Error(
      "Pass either --blocked-tags or --blocked-tags-json, not both",
    );
  if (json === undefined) return parseCommaSeparated(commaSeparated);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("--blocked-tags-json must be valid JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string"))
    throw new Error("--blocked-tags-json must be an array of strings");
  return parsed;
};

const parseLanguages = (value: string | undefined): SupportedLanguage[] => {
  const languages = parseCommaSeparated(value ?? "english,japanese").map(
    (language) => {
      const supported = parseSupportedLanguage(language);
      if (!supported)
        throw new Error(
          `Unsupported language ${JSON.stringify(language)}; expected english or japanese`,
        );
      return supported;
    },
  );
  return [...new Set(languages)];
};

export const parseNhentaiSyncCliOptions = (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): NhentaiSyncCliOptions => {
  const parsed = parseArguments(arguments_);
  const cookieFile = parsed.values.get("cookie-file");
  const flaresolverrUrl = parsed.values.get("flaresolverr-url");
  const userAgent = parsed.values.get("user-agent");
  return {
    ...(cookieFile === undefined
      ? {}
      : {cookieFile: resolve(workingDirectory, cookieFile)}),
    ...(flaresolverrUrl === undefined ? {} : {flaresolverrUrl}),
    help: parsed.flags.has("help"),
    ...(userAgent === undefined ? {} : {userAgent}),
    syncOptions: {
      blockedTags: normalizeTags(parseBlockedTags(parsed.values)),
      languages: parseLanguages(parsed.values.get("languages")),
      limit: parsePositiveInteger(parsed.values.get("limit"), 20, "limit"),
      maxSearchPages: parsePositiveInteger(
        parsed.values.get("max-search-pages"),
        10,
        "max-search-pages",
      ),
      outputDirectory: resolve(
        workingDirectory,
        parsed.values.get("out") ?? "content-sources/nhentai",
      ),
      query: parsed.values.get("query") ?? 'tag:"big breasts"',
      write: parsed.flags.has("write"),
    },
  };
};

export const NHENTAI_SYNC_HELP = `Synchronize nHentai publications into an Afterleaf local catalog.

Usage:
  bun run content:sync:nhentai [options]

Options:
  --query <query>              Search query (default: tag:"big breasts")
  --languages <language,...>  english and/or japanese (default: english,japanese)
  --blocked-tags <tag,...>    Optional tags to reject; none are blocked by default
  --limit <count>              Newest matching galleries considered per run (default: 20)
  --max-search-pages <count>   Search-page safety limit (default: 10)
  --out <directory>            Ignored local catalog (default: content-sources/nhentai)
  --cookie-file <path>         Optional Cookie header read from a file
  --user-agent <value>         Browser User-Agent matching a Cloudflare cookie
  --flaresolverr-url <url>     FlareSolverr endpoint used as an HTTP 403 fallback
  --write                      Download/update selected galleries; otherwise preview only
  --help                       Show this help

Repeat runs preserve galleries no longer in the newest result set. Stable IDs make new,
updated, unchanged, and repaired entries safe to distinguish. Review the preview before
using --write.
`;

export const runNhentaiSyncCli = async (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
) => {
  const options = parseNhentaiSyncCliOptions(arguments_, workingDirectory);
  if (options.help) return undefined;
  const cookie = options.cookieFile
    ? (await readFile(options.cookieFile, "utf8")).trim()
    : undefined;
  return syncNhentaiCatalog(options.syncOptions, {
    client: new NhentaiClient({
      ...(!cookie ? {} : {cookie}),
      ...(options.flaresolverrUrl === undefined
        ? {}
        : {flaresolverrUrl: options.flaresolverrUrl}),
      ...(options.userAgent === undefined
        ? {}
        : {userAgent: options.userAgent}),
    }),
  });
};
