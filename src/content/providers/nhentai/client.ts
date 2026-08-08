import {createHash, randomUUID} from "node:crypto";
import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const DEFAULT_API_ORIGIN = "https://nhentai.net";
const DEFAULT_IMAGE_ORIGIN = "https://i.nhentai.net";
const DEFAULT_USER_AGENT = "Afterleaf/1.0 (content provider)";
const MAX_API_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_FLARESOLVERR_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 128 * 1024 * 1024;
const DEFAULT_FLARESOLVERR_TIMEOUT_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60_000;
const RATE_LIMIT_RETRY_DELAY_MS = 2_000;
const DEFAULT_API_CACHE_TTL_MS = 60 * 60 * 1_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredInteger = (value: unknown, field: string) => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw new Error(`${field} must be a positive integer`);
  return Number(value);
};

const optionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const retryAfterMilliseconds = (response: Response) => {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  const retryAt = Date.parse(retryAfter);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_DELAY_MS);
};

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

export interface NhentaiTag {
  id: number;
  name: string;
  type: string;
}

export interface NhentaiPage {
  height?: number;
  path?: string;
  type: "j" | "p" | "w";
  width?: number;
}

export interface NhentaiGallerySummary {
  id: number;
  mediaId: string;
  numPages: number;
  tags: NhentaiTag[];
  title: {
    english?: string;
    japanese?: string;
    pretty?: string;
  };
}

export interface NhentaiGallery extends NhentaiGallerySummary {
  pages: NhentaiPage[];
  uploadDate?: number;
}

export interface NhentaiClientOptions {
  apiOrigin?: string;
  cacheDirectory?: string;
  cacheTtlMs?: number;
  cookie?: string;
  fetcher?: typeof fetch;
  flaresolverrUrl?: string;
  imageOrigin?: string;
  onRetry?: (event: NhentaiRequestRetryEvent) => void;
  onCacheHit?: (event: NhentaiApiCacheHitEvent) => void;
  retryCount?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  userAgent?: string;
}

export interface NhentaiApiCacheHitEvent {
  ageMilliseconds: number;
  url: string;
}

export interface NhentaiRequestRetryEvent {
  delayMilliseconds: number;
  delaySource: "backoff" | "retry-after";
  retryAttempt: number;
  retryLimit: number;
  status?: number;
  url: string;
}

export class NhentaiGalleryValidationError extends Error {
  readonly galleryId: number;

  constructor(galleryId: number, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`nHentai gallery ${galleryId} metadata is invalid: ${detail}`, {
      cause,
    });
    this.name = "NhentaiGalleryValidationError";
    this.galleryId = galleryId;
  }
}

interface FlareSolverrCookie {
  name: string;
  value: string;
}

const cookieHeaderToRecords = (cookie: string | undefined) =>
  cookie
    ?.split(";")
    .map((part) => part.trim())
    .flatMap((part): FlareSolverrCookie[] => {
      const equalsIndex = part.indexOf("=");
      if (equalsIndex <= 0) return [];
      const name = part.slice(0, equalsIndex).trim();
      const value = part.slice(equalsIndex + 1).trim();
      return name ? [{name, value}] : [];
    }) ?? [];

const mergeCookieHeader = (
  cookie: string | undefined,
  cookies: readonly FlareSolverrCookie[],
) => {
  const values = new Map(
    cookieHeaderToRecords(cookie).map(({name, value}) => [name, value]),
  );
  for (const {name, value} of cookies) values.set(name, value);
  return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
};

const parseFlareSolverrCookies = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cookie): FlareSolverrCookie[] => {
    if (!isRecord(cookie)) return [];
    const name = optionalString(cookie.name);
    if (!name || typeof cookie.value !== "string") return [];
    return [{name, value: cookie.value}];
  });
};

const normalizeFlareSolverrUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("FlareSolverr URL must use HTTP or HTTPS");
  if (url.pathname === "/") url.pathname = "/v1";
  return url;
};

const decodeHtmlEntities = (value: string) =>
  value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi,
    (
      entity,
      decimal: string | undefined,
      hexadecimal: string | undefined,
      named: string | undefined,
    ) => {
      const codePoint = decimal
        ? Number(decimal)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : undefined;
      if (codePoint !== undefined)
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
      if (!named) return entity;
      return HTML_ENTITIES[named.toLowerCase()] ?? entity;
    },
  );

