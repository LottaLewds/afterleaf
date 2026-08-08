import {PUBLICATION_KINDS, SUPPORTED_LANGUAGES} from "../schema";
import {
  LIBRARY_PROVIDER_API_VERSION,
  type LibraryProviderDescriptor,
  type LibraryProviderManifest,
} from "./types";

export const LIBRARY_PROVIDER_MANIFEST_NAME = "afterleaf-provider.json";

const providerIdPattern = /^[a-z][a-z0-9-]{0,63}$/u;
const entryPattern =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+\.(?:mjs|cjs|js|mts|cts|ts)$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireExactKeys = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  field: string,
) => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpectedKey)
    throw new Error(`${field}.${unexpectedKey} is not supported`);
  const missingKey = requiredKeys.find((key) => !(key in value));
  if (missingKey) throw new Error(`${field}.${missingKey} is required`);
  return value;
};

const boundedString = (value: unknown, field: string, allowEmpty = false) => {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > 500
  )
    throw new Error(`${field} must be a bounded string`);
  return value;
};

export const parseLibraryProviderDescriptor = (
  value: unknown,
  field = "descriptor",
): LibraryProviderDescriptor => {
  const descriptor = requireExactKeys(
    value,
    [
      "contentKinds",
      "defaultBlockedTags",
      "defaultLanguages",
      "defaultQuery",
      "id",
      "name",
      "queryHelp",
      "queryLabel",
      "queryPlaceholder",
      "requiresLanguageTag",
      "summary",
    ],
    [],
    field,
  );
  const contentKinds = descriptor.contentKinds;
  if (
    !Array.isArray(contentKinds) ||
    contentKinds.length === 0 ||
    !contentKinds.every(
      (kind) =>
        typeof kind === "string" && PUBLICATION_KINDS.includes(kind as never),
    )
  )
    throw new Error(`${field}.contentKinds is invalid`);
  const defaultBlockedTags = descriptor.defaultBlockedTags;
  if (
    !Array.isArray(defaultBlockedTags) ||
    !defaultBlockedTags.every((tag) => typeof tag === "string")
  )
    throw new Error(`${field}.defaultBlockedTags must be an array of strings`);
  const defaultLanguages = descriptor.defaultLanguages;
  if (
    !Array.isArray(defaultLanguages) ||
    defaultLanguages.length === 0 ||
    !defaultLanguages.every(
      (language) =>
        typeof language === "string" &&
        SUPPORTED_LANGUAGES.includes(language as never),
    )
  )
    throw new Error(`${field}.defaultLanguages is invalid`);
  const id = boundedString(descriptor.id, `${field}.id`);
  if (!providerIdPattern.test(id))
    throw new Error(`${field}.id must be a portable provider identifier`);
  if (typeof descriptor.requiresLanguageTag !== "boolean")
    throw new Error(`${field}.requiresLanguageTag must be a boolean`);
  const defaultQuery = boundedString(
    descriptor.defaultQuery,
    `${field}.defaultQuery`,
    true,
  );
  if (defaultQuery.length > 100)
    throw new Error(`${field}.defaultQuery must not exceed 100 characters`);
  return {
    contentKinds: [
      ...contentKinds,
    ] as LibraryProviderDescriptor["contentKinds"],
    defaultBlockedTags: [...defaultBlockedTags],
    defaultLanguages: [
      ...defaultLanguages,
    ] as LibraryProviderDescriptor["defaultLanguages"],
    defaultQuery,
    id,
    name: boundedString(descriptor.name, `${field}.name`),
    queryHelp: boundedString(descriptor.queryHelp, `${field}.queryHelp`),
    queryLabel: boundedString(descriptor.queryLabel, `${field}.queryLabel`),
    queryPlaceholder: boundedString(
      descriptor.queryPlaceholder,
      `${field}.queryPlaceholder`,
      true,
    ),
    requiresLanguageTag: descriptor.requiresLanguageTag,
    summary: boundedString(descriptor.summary, `${field}.summary`),
  };
};

export const parseLibraryProviderManifest = (
  value: unknown,
  field = LIBRARY_PROVIDER_MANIFEST_NAME,
): LibraryProviderManifest => {
  const manifest = requireExactKeys(
    value,
    ["apiVersion", "descriptor", "entry", "kind"],
    ["$schema"],
    field,
  );
  if (manifest.apiVersion !== LIBRARY_PROVIDER_API_VERSION)
    throw new Error(
      `${field}.apiVersion must be ${LIBRARY_PROVIDER_API_VERSION}`,
    );
  if (manifest.kind !== "afterleaf-content-provider")
    throw new Error(`${field}.kind must be afterleaf-content-provider`);
  const entry = boundedString(manifest.entry, `${field}.entry`);
  if (!entryPattern.test(entry))
    throw new Error(
      `${field}.entry must be a relative JavaScript or TypeScript file`,
    );
  const schema = manifest.$schema;
  if (schema !== undefined && typeof schema !== "string")
    throw new Error(`${field}.$schema must be a string`);
  return {
    ...(schema === undefined ? {} : {$schema: schema}),
    apiVersion: LIBRARY_PROVIDER_API_VERSION,
    descriptor: parseLibraryProviderDescriptor(
      manifest.descriptor,
      `${field}.descriptor`,
    ),
    entry,
    kind: "afterleaf-content-provider",
  };
};
