import {normalizeTag} from "../../normalize";
import type {SupportedLanguage} from "@afterleaf/provider-sdk";

const DEFAULT_API_ORIGIN = "https://api.mangadex.org";
const MAX_JSON_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 128 * 1024 * 1024;
const SEARCH_RESULT_LIMIT = 10;
const CHAPTER_RESULT_LIMIT = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const requiredString = (value: unknown, field: string) => {
  const string = optionalString(value);
  if (!string) throw new Error(`${field} must be a non-empty string`);
  return string;
};

const requiredRecord = (value: unknown, field: string) => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
};

const requiredArray = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
};

const languageCode = (language: SupportedLanguage) =>
  language === "english" ? "en" : "ja";

const parseTextMap = (value: unknown) => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([language, text]) =>
      typeof text === "string" && text.trim() ? [[language, text.trim()]] : [],
    ),
  );
};

const firstText = (value: unknown, languages: readonly string[]) => {
  const texts = parseTextMap(value);
  for (const language of languages) {
    const text = texts[language];
    if (text) return text;
  }
  return Object.values(texts)[0];
};

const parseRelationships = (value: unknown) =>
  requiredArray(value, "relationships").flatMap((relationship, index) => {
    const record = requiredRecord(relationship, `relationships[${index}]`);
    const id = optionalString(record.id);
    const type = optionalString(record.type);
    if (!id || !type) return [];
    return [
      {
        attributes: isRecord(record.attributes) ? record.attributes : undefined,
        id,
        type,
      },
    ];
  });

export interface MangaDexTag {
  id: string;
  name: string;
}

export interface MangaDexManga {
  altTitles: Record<string, string>[];
  contentRating: string;
  description: Record<string, string>;
  id: string;
  originalLanguage?: string;
  tags: MangaDexTag[];
  title: Record<string, string>;
  year?: number;
  coverFileName?: string;
}

export interface MangaDexChapter {
  externalUrl?: string;
  id: string;
  mangaId: string;
  pages: number;
  publishedAt?: string;
  title?: string;
  translatedLanguage: string;
  volume?: string;
  chapter?: string;
}

export interface MangaDexChapterFeedPage {
  chapters: MangaDexChapter[];
  limit: number;
  offset: number;
  total: number;
}

export interface MangaDexAtHomeServer {
  baseUrl: string;
  chapter: {
    data: string[];
    dataSaver: string[];
    hash: string;
  };
}

export interface MangaDexClientOptions {
  apiOrigin?: string;
  fetcher?: typeof fetch;
  onRetry?: (event: MangaDexRequestRetryEvent) => void;
  retryCount?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface MangaDexRequestRetryEvent {
  delayMilliseconds: number;
  retryAttempt: number;
  retryLimit: number;
  status?: number;
  url: string;
}

const retryAfterMilliseconds = (response: Response) => {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1_000, 60_000)
    : undefined;
};

const normalizeOrigin = (origin: string) => {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("MangaDex API origin must use HTTP or HTTPS");
  return url.toString().replace(/\/$/u, "");
};

const parseManga = (value: unknown, field: string): MangaDexManga => {
  const record = requiredRecord(value, field);
  const attributes = requiredRecord(record.attributes, `${field}.attributes`);
  const relationships = parseRelationships(record.relationships);
  const id = requiredString(record.id, `${field}.id`);
  const tags = requiredArray(attributes.tags).flatMap((tag, index) => {
    const tagRecord = requiredRecord(tag, `${field}.attributes.tags[${index}]`);
    const tagAttributes = requiredRecord(
      tagRecord.attributes,
      `${field}.attributes.tags[${index}].attributes`,
    );
    const tagId = optionalString(tagRecord.id);
    const name = firstText(tagAttributes.name, ["en"]);
    return tagId && name ? [{id: tagId, name}] : [];
  });
  const cover = relationships.find(
    (relationship) => relationship.type === "cover_art",
  );
  const year = Number.isSafeInteger(attributes.year)
    ? Number(attributes.year)
    : undefined;
  return {
    altTitles: requiredArray(attributes.altTitles).flatMap((title) => {
      const parsed = parseTextMap(title);
      return Object.keys(parsed).length > 0 ? [parsed] : [];
    }),
    contentRating: optionalString(attributes.contentRating) ?? "safe",
    description: parseTextMap(attributes.description),
    id,
    ...(optionalString(attributes.originalLanguage) === undefined
      ? {}
      : {originalLanguage: optionalString(attributes.originalLanguage)}),
    tags,
    title: parseTextMap(attributes.title),
    ...(year === undefined ? {} : {year}),
    ...(cover?.attributes && optionalString(cover.attributes.fileName)
      ? {coverFileName: optionalString(cover.attributes.fileName)}
      : {}),
  };
};