const unwrapBrowserJson = (value: string) => {
  const match = value.match(/<pre(?:\s[^>]*)?>([\s\S]*?)<\/pre>/i);
  return match?.[1] === undefined ? value : decodeHtmlEntities(match[1]);
};

const cloudflareHint = (usedFlareSolverr: boolean) => {
  if (usedFlareSolverr)
    return " FlareSolverr did not clear the Cloudflare challenge.";
  return " Provide --cookie-file with its matching browser --user-agent, or use --flaresolverr-url http://127.0.0.1:8191/v1.";
};

const extensionByType: Record<NhentaiPage["type"], string> = {
  j: "jpg",
  p: "png",
  w: "webp",
};

const typeByExtension: Record<string, NhentaiPage["type"] | undefined> = {
  jpg: "j",
  png: "p",
  webp: "w",
};

const galleryPages = (value: Record<string, unknown>) => {
  if (Array.isArray(value.pages)) return value.pages;
  if (!isRecord(value.images) || !Array.isArray(value.images.pages))
    return undefined;
  return value.images.pages;
};

const parsePage = (value: unknown, field: string): NhentaiPage => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const path = optionalString(value.path);
  const extension = path?.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  const inferredType = extension ? typeByExtension[extension] : undefined;
  const type = value.t ?? inferredType;
  if (type !== "j" && type !== "p" && type !== "w")
    throw new Error(`${field}.t uses unsupported media type ${String(type)}`);
  if (path && extensionByType[type] !== extension)
    throw new Error(`${field}.path does not match its media type`);
  const width = Number.isSafeInteger(value.w) ? Number(value.w) : undefined;
  const pageWidth = Number.isSafeInteger(value.width)
    ? Number(value.width)
    : width;
  const height = Number.isSafeInteger(value.h) ? Number(value.h) : undefined;
  const pageHeight = Number.isSafeInteger(value.height)
    ? Number(value.height)
    : height;
  return {
    type,
    ...(path === undefined ? {} : {path}),
    ...(pageWidth === undefined ? {} : {width: pageWidth}),
    ...(pageHeight === undefined ? {} : {height: pageHeight}),
  };
};

const parseTag = (value: unknown, field: string): NhentaiTag => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const name = optionalString(value.name);
  const type = optionalString(value.type);
  if (!name || !type) throw new Error(`${field} lacks a name or type`);
  return {id: requiredInteger(value.id, `${field}.id`), name, type};
};

export const parseNhentaiGallery = (
  value: unknown,
  field = "gallery",
): NhentaiGallery => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  if (!isRecord(value.title))
    throw new Error(`${field}.title must be an object`);
  const rawPages = galleryPages(value);
  if (!rawPages) throw new Error(`${field}.pages must be an array`);
  if (!Array.isArray(value.tags))
    throw new Error(`${field}.tags must be an array`);
  const mediaId = String(
    requiredInteger(Number(value.media_id), `${field}.media_id`),
  );
  const pages = rawPages.map((page, index) =>
    parsePage(page, `${field}.pages[${index}]`),
  );
  const numPages = requiredInteger(value.num_pages, `${field}.num_pages`);
  if (pages.length !== numPages)
    throw new Error(
      `${field} declares ${numPages} pages but describes ${pages.length}`,
    );
  for (const [index, page] of pages.entries()) {
    if (!page.path) continue;
    const expectedPath = `galleries/${mediaId}/${index + 1}.${nhentaiPageExtension(page)}`;
    if (page.path !== expectedPath)
      throw new Error(
        `${field}.pages[${index}].path must be ${JSON.stringify(expectedPath)}`,
      );
  }
  const uploadDate = Number.isSafeInteger(value.upload_date)
    ? Number(value.upload_date)
    : undefined;
  return {
    id: requiredInteger(value.id, `${field}.id`),
    mediaId,
    numPages,
    pages,
    tags: value.tags.map((tag, index) =>
      parseTag(tag, `${field}.tags[${index}]`),
    ),
    title: {
      ...(optionalString(value.title.english) === undefined
        ? {}
        : {english: optionalString(value.title.english)}),
      ...(optionalString(value.title.japanese) === undefined
        ? {}
        : {japanese: optionalString(value.title.japanese)}),
      ...(optionalString(value.title.pretty) === undefined
        ? {}
        : {pretty: optionalString(value.title.pretty)}),
    },
    ...(uploadDate === undefined ? {} : {uploadDate}),
  };
};

