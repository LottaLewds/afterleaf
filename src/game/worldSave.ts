import type {ShelfPresentation} from "./shelfPlacement";

export const WORLD_SAVE_SCHEMA_VERSION = 1 as const;
export const MAX_CARRIED_BOOKS = 5;

const MAX_BOOK_COUNT = 10_000;
const MAX_IDENTIFIER_LENGTH = 512;
const MAX_TEXT_LENGTH = 2_048;
const MAX_SHELF_SIGN_COUNT = 128;
const MAX_AISLE_SIGN_COUNT = 32;
const MAX_POSTER_COUNT = 512;
const MAX_DIGITAL_ART_FRAME_COUNT = 128;
const MAX_PROP_COUNT = 64;
const MAX_MODEL_PROP_COUNT = 512;
const MAX_TELEVISION_COUNT = 128;
const MAX_WORLD_COORDINATE = 100_000;
const MIN_QUATERNION_LENGTH_SQUARED = 1e-12;
const MIN_POSTER_HEIGHT = 0.1;
const MAX_POSTER_HEIGHT = 10;
const MAX_POSTER_ROTATION = Math.PI;
const MIN_ART_FRAME_INTERVAL_SECONDS = 5;
const MAX_ART_FRAME_INTERVAL_SECONDS = 3_600;

export type WorldVector3 = {
  x: number;
  y: number;
  z: number;
};

export type WorldQuaternion = WorldVector3 & {
  w: number;
};

export type WorldPose = {
  position: WorldVector3;
  quaternion: WorldQuaternion;
};

export type WorldCatalogIdentity = {
  catalogContentHash: string;
  packId: string;
  snapshotId?: string;
};

export type WorldShelfPlacement = {
  bayId?: string;
  displayText?: string;
  facetLabel?: string;
  presentation?: ShelfPresentation;
  shelfId: string;
  slotIndex: number;
};

export type WorldShelfSign = {
  column: number;
  subtitle?: string;
  text: string;
};

export type WorldAisleSign = {
  id: string;
  subtitle?: string;
  title: string;
};

export type WorldPosterSave = {
  assetId: string;
  height: number;
  id: string;
  pose: WorldPose;
  rotation?: number;
};

export type WorldDigitalArtFrameSave = {
  aspectRatio: number;
  channelId: string;
  currentImageId?: string;
  fit: "contain" | "cover";
  height: number;
  id: string;
  intervalSeconds: number;
  pose: WorldPose;
  rotation?: number;
};

export type WorldPropSave = {
  id: string;
  /** Pinned prop: fixed body immune to bumps but still colliding. */
  locked?: boolean;
  pose: WorldPose;
};

export type WorldModelPropSave = WorldPropSave & {
  animationClip?: string | null;
  assetId: string;
  scale: number;
};

export type WorldTelevisionChannels = Readonly<Record<string, string>>;
export type WorldTelevisionVolumes = Readonly<Record<string, number>>;

type WorldBookSaveBase = {
  copyId: string;
  pose: WorldPose;
  publicationId: string;
};

export type WorldBookSave =
  | (WorldBookSaveBase & {state: "carried" | "floor"})
  | (WorldBookSaveBase & {
      shelf: WorldShelfPlacement;
      state: "shelved";
    });

export type WorldSaveV1 = {
  aisleSigns?: readonly WorldAisleSign[];
  books: readonly WorldBookSave[];
  catalog?: WorldCatalogIdentity;
  digitalArtFrames?: readonly WorldDigitalArtFrameSave[];
  modelProps?: readonly WorldModelPropSave[];
  pendingArrivalIds?: readonly string[];
  player: WorldPose;
  posters?: readonly WorldPosterSave[];
  props?: readonly WorldPropSave[];
  /**
   * Written once the shop has seeded its default props (lane arcade
   * cabinet, movable CRT television) into the world as ordinary spawned
   * props. Absent on fresh and legacy worlds, which are seeded on boot;
   * once present, the saved modelProps list is authoritative and deleted
   * defaults stay gone.
   */
  defaultsSeeded?: true;
  savedAt: string;
  schemaVersion: typeof WORLD_SAVE_SCHEMA_VERSION;
  shelfSigns?: readonly WorldShelfSign[];
  television?: WorldPose;
  televisionChannels?: WorldTelevisionChannels;
  televisionModelVersion?: 2;
  televisionVolumes?: WorldTelevisionVolumes;
  trashcan?: WorldVector3;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
  value: unknown,
  field: string,
  maximumLength = MAX_IDENTIFIER_LENGTH,
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  )
    throw new Error(`${field} must be a non-empty bounded string`);
  return value;
};

