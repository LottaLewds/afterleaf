import {isAbsolute, relative, resolve, sep} from "node:path";
import {
  CONTENT_SCHEMA_VERSION,
  PUBLICATION_KINDS,
  type LocalPublicationDocument,
  type PublicationAssets,
  type PublicationIssue,
  type PublicationKind,
  type PublicationPhysical,
  type PublicationProvenance,
} from "~/content/schema";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectRecord = (value: unknown, field: string) => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
};

const expectString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${field} must be a non-empty string`);
  return value.trim();
};

const expectId = (value: unknown, field: string) => {
  const id = expectString(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(id))
    throw new Error(
      `${field} must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, or hyphens`,
    );
  return id;
};

const expectStringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${field} must be a non-empty string array`);
  return value.map((entry, index) => expectString(entry, `${field}[${index}]`));
};

const expectPossiblyEmptyStringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new Error(`${field} must be a string array`);
  return value.map((entry, index) => expectString(entry, `${field}[${index}]`));
};

const optionalString = (value: unknown, field: string) =>
  value === undefined ? undefined : expectString(value, field);

const parseKind = (
  value: unknown,
  field: string,
): PublicationKind | undefined => {
  if (value === undefined) return undefined;
  const kind = expectString(value, field);
  if (!PUBLICATION_KINDS.some((candidate) => candidate === kind))
    throw new Error(`${field} must be one of: ${PUBLICATION_KINDS.join(", ")}`);
  return kind;
};

const parsePositiveInteger = (
  value: unknown,
  field: string,
): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw new Error(`${field} must be a positive integer`);
  return Number(value);
};

const parseIssue = (
  value: unknown,
  field: string,
): PublicationIssue | undefined => {
  if (value === undefined) return undefined;
  const issue = expectRecord(value, field);
  const year = parsePositiveInteger(issue.year, `${field}.year`);
  const month = parsePositiveInteger(issue.month, `${field}.month`);
  const number = parsePositiveInteger(issue.number, `${field}.number`);
  const label = optionalString(issue.label, `${field}.label`);
  if (month !== undefined && month > 12)
    throw new Error(`${field}.month must be between 1 and 12`);
  if (
    year === undefined &&
    month === undefined &&
    number === undefined &&
    label === undefined
  )
    throw new Error(`${field} must contain at least one issue value`);
  return {
    ...(year === undefined ? {} : {year}),
    ...(month === undefined ? {} : {month}),
    ...(number === undefined ? {} : {number}),
    ...(label === undefined ? {} : {label}),
  };
};

const parseAssets = (value: unknown): PublicationAssets => {
  const assets = expectRecord(value, "assets");
  const front = optionalString(assets.front, "assets.front");
  const back = optionalString(assets.back, "assets.back");
  const spine = optionalString(assets.spine, "assets.spine");
  return {
    pages: expectPossiblyEmptyStringArray(assets.pages, "assets.pages"),
    ...(front === undefined ? {} : {front}),
    ...(back === undefined ? {} : {back}),
    ...(spine === undefined ? {} : {spine}),
  };
};

const parseSource = (value: unknown): PublicationProvenance | undefined => {
  if (value === undefined) return undefined;
  const source = expectRecord(value, "source");
  const retrievedAt = expectString(source.retrievedAt, "source.retrievedAt");
  if (Number.isNaN(Date.parse(retrievedAt)))
    throw new Error("source.retrievedAt must be an ISO date");
  return {
    provider: expectString(source.provider, "source.provider"),
    remoteId: expectString(source.remoteId, "source.remoteId"),
    sourceUrl: expectString(source.sourceUrl, "source.sourceUrl"),
    retrievedAt,
    metadataHash: expectString(source.metadataHash, "source.metadataHash"),
  };
};

const parsePhysical = (value: unknown): PublicationPhysical | undefined => {
  if (value === undefined) return undefined;
  const physical = expectRecord(value, "physical");
  const direction = physical.readingDirection;
  if (direction !== undefined && direction !== "ltr" && direction !== "rtl")
    throw new Error(
      'physical.readingDirection must be "ltr", "rtl", or omitted',
    );
  const thicknessMm = physical.thicknessMm;
  if (
    thicknessMm !== undefined &&
    (typeof thicknessMm !== "number" ||
      !Number.isFinite(thicknessMm) ||
      thicknessMm <= 0)
  )
    throw new Error("physical.thicknessMm must be a positive number");
  const aspectRatio = physical.aspectRatio;
  if (
    aspectRatio !== undefined &&
    (typeof aspectRatio !== "number" ||
      !Number.isFinite(aspectRatio) ||
      aspectRatio < 0.35 ||
      aspectRatio > 1.5)
  )
    throw new Error("physical.aspectRatio must be between 0.35 and 1.5");
  const trim = optionalString(physical.trim, "physical.trim");
  return {
    ...(aspectRatio === undefined ? {} : {aspectRatio}),
    ...(direction === undefined ? {} : {readingDirection: direction}),
    ...(thicknessMm === undefined ? {} : {thicknessMm}),
    ...(trim === undefined ? {} : {trim}),
  };
};

export const parseLocalPublicationDocument = (
  value: unknown,
  fileName: string,
): LocalPublicationDocument => {
  const document = expectRecord(value, fileName);
  if (document.schemaVersion !== CONTENT_SCHEMA_VERSION)
    throw new Error(
      `${fileName}: schemaVersion must be ${CONTENT_SCHEMA_VERSION}`,
    );
  const groupId = optionalString(document.groupId, `${fileName}.groupId`);
  const issue = parseIssue(document.issue, `${fileName}.issue`);
  const kind = parseKind(document.kind, `${fileName}.kind`);
  const physical = parsePhysical(document.physical);
  const source = parseSource(document.source);
  const pageCount = parsePositiveInteger(
    document.pageCount,
    `${fileName}.pageCount`,
  );
  const assets = parseAssets(document.assets);
  if (assets.pages.length === 0 && pageCount === undefined)
    throw new Error(
      `${fileName}.pageCount is required when assets.pages is empty`,
    );
  if (pageCount !== undefined && pageCount < assets.pages.length)
    throw new Error(
      `${fileName}.pageCount cannot be smaller than assets.pages`,
    );
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id: expectId(document.id, `${fileName}.id`),
    ...(groupId === undefined ? {} : {groupId}),
    ...(issue === undefined ? {} : {issue}),
    ...(kind === undefined ? {} : {kind}),
    title: expectString(document.title, `${fileName}.title`),
    language: expectString(document.language, `${fileName}.language`),
    ...(pageCount === undefined ? {} : {pageCount}),
    tags: expectStringArray(document.tags, `${fileName}.tags`),
    assets,
    ...(source === undefined ? {} : {source}),
    ...(physical === undefined ? {} : {physical}),
  };
};

export const resolveContainedPath = (root: string, candidate: string) => {
  if (candidate.includes("\\"))
    throw new Error(`Asset path must use portable separators: ${candidate}`);
  if (isAbsolute(candidate))
    throw new Error(`Asset path must be relative: ${candidate}`);
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(resolvedRoot, candidate);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  )
    throw new Error(`Asset path escapes publication directory: ${candidate}`);
  return resolvedCandidate;
};