interface NhentaiSearchResult extends Omit<NhentaiGallerySummary, "tags"> {
  tagIds: number[];
}

const parseNhentaiSearchResult = (
  value: unknown,
  field: string,
): NhentaiSearchResult => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  if (!Array.isArray(value.tag_ids))
    throw new Error(`${field}.tag_ids must be an array`);
  return {
    id: requiredInteger(value.id, `${field}.id`),
    mediaId: String(
      requiredInteger(Number(value.media_id), `${field}.media_id`),
    ),
    numPages: requiredInteger(value.num_pages, `${field}.num_pages`),
    tagIds: value.tag_ids.map((id, index) =>
      requiredInteger(id, `${field}.tag_ids[${index}]`),
    ),
    title: {
      ...(optionalString(value.english_title) === undefined
        ? {}
        : {english: optionalString(value.english_title)}),
      ...(optionalString(value.japanese_title) === undefined
        ? {}
        : {japanese: optionalString(value.japanese_title)}),
    },
  };
};

export const nhentaiPageExtension = (page: NhentaiPage) =>
  extensionByType[page.type];

export class NhentaiClient {
  readonly #apiOrigin: string;
  readonly #apiRequestOrigin: string;
  readonly #cacheDirectory: string | undefined;
  readonly #cacheTtlMs: number;
  #cookie: string | undefined;
  readonly #fetcher: typeof fetch;
  readonly #flaresolverrUrl: URL | undefined;
  readonly #imageOrigin: string;
  readonly #onRetry: ((event: NhentaiRequestRetryEvent) => void) | undefined;
  readonly #onCacheHit: ((event: NhentaiApiCacheHitEvent) => void) | undefined;
  readonly #retryCount: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #tagsById = new Map<number, NhentaiTag>();
  #apiRequestTail = Promise.resolve();
  #userAgent: string;