const optionalString = (
  value: unknown,
  field: string,
  maximumLength = MAX_IDENTIFIER_LENGTH,
) =>
  value === undefined ? undefined : requiredString(value, field, maximumLength);

const finiteCoordinate = (value: unknown, field: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_WORLD_COORDINATE
  )
    throw new Error(`${field} must be a finite world coordinate`);
  return value;
};

const parseVector3 = (value: unknown, field: string): WorldVector3 => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return {
    x: finiteCoordinate(value.x, `${field}.x`),
    y: finiteCoordinate(value.y, `${field}.y`),
    z: finiteCoordinate(value.z, `${field}.z`),
  };
};

const parseQuaternion = (value: unknown, field: string): WorldQuaternion => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const x = finiteCoordinate(value.x, `${field}.x`);
  const y = finiteCoordinate(value.y, `${field}.y`);
  const z = finiteCoordinate(value.z, `${field}.z`);
  const w = finiteCoordinate(value.w, `${field}.w`);
  const lengthSquared = x * x + y * y + z * z + w * w;
  if (
    !Number.isFinite(lengthSquared) ||
    lengthSquared < MIN_QUATERNION_LENGTH_SQUARED
  )
    throw new Error(`${field} must describe a non-zero finite rotation`);
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return {
    w: w * inverseLength,
    x: x * inverseLength,
    y: y * inverseLength,
    z: z * inverseLength,
  };
};

const parsePose = (value: unknown, field: string): WorldPose => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return {
    position: parseVector3(value.position, `${field}.position`),
    quaternion: parseQuaternion(value.quaternion, `${field}.quaternion`),
  };
};

const parseTelevisionChannels = (value: unknown): WorldTelevisionChannels => {
  if (!isRecord(value)) throw new Error("televisionChannels must be an object");
  const entries = Object.entries(value);
  if (entries.length > MAX_TELEVISION_COUNT)
    throw new Error("televisionChannels must be a bounded object");
  return Object.fromEntries(
    entries.map(([televisionId, channelId]) => [
      requiredString(televisionId, "televisionChannels television ID"),
      requiredString(channelId, `televisionChannels.${televisionId}`),
    ]),
  );
};

const parseTelevisionVolumes = (value: unknown): WorldTelevisionVolumes => {
  if (!isRecord(value)) throw new Error("televisionVolumes must be an object");
  const entries = Object.entries(value);
  if (entries.length > MAX_TELEVISION_COUNT)
    throw new Error("televisionVolumes must be a bounded object");
  return Object.fromEntries(
    entries.map(([televisionId, rawVolume]) => {
      const id = requiredString(
        televisionId,
        "televisionVolumes television ID",
      );
      if (
        typeof rawVolume !== "number" ||
        !Number.isFinite(rawVolume) ||
        rawVolume < 0 ||
        rawVolume > 1
      )
        throw new Error(
          `televisionVolumes.${televisionId} must be between 0 and 1`,
        );
      return [id, rawVolume];
    }),
  );
};