const parseChapter = (value: unknown, field: string): MangaDexChapter => {
  const record = requiredRecord(value, field);
  const attributes = requiredRecord(record.attributes, `${field}.attributes`);
  return {
    chapter: optionalString(attributes.chapter),
    ...(optionalString(attributes.externalUrl) === undefined
      ? {}
      : {externalUrl: optionalString(attributes.externalUrl)}),
    id: requiredString(record.id, `${field}.id`),
    mangaId: requiredString(
      attributes.mangaId ??
        parseRelationships(record.relationships).find(
          (relationship) => relationship.type === "manga",
        )?.id,
      `${field}.mangaId`,
    ),
    pages: Number.isSafeInteger(attributes.pages)
      ? Number(attributes.pages)
      : 0,
    ...(optionalString(attributes.publishedAt) === undefined
      ? {}
      : {publishedAt: optionalString(attributes.publishedAt)}),
    ...(optionalString(attributes.title) === undefined
      ? {}
      : {title: optionalString(attributes.title)}),
    translatedLanguage: requiredString(
      attributes.translatedLanguage,
      `${field}.translatedLanguage`,
    ),
    ...(optionalString(attributes.volume) === undefined
      ? {}
      : {volume: optionalString(attributes.volume)}),
  };
};

const parseAtHomeServer = (value: unknown): MangaDexAtHomeServer => {
  const record = requiredRecord(value, "at-home response");
  const chapter = requiredRecord(record.chapter, "at-home response.chapter");
  const baseUrl = requiredString(record.baseUrl, "at-home response.baseUrl");
  const hash = requiredString(chapter.hash, "at-home response.chapter.hash");
  const data = requiredArray(chapter.data).map((page, index) =>
    requiredString(page, `at-home response.chapter.data[${index}]`),
  );
  const dataSaver = requiredArray(chapter.dataSaver).map((page, index) =>
    requiredString(page, `at-home response.chapter.dataSaver[${index}]`),
  );
  return {baseUrl, chapter: {data, dataSaver, hash}};
};

export class MangaDexClient {
  readonly #apiOrigin: string;
  readonly #fetcher: typeof fetch;
  readonly #onRetry: ((event: MangaDexRequestRetryEvent) => void) | undefined;
  readonly #retryCount: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #tagPromise: Promise<MangaDexTag[]> | undefined;