  constructor(options: NhentaiClientOptions = {}) {
    this.#apiOrigin = options.apiOrigin ?? DEFAULT_API_ORIGIN;
    this.#apiRequestOrigin = new URL(this.#apiOrigin).origin;
    this.#cacheDirectory = options.cacheDirectory;
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_API_CACHE_TTL_MS;
    this.#cookie = options.cookie;
    this.#fetcher = options.fetcher ?? fetch;
    this.#flaresolverrUrl = options.flaresolverrUrl
      ? normalizeFlareSolverrUrl(options.flaresolverrUrl)
      : undefined;
    this.#imageOrigin = options.imageOrigin ?? DEFAULT_IMAGE_ORIGIN;
    this.#onRetry = options.onRetry;
    this.#onCacheHit = options.onCacheHit;
    this.#retryCount = options.retryCount ?? 3;
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolvePromise) =>
          setTimeout(resolvePromise, milliseconds),
        ));
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async search(query: string, page: number) {
    const url = new URL("/api/v2/search", this.#apiOrigin);
    url.searchParams.set("query", query);
    url.searchParams.set("sort", "date");
    url.searchParams.set("page", String(page));
    const value = await this.#requestJson(url);
    if (!isRecord(value) || !Array.isArray(value.result))
      throw new Error("nHentai search response lacks a result array");
    const results = value.result.map((gallery, index) =>
      parseNhentaiSearchResult(gallery, `result[${index}]`),
    );
    await this.#loadTags(results.flatMap(({tagIds}) => tagIds));
    return results.map(({tagIds, ...gallery}) => ({
      ...gallery,
      tags: tagIds.map((id) => {
        const tag = this.#tagsById.get(id);
        if (!tag) throw new Error(`nHentai tag lookup omitted tag ${id}`);
        return tag;
      }),
    }));
  }

  async loadGallery(id: number) {
    const url = new URL(`/api/v2/galleries/${id}`, this.#apiOrigin);
    const value = await this.#requestJson(url);
    let gallery: NhentaiGallery;
    try {
      gallery = parseNhentaiGallery(value);
    } catch (error) {
      throw new NhentaiGalleryValidationError(id, error);
    }
    if (gallery.id !== id)
      throw new NhentaiGalleryValidationError(
        id,
        `nHentai returned gallery ${gallery.id} for request ${id}`,
      );
    return gallery;
  }

  async downloadPage(
    gallery: Pick<NhentaiGallery, "id" | "mediaId" | "pages">,
    pageIndex: number,
  ) {
    const page = gallery.pages[pageIndex];
    if (!page)
      throw new Error(`Gallery ${gallery.id} has no page ${pageIndex + 1}`);
    const extension = nhentaiPageExtension(page);
    const url = new URL(
      page.path ??
        `/galleries/${gallery.mediaId}/${pageIndex + 1}.${extension}`,
      `${this.#imageOrigin}/`,
    );
    const response = await this.#request(url, {
      headers: {Referer: `${this.#apiOrigin}/g/${gallery.id}/`},
    });
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_IMAGE_RESPONSE_BYTES
    )
      throw new Error(`Image response exceeds 128 MiB: ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_RESPONSE_BYTES)
      throw new Error(`Image response exceeds 128 MiB: ${url}`);
    return bytes;
  }

  async #loadTags(ids: readonly number[]) {
    const missingIds = [...new Set(ids)].filter(
      (id) => !this.#tagsById.has(id),
    );
    for (let index = 0; index < missingIds.length; index += 100) {
      const chunk = missingIds.slice(index, index + 100);
      const url = new URL("/api/v2/tags/ids", this.#apiOrigin);
      url.searchParams.set("ids", chunk.join(","));
      const value = await this.#requestJson(url);
      if (!Array.isArray(value))
        throw new Error("nHentai tag response must be an array");
      for (const [tagIndex, tagValue] of value.entries()) {
        const tag = parseTag(tagValue, `tags[${tagIndex}]`);
        this.#tagsById.set(tag.id, tag);
      }
    }
  }

  async #requestJson(url: URL) {
    const cached = await this.#readCachedJson(url);
    if (cached !== undefined) return cached;
    return this.#withApiRequestLock(async () => {
      const queuedCacheHit = await this.#readCachedJson(url);
      if (queuedCacheHit !== undefined) return queuedCacheHit;
      const response = await this.#request(url);
      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_API_RESPONSE_BYTES
      )
        throw new Error(`API response exceeds 16 MiB: ${url}`);
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_API_RESPONSE_BYTES)
        throw new Error(`API response exceeds 16 MiB: ${url}`);
      let value: unknown;
      try {
        value = JSON.parse(text) as unknown;
      } catch (error) {
        const unwrapped = unwrapBrowserJson(text);
        if (unwrapped === text) throw error;
        value = JSON.parse(unwrapped) as unknown;
      }
      await this.#writeCachedJson(url, JSON.stringify(value));
      return value;
    });
  }

  async #withApiRequestLock<Result>(operation: () => Promise<Result>) {
    const previous = this.#apiRequestTail;
    let release = () => {};
    this.#apiRequestTail = new Promise<void>((resolvePromise) => {
      release = resolvePromise;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  #cachePath(url: URL) {
    if (!this.#cacheDirectory || url.origin !== this.#apiRequestOrigin)
      return undefined;
    const key = createHash("sha256").update(String(url)).digest("hex");
    return resolve(this.#cacheDirectory, `${key}.json`);
  }

  async #readCachedJson(url: URL) {
    const path = this.#cachePath(url);
    if (!path || this.#cacheTtlMs <= 0) return undefined;
    try {
      const file = await stat(path);
      const ageMilliseconds = Math.max(0, Date.now() - file.mtimeMs);
      if (ageMilliseconds > this.#cacheTtlMs) return undefined;
      const text = await readFile(path, "utf8");
      const value = JSON.parse(text) as unknown;
      this.#onCacheHit?.({ageMilliseconds, url: String(url)});
      return value;
    } catch {
      return undefined;
    }
  }

  async #writeCachedJson(url: URL, text: string) {
    const path = this.#cachePath(url);
    const directory = this.#cacheDirectory;
    if (!path || !directory || this.#cacheTtlMs <= 0) return;
    const temporaryPath = `${path}.staging-${randomUUID()}`;
    try {
      await mkdir(directory, {recursive: true});
      await writeFile(temporaryPath, text);
      await rename(temporaryPath, path);
    } catch {
      await rm(temporaryPath, {force: true}).catch(() => {});
      // A cache write must never prevent a successful provider response.
    }
  }

  async #requestWithFlareSolverr(url: URL) {
    const endpoint = this.#flaresolverrUrl;
    if (!endpoint) throw new Error("FlareSolverr is not configured");
    const cookies = cookieHeaderToRecords(this.#cookie);
    const response = await this.#fetcher(endpoint, {
      body: JSON.stringify({
        cmd: "request.get",
        cookies,
        disableMedia: true,
        maxTimeout: DEFAULT_FLARESOLVERR_TIMEOUT_MS,
        url: String(url),
      }),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(DEFAULT_FLARESOLVERR_TIMEOUT_MS + 5_000),
    });
    if (!response.ok)
      throw new Error(
        `FlareSolverr failed with HTTP ${response.status}: ${endpoint}`,
      );
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_FLARESOLVERR_RESPONSE_BYTES
    )
      throw new Error(`FlareSolverr response exceeds 32 MiB: ${endpoint}`);
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_FLARESOLVERR_RESPONSE_BYTES)
      throw new Error(`FlareSolverr response exceeds 32 MiB: ${endpoint}`);

    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`FlareSolverr returned invalid JSON: ${endpoint}`);
    }
    if (!isRecord(value))
      throw new Error(`FlareSolverr returned an invalid response: ${endpoint}`);
    if (value.status !== "ok")
      throw new Error(
        `FlareSolverr could not solve ${url}: ${optionalString(value.message) ?? "unknown error"}`,
      );
    const solution = value.solution;
    if (!isRecord(solution) || typeof solution.response !== "string")
      throw new Error(`FlareSolverr returned an invalid solution: ${endpoint}`);
    const status = Number(solution.status);
    if (!Number.isInteger(status) || status < 100 || status > 599)
      throw new Error(
        `FlareSolverr returned an invalid HTTP status: ${endpoint}`,
      );

    const solvedCookies = parseFlareSolverrCookies(solution.cookies);
    if (solvedCookies.length > 0)
      this.#cookie = mergeCookieHeader(this.#cookie, solvedCookies);
    const solvedUserAgent = optionalString(solution.userAgent);
    if (solvedUserAgent) this.#userAgent = solvedUserAgent;
    return new Response(solution.response, {
      headers: {"Content-Type": "application/json; charset=utf-8"},
      status,
    });
  }

  async #request(url: URL, init: RequestInit = {}) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#retryCount; attempt += 1) {
      let response: Response;
      try {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json,image/*;q=0.9,*/*;q=0.1");
        headers.set("User-Agent", this.#userAgent);
        if (this.#cookie) headers.set("Cookie", this.#cookie);
        response = await this.#fetcher(url, {...init, headers});
      } catch (error) {
        lastError = error;
        if (attempt < this.#retryCount)
          await this.#waitBeforeRetry(url, attempt, 500 * 2 ** attempt);
        continue;
      }
      let usedFlareSolverr = false;
      if (
        response.status === 403 &&
        this.#flaresolverrUrl &&
        url.origin === this.#apiRequestOrigin
      ) {
        try {
          response = await this.#requestWithFlareSolverr(url);
          usedFlareSolverr = true;
        } catch (error) {
          lastError = error;
          if (attempt < this.#retryCount)
            await this.#waitBeforeRetry(url, attempt, 500 * 2 ** attempt);
          continue;
        }
      }
      if (response.ok) return response;
      const cookieHint =
        response.status === 403 ? cloudflareHint(usedFlareSolverr) : "";
      const responseError = new Error(
        `Request failed with HTTP ${response.status}: ${url}.${cookieHint}`,
      );
      if (response.status < 500 && response.status !== 429) throw responseError;
      lastError = responseError;
      if (attempt < this.#retryCount) {
        const retryAfter = retryAfterMilliseconds(response);
        const fallbackDelay = 500 * 2 ** attempt;
        const retryDelay =
          response.status === 429
            ? (retryAfter ?? RATE_LIMIT_RETRY_DELAY_MS)
            : (retryAfter ?? Math.min(fallbackDelay, MAX_RETRY_DELAY_MS));
        await this.#waitBeforeRetry(
          url,
          attempt,
          retryDelay,
          response.status,
          retryAfter === undefined ? "backoff" : "retry-after",
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async #waitBeforeRetry(
    url: URL,
    attempt: number,
    delayMilliseconds: number,
    status?: number,
    delaySource: NhentaiRequestRetryEvent["delaySource"] = "backoff",
  ) {
    try {
      this.#onRetry?.({
        delayMilliseconds,
        delaySource,
        retryAttempt: attempt + 1,
        retryLimit: this.#retryCount,
        ...(status === undefined ? {} : {status}),
        url: String(url),
      });
    } catch {
      // Diagnostics must never interfere with acquisition retries.
    }
    await this.#sleep(delayMilliseconds);
  }
}