const parseShelfPlacement = (
  value: unknown,
  field: string,
): WorldShelfPlacement => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  if (!Number.isSafeInteger(value.slotIndex) || Number(value.slotIndex) < 0)
    throw new Error(`${field}.slotIndex must be a non-negative safe integer`);
  const bayId = optionalString(value.bayId, `${field}.bayId`);
  const displayText = optionalString(
    value.displayText,
    `${field}.displayText`,
    MAX_TEXT_LENGTH,
  );
  const facetLabel = optionalString(
    value.facetLabel,
    `${field}.facetLabel`,
    MAX_TEXT_LENGTH,
  );
  const presentation = value.presentation;
  if (
    presentation !== undefined &&
    presentation !== "face" &&
    presentation !== "spine"
  )
    throw new Error(`${field}.presentation must be face or spine`);
  return {
    ...(bayId === undefined ? {} : {bayId}),
    ...(displayText === undefined ? {} : {displayText}),
    ...(facetLabel === undefined ? {} : {facetLabel}),
    ...(presentation === undefined ? {} : {presentation}),
    shelfId: requiredString(value.shelfId, `${field}.shelfId`),
    slotIndex: Number(value.slotIndex),
  };
};

const parseBook = (value: unknown, field: string): WorldBookSave => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const base = {
    copyId: requiredString(value.copyId, `${field}.copyId`),
    pose: parsePose(value.pose, `${field}.pose`),
    publicationId: requiredString(
      value.publicationId,
      `${field}.publicationId`,
    ),
  };
  if (value.state === "shelved")
    return {
      ...base,
      shelf: parseShelfPlacement(value.shelf, `${field}.shelf`),
      state: "shelved",
    };
  if (value.state !== "floor" && value.state !== "carried")
    throw new Error(`${field}.state is unsupported`);
  if (value.shelf !== undefined)
    throw new Error(`${field}.shelf is only valid for shelved books`);
  return {...base, state: value.state};
};

const parseCatalogIdentity = (
  value: unknown,
  field: string,
): WorldCatalogIdentity => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const snapshotId = optionalString(value.snapshotId, `${field}.snapshotId`);
  return {
    catalogContentHash: requiredString(
      value.catalogContentHash,
      `${field}.catalogContentHash`,
    ),
    packId: requiredString(value.packId, `${field}.packId`),
    ...(snapshotId === undefined ? {} : {snapshotId}),
  };
};

const parsePosters = (value: unknown): readonly WorldPosterSave[] => {
  if (!Array.isArray(value) || value.length > MAX_POSTER_COUNT)
    throw new Error("posters must be a bounded array");
  const ids = new Set<string>();
  return value.map((poster, index) => {
    if (!isRecord(poster))
      throw new Error(`posters[${index}] must be an object`);
    const id = requiredString(poster.id, `posters[${index}].id`);
    if (ids.has(id))
      throw new Error("World save contains duplicate poster IDs");
    ids.add(id);
    const height = finiteCoordinate(poster.height, `posters[${index}].height`);
    if (height < MIN_POSTER_HEIGHT || height > MAX_POSTER_HEIGHT)
      throw new Error(
        `posters[${index}].height must be between ${MIN_POSTER_HEIGHT} and ${MAX_POSTER_HEIGHT}`,
      );
    const rotation =
      poster.rotation === undefined
        ? undefined
        : finiteCoordinate(poster.rotation, `posters[${index}].rotation`);
    if (rotation !== undefined && Math.abs(rotation) > MAX_POSTER_ROTATION)
      throw new Error(`posters[${index}].rotation must be between -PI and PI`);
    return {
      assetId: requiredString(poster.assetId, `posters[${index}].assetId`),
      height,
      id,
      pose: parsePose(poster.pose, `posters[${index}].pose`),
      ...(rotation === undefined ? {} : {rotation}),
    };
  });
};