  constructor(options: MangaDexClientOptions = {}) {
    this.#apiOrigin = normalizeOrigin(options.apiOrigin ?? DEFAULT_API_ORIGIN);
    this.#fetcher = options.fetcher ?? fetch;
    this.#onRetry = options.onRetry;
    this.#retryCount = Math.max(0, Math.min(5, options.retryCount ?? 2));
    this.#sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  }

  async searchManga(
    query: string,
    page: number,
    languages: readonly SupportedLanguage[],
    blockedTags: readonly string[],
  ) {
    const params = new URLSearchParams({
      limit: String(SEARCH_RESULT_LIMIT),
      offset: String((page - 1) * SEARCH_RESULT_LIMIT),
    });
    for (const rating of ["safe", "suggestive"]) {
      params.append("contentRating[]", rating);
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      params.set("title", trimmedQuery);
      params.append("order[relevance]", "desc");
    } else params.append("order[updatedAt]", "desc");
    for (const language of languages)
      params.append("availableTranslatedLanguage[]", languageCode(language));
    for (const tagId of await this.#resolveTagIds(blockedTags))
      params.append("excludedTags[]", tagId);
    params.append("includes[]", "cover_art");
    const value = await this.#requestJson(`/manga?${params.toString()}`);
    const data = requiredArray(
      requiredRecord(value, "manga search response").data,
      "manga search response.data",
    );
    return data.map((manga, index) => parseManga(manga, `manga[${index}]`));
  }

  async getChapterFeedPage(
    mangaId: string,
    languages: readonly SupportedLanguage[],
    page: number,
  ): Promise<MangaDexChapterFeedPage> {
    const params = new URLSearchParams({
      limit: String(CHAPTER_RESULT_LIMIT),
      offset: String((page - 1) * CHAPTER_RESULT_LIMIT),
    });
    for (const language of languages)
      params.append("translatedLanguage[]", languageCode(language));
    for (const rating of ["safe", "suggestive"])
      params.append("contentRating[]", rating);
    params.append("order[volume]", "asc");
    params.append("order[chapter]", "asc");
    const value = await this.#requestJson(
      `/manga/${encodeURIComponent(mangaId)}/feed?${params.toString()}`,
    );
    const response = requiredRecord(value, "chapter feed response");
    const data = requiredArray(response.data, "chapter feed response.data");
    const chapters = data
      .map((chapter, index) => parseChapter(chapter, `chapter[${index}]`))
      .filter((chapter) => chapter.pages > 0 && !chapter.externalUrl);
    const responseLimit = Number(response.limit);
    const responseOffset = Number(response.offset);
    const responseTotal = Number(response.total);
    const limit =
      Number.isSafeInteger(responseLimit) && responseLimit > 0
        ? responseLimit
        : CHAPTER_RESULT_LIMIT;
    const offset =
      Number.isSafeInteger(responseOffset) && responseOffset >= 0
        ? responseOffset
        : (page - 1) * CHAPTER_RESULT_LIMIT;
    const total =
      Number.isSafeInteger(responseTotal) && responseTotal >= 0
        ? responseTotal
        : offset + data.length;
    return {chapters, limit, offset, total};
  }

  async getChapterFeed(
    mangaId: string,
    languages: readonly SupportedLanguage[],
    page: number,
  ) {
    return (await this.getChapterFeedPage(mangaId, languages, page)).chapters;
  }

  async getAtHomeServer(chapterId: string) {
    const value = await this.#requestJson(
      `/at-home/server/${encodeURIComponent(chapterId)}`,
    );
    return parseAtHomeServer(value);
  }

  async downloadPage(server: MangaDexAtHomeServer, page: string) {
    const url = `${server.baseUrl.replace(/\/$/u, "")}/data/${server.chapter.hash}/${encodeURIComponent(page)}`;
    return this.#requestBytes(url, MAX_IMAGE_RESPONSE_BYTES);
  }

  async #resolveTagList() {
    this.#tagPromise ??= this.#requestJson("/manga/tag").then((value) => {
      const data = requiredArray(
        requiredRecord(value, "manga tag response").data,
        "manga tag response.data",
      );
      return data.flatMap((tag, index) => {
        const record = requiredRecord(tag, `tag[${index}]`);
        const attributes = requiredRecord(
          record.attributes,
          `tag[${index}].attributes`,
        );
        const id = optionalString(record.id);
        const name = firstText(attributes.name, ["en"]);
        return id && name ? [{id, name}] : [];
      });
    });
    return this.#tagPromise;
  }

  async #resolveTagIds(names: readonly string[]) {
    if (names.length === 0) return [];
    const normalizedNames = new Set(names.map(normalizeTag));
    return (await this.#resolveTagList())
      .filter((tag) => normalizedNames.has(normalizeTag(tag.name)))
      .map((tag) => tag.id);
  }

  async #requestJson(path: string) {
    const response = await this.#request(path);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_JSON_RESPONSE_BYTES)
      throw new Error("MangaDex API response was too large");
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new Error("MangaDex API returned invalid JSON");
    }
  }

  async #requestBytes(url: string, maxBytes: number) {
    const response = await this.#request(url);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes)
      throw new Error("MangaDex image response was too large");
    return Buffer.from(bytes);
  }

  async #request(pathOrUrl: string) {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.#apiOrigin}${pathOrUrl}`;
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.#fetcher(url, {
        headers: {Accept: "application/json"},
      });
      if (response.ok) return response;
      if (
        attempt >= this.#retryCount ||
        (response.status < 429 && response.status < 500)
      ) {
        throw new Error(
          `MangaDex request failed with HTTP ${response.status}: ${url}`,
        );
      }
      const delayMilliseconds =
        retryAfterMilliseconds(response) ?? 2 ** attempt * 500;
      this.#onRetry?.({
        delayMilliseconds,
        retryAttempt: attempt + 1,
        retryLimit: this.#retryCount,
        status: response.status,
        url,
      });
      await this.#sleep(delayMilliseconds);
    }
  }
}