const parseDigitalArtFrames = (
  value: unknown,
): readonly WorldDigitalArtFrameSave[] => {
  if (!Array.isArray(value) || value.length > MAX_DIGITAL_ART_FRAME_COUNT)
    throw new Error("digitalArtFrames must be a bounded array");
  const ids = new Set<string>();
  return value.map((frame, index) => {
    if (!isRecord(frame))
      throw new Error(`digitalArtFrames[${index}] must be an object`);
    const field = `digitalArtFrames[${index}]`;
    const id = requiredString(frame.id, `${field}.id`);
    if (ids.has(id))
      throw new Error("World save contains duplicate digital art frame IDs");
    ids.add(id);
    const aspectRatio = finiteCoordinate(
      frame.aspectRatio,
      `${field}.aspectRatio`,
    );
    if (aspectRatio <= 0 || aspectRatio > 100)
      throw new Error(`${field}.aspectRatio must be between 0 and 100`);
    const height = finiteCoordinate(frame.height, `${field}.height`);
    if (height < MIN_POSTER_HEIGHT || height > MAX_POSTER_HEIGHT)
      throw new Error(
        `${field}.height must be between ${MIN_POSTER_HEIGHT} and ${MAX_POSTER_HEIGHT}`,
      );
    if (frame.fit !== "contain" && frame.fit !== "cover")
      throw new Error(`${field}.fit must be contain or cover`);
    const intervalSeconds = finiteCoordinate(
      frame.intervalSeconds,
      `${field}.intervalSeconds`,
    );
    if (
      intervalSeconds !== 0 &&
      (intervalSeconds < MIN_ART_FRAME_INTERVAL_SECONDS ||
        intervalSeconds > MAX_ART_FRAME_INTERVAL_SECONDS)
    )
      throw new Error(
        `${field}.intervalSeconds must be 0 or between ${MIN_ART_FRAME_INTERVAL_SECONDS} and ${MAX_ART_FRAME_INTERVAL_SECONDS}`,
      );
    const rotation =
      frame.rotation === undefined
        ? undefined
        : finiteCoordinate(frame.rotation, `${field}.rotation`);
    if (rotation !== undefined && Math.abs(rotation) > MAX_POSTER_ROTATION)
      throw new Error(`${field}.rotation must be between -PI and PI`);
    const currentImageId = optionalString(
      frame.currentImageId,
      `${field}.currentImageId`,
    );
    return {
      aspectRatio,
      channelId: requiredString(frame.channelId, `${field}.channelId`),
      ...(currentImageId === undefined ? {} : {currentImageId}),
      fit: frame.fit,
      height,
      id,
      intervalSeconds,
      pose: parsePose(frame.pose, `${field}.pose`),
      ...(rotation === undefined ? {} : {rotation}),
    };
  });
};

const parseLockedFlag = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean")
    throw new Error(`${field} must be a boolean when present`);
  return value;
};

const parseProps = (value: unknown): readonly WorldPropSave[] => {
  if (!Array.isArray(value) || value.length > MAX_PROP_COUNT)
    throw new Error("props must be a bounded array");
  const ids = new Set<string>();
  return value.map((prop, index) => {
    if (!isRecord(prop)) throw new Error(`props[${index}] must be an object`);
    const id = requiredString(prop.id, `props[${index}].id`);
    if (ids.has(id)) throw new Error("World save contains duplicate prop IDs");
    ids.add(id);
    const locked = parseLockedFlag(prop.locked, `props[${index}].locked`);
    return {
      id,
      ...(locked === undefined ? {} : {locked}),
      pose: parsePose(prop.pose, `props[${index}].pose`),
    };
  });
};

const parseModelProps = (value: unknown): readonly WorldModelPropSave[] => {
  if (!Array.isArray(value) || value.length > MAX_MODEL_PROP_COUNT)
    throw new Error("modelProps must be a bounded array");
  const ids = new Set<string>();
  return value.map((prop, index) => {
    if (!isRecord(prop))
      throw new Error(`modelProps[${index}] must be an object`);
    const id = requiredString(prop.id, `modelProps[${index}].id`);
    if (ids.has(id))
      throw new Error("World save contains duplicate model prop IDs");
    ids.add(id);
    const scale = finiteCoordinate(prop.scale, `modelProps[${index}].scale`);
    if (scale < 0.01 || scale > 100)
      throw new Error(
        `modelProps[${index}].scale must be between 0.01 and 100`,
      );
    const animationClip =
      prop.animationClip === null
        ? null
        : optionalString(
            prop.animationClip,
            `modelProps[${index}].animationClip`,
          );
    const locked = parseLockedFlag(prop.locked, `modelProps[${index}].locked`);
    return {
      ...(animationClip === undefined ? {} : {animationClip}),
      assetId: requiredString(prop.assetId, `modelProps[${index}].assetId`),
      id,
      ...(locked === undefined ? {} : {locked}),
      pose: parsePose(prop.pose, `modelProps[${index}].pose`),
      scale,
    };
  });
};

const parseShelfSigns = (value: unknown): readonly WorldShelfSign[] => {
  if (!Array.isArray(value) || value.length > MAX_SHELF_SIGN_COUNT)
    throw new Error("shelfSigns must be a bounded array");
  const columns = new Set<number>();
  return value.map((sign, index) => {
    if (!isRecord(sign))
      throw new Error(`shelfSigns[${index}] must be an object`);
    if (!Number.isSafeInteger(sign.column) || Number(sign.column) < 0)
      throw new Error(
        `shelfSigns[${index}].column must be a non-negative integer`,
      );
    const column = Number(sign.column);
    if (columns.has(column))
      throw new Error("World save contains duplicate shelf sign columns");
    columns.add(column);
    const subtitle = optionalString(
      sign.subtitle,
      `shelfSigns[${index}].subtitle`,
      MAX_TEXT_LENGTH,
    );
    return {
      column,
      ...(subtitle === undefined ? {} : {subtitle}),
      text: requiredString(
        sign.text,
        `shelfSigns[${index}].text`,
        MAX_TEXT_LENGTH,
      ),
    };
  });
};

const parseAisleSigns = (value: unknown): readonly WorldAisleSign[] => {
  if (!Array.isArray(value) || value.length > MAX_AISLE_SIGN_COUNT)
    throw new Error("aisleSigns must be a bounded array");
  const ids = new Set<string>();
  return value.map((sign, index) => {
    if (!isRecord(sign))
      throw new Error(`aisleSigns[${index}] must be an object`);
    const id = requiredString(sign.id, `aisleSigns[${index}].id`);
    if (ids.has(id))
      throw new Error("World save contains duplicate aisle sign IDs");
    ids.add(id);
    const subtitle = optionalString(
      sign.subtitle,
      `aisleSigns[${index}].subtitle`,
      MAX_TEXT_LENGTH,
    );
    return {
      id,
      ...(subtitle === undefined ? {} : {subtitle}),
      title: requiredString(
        sign.title,
        `aisleSigns[${index}].title`,
        MAX_TEXT_LENGTH,
      ),
    };
  });
};

/** Parses untrusted JSON data into normalized transforms and a strict V1 save. */
export const parseWorldSave = (value: unknown): WorldSaveV1 => {
  if (!isRecord(value)) throw new Error("World save must be an object");
  if (value.schemaVersion !== WORLD_SAVE_SCHEMA_VERSION)
    throw new Error("Unsupported world save schema version");
  if (!Array.isArray(value.books) || value.books.length > MAX_BOOK_COUNT)
    throw new Error("World save books must be a bounded array");
  if (
    typeof value.savedAt !== "string" ||
    !Number.isFinite(Date.parse(value.savedAt))
  )
    throw new Error("World save savedAt must be a valid date string");

  const books = value.books.map((book, index) =>
    parseBook(book, `books[${index}]`),
  );
  const shelfSigns =
    value.shelfSigns === undefined
      ? undefined
      : parseShelfSigns(value.shelfSigns);
  const aisleSigns =
    value.aisleSigns === undefined
      ? undefined
      : parseAisleSigns(value.aisleSigns);
  const trashcan =
    value.trashcan === undefined
      ? undefined
      : parseVector3(value.trashcan, "trashcan");
  const posters =
    value.posters === undefined ? undefined : parsePosters(value.posters);
  const digitalArtFrames =
    value.digitalArtFrames === undefined
      ? undefined
      : parseDigitalArtFrames(value.digitalArtFrames);
  const props = value.props === undefined ? undefined : parseProps(value.props);
  const modelProps =
    value.modelProps === undefined
      ? undefined
      : parseModelProps(value.modelProps);
  if (value.defaultsSeeded !== undefined && value.defaultsSeeded !== true)
    throw new Error("defaultsSeeded must be true when present");
  const defaultsSeeded = value.defaultsSeeded as true | undefined;
  const television =
    value.television === undefined
      ? undefined
      : parsePose(value.television, "television");
  const televisionChannels =
    value.televisionChannels === undefined
      ? undefined
      : parseTelevisionChannels(value.televisionChannels);
  const televisionVolumes =
    value.televisionVolumes === undefined
      ? undefined
      : parseTelevisionVolumes(value.televisionVolumes);
  if (
    value.televisionModelVersion !== undefined &&
    value.televisionModelVersion !== 2
  )
    throw new Error("televisionModelVersion is unsupported");
  const televisionModelVersion = value.televisionModelVersion as 2 | undefined;
  const copyIds = new Set(books.map((book) => book.copyId));
  if (copyIds.size !== books.length)
    throw new Error("World save contains duplicate copy IDs");
  const carriedBookCount = books.filter(
    (book) => book.state === "carried",
  ).length;
  if (carriedBookCount > MAX_CARRIED_BOOKS)
    throw new Error(
      `World save cannot contain more than ${MAX_CARRIED_BOOKS} carried books`,
    );
  if (
    value.pendingArrivalIds !== undefined &&
    (!Array.isArray(value.pendingArrivalIds) ||
      value.pendingArrivalIds.length > MAX_BOOK_COUNT)
  )
    throw new Error("World save pending arrivals must be a bounded array");
  const pendingArrivalIds = (value.pendingArrivalIds ?? []).map(
    (publicationId, index) =>
      requiredString(publicationId, `pendingArrivalIds[${index}]`),
  );
  if (new Set(pendingArrivalIds).size !== pendingArrivalIds.length)
    throw new Error("World save contains duplicate pending arrival IDs");

  const catalog =
    value.catalog === undefined
      ? undefined
      : parseCatalogIdentity(value.catalog, "catalog");
  return {
    ...(aisleSigns === undefined ? {} : {aisleSigns}),
    books,
    ...(catalog === undefined ? {} : {catalog}),
    ...(defaultsSeeded === undefined ? {} : {defaultsSeeded}),
    ...(digitalArtFrames === undefined ? {} : {digitalArtFrames}),
    ...(modelProps === undefined ? {} : {modelProps}),
    ...(pendingArrivalIds.length === 0 ? {} : {pendingArrivalIds}),
    player: parsePose(value.player, "player"),
    ...(posters === undefined ? {} : {posters}),
    ...(props === undefined ? {} : {props}),
    savedAt: value.savedAt,
    schemaVersion: WORLD_SAVE_SCHEMA_VERSION,
    ...(shelfSigns === undefined ? {} : {shelfSigns}),
    ...(television === undefined ? {} : {television}),
    ...(televisionChannels === undefined ? {} : {televisionChannels}),
    ...(televisionModelVersion === undefined ? {} : {televisionModelVersion}),
    ...(televisionVolumes === undefined ? {} : {televisionVolumes}),
    ...(trashcan === undefined ? {} : {trashcan}),
  };
};

/** Exact identity matching prevents stale placements from loading silently. */
export const worldSaveMatchesCatalog = (
  save: Pick<WorldSaveV1, "catalog">,
  catalog: WorldCatalogIdentity,
) => {
  const savedCatalog = save.catalog;
  if (!savedCatalog) return false;
  if (
    savedCatalog.packId !== catalog.packId ||
    savedCatalog.catalogContentHash !== catalog.catalogContentHash
  )
    return false;
  return savedCatalog.snapshotId === catalog.snapshotId;
};

/**
 * Stable publication IDs can be reconciled when one immutable snapshot of the
 * same logical library supersedes another.
 */
export const worldSaveCanReconcileCatalog = (
  save: Pick<WorldSaveV1, "catalog">,
  catalog: WorldCatalogIdentity,
) => save.catalog?.packId === catalog.packId;
