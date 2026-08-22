import {normalizeTag, type SupportedLanguage} from "@afterleaf/provider-sdk";

const DEFAULT_ORIGIN = "https://weebcentral.com";
const DEFAULT_REQUEST_INTERVAL_MILLISECONDS = 2_000;
const MAX_HTML_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 128 * 1024 * 1024;
const SEARCH_RESULT_LIMIT = 32;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Afterleaf/1";

const TAG_NAMES = new Map(
  [
    "Action",
    "Adult",
    "Adventure",
    "Comedy",
    "Doujinshi",
    "Drama",
    "Ecchi",
    "Fantasy",
    "Gender Bender",
    "Harem",
    "Hentai",
    "Historical",
    "Horror",
    "Isekai",
    "Josei",
    "Lolicon",
    "Martial Arts",
    "Mature",
    "Mecha",
    "Mystery",
    "Psychological",
    "Romance",
    "School Life",
    "Sci-fi",
    "Seinen",
    "Shotacon",
    "Shoujo",
    "Shoujo Ai",
    "Shounen",
    "Shounen Ai",
    "Slice of Life",
    "Smut",
    "Sports",
    "Supernatural",
    "Tragedy",
    "Yaoi",
    "Yuri",
    "Other",
  ].map((tag) => [normalizeTag(tag), tag]),
);

const optionalString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const requiredString = (value: string | null | undefined, field: string) => {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`${field} must be a non-empty string`);
  return parsed;
};

const normalizeOrigin = (origin: string) => {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("WeebCentral origin must use HTTP or HTTPS");
  return url.toString().replace(/\/$/u, "");
};

const parseUrl = (value: string, base: string, field: string) => {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error(`${field} must use HTTP or HTTPS`);
  return url;
};

const assertSafeRemoteAssetUrl = (url: URL, field: string) => {
  const hostname = url.hostname.toLowerCase();
  const unbracketedHostname = hostname.replace(/^\[|\]$/gu, "");
  const privateIpv4 = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u,
  );
  if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS`);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    unbracketedHostname === "::1" ||
    (unbracketedHostname.includes(":") &&
      (unbracketedHostname.startsWith("fc") ||
        unbracketedHostname.startsWith("fd") ||
        unbracketedHostname.startsWith("fe80:")))
  )
    throw new Error(`${field} cannot use a private host`);
  if (privateIpv4) {
    const first = Number(privateIpv4[1]);
    const second = Number(privateIpv4[2]);
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    )
      throw new Error(`${field} cannot use a private host`);
  }
  return url;
};

const responseBytes = async (
  response: Response,
  maximumBytes: number,
  label: string,
) => {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes)
    throw new Error(`${label} response was too large`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maximumBytes)
    throw new Error(`${label} response was too large`);
  return bytes;
};

const parseHtml = async (
  html: string,
  configure: (rewriter: HTMLRewriter) => HTMLRewriter,
) => {
  await configure(new HTMLRewriter()).transform(new Response(html)).text();
};

const collectText = (
  rewriter: HTMLRewriter,
  selector: string,
  values: string[],
) =>
  rewriter.on(selector, {
    element() {
      values.push("");
    },
    text(text) {
      const index = values.length - 1;
      if (index >= 0) values[index] = `${values[index] ?? ""}${text.text}`;
    },
  });

const seriesReferenceFromHref = (
  href: string,
  origin: string,
): WeebCentralSeriesReference | undefined => {
  const url = parseUrl(href, origin, "WeebCentral series URL");
  if (url.origin !== origin) return undefined;
  const [root, id, slug] = url.pathname.split("/").filter(Boolean);
  if (root !== "series" || !id || !slug) return undefined;
  if (!/^[a-z\d_-]+$/iu.test(id))
    throw new Error("WeebCentral series ID contains unsupported characters");
  return {id, path: `/series/${id}/${slug}`, slug};
};

export interface WeebCentralSeriesReference {
  id: string;
  path: string;
  slug: string;
}

export interface WeebCentralSeries extends WeebCentralSeriesReference {
  adult: boolean;
  authors: string[];
  coverUrl?: string;
  description?: string;
  officialTranslation: boolean;
  status?: string;
  tags: string[];
  title: string;
  type?: string;
  year?: number;
}

export interface WeebCentralChapter {
  id: string;
  label: string;
  number: number;
  path: string;
  publishedAt?: string;
}

export interface WeebCentralSearchPage {
  hasNextPage: boolean;
  series: WeebCentralSeriesReference[];
}

export interface WeebCentralClientOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  onRetry?: (event: WeebCentralRequestRetryEvent) => void;
  origin?: string;
  requestIntervalMilliseconds?: number;
  retryCount?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface WeebCentralRequestRetryEvent {
  delayMilliseconds: number;
  retryAttempt: number;
  retryLimit: number;
  status?: number;
  url: string;
}

export const parseWeebCentralSearchHtml = async (
  html: string,
  origin = DEFAULT_ORIGIN,
): Promise<WeebCentralSearchPage> => {
  const normalizedOrigin = normalizeOrigin(origin);
  const hrefs: string[] = [];
  let hasNextPage = false;
  await parseHtml(html, (rewriter) =>
    rewriter
      .on('a[href*="/series/"]', {
        element(element) {
          const href = optionalString(element.getAttribute("href"));
          if (href) hrefs.push(href);
        },
      })
      .on("button", {
        element() {
          hasNextPage = true;
        },
      }),
  );
  const series = new Map<string, WeebCentralSeriesReference>();
  for (const href of hrefs) {
    const reference = seriesReferenceFromHref(href, normalizedOrigin);
    if (reference) series.set(reference.id, reference);
  }
  return {hasNextPage, series: [...series.values()]};
};

export const parseWeebCentralSeriesHtml = async (
  html: string,
  reference: WeebCentralSeriesReference,
  origin = DEFAULT_ORIGIN,
): Promise<WeebCentralSeries> => {
  const normalizedOrigin = normalizeOrigin(origin);
  const titles: string[] = [];
  const authors: string[] = [];
  const tags: string[] = [];
  const descriptions: string[] = [];
  const statuses: string[] = [];
  const types: string[] = [];
  const officialValues: string[] = [];
  const adultValues: string[] = [];
  const coverUrls: string[] = [];
  await parseHtml(html, (rewriter) => {
    collectText(rewriter, "h1", titles);
    collectText(rewriter, 'a[href*="author="]', authors);
    collectText(rewriter, 'a[href*="included_tag="]', tags);
    collectText(rewriter, "p.whitespace-pre-wrap", descriptions);
    collectText(rewriter, 'a[href*="included_status="]', statuses);
    collectText(rewriter, 'a[href*="included_type="]', types);
    collectText(rewriter, 'a[href*="official="]', officialValues);
    collectText(rewriter, 'a[href*="adult="]', adultValues);
    return rewriter.on('img[alt$=" cover"]', {
      element(element) {
        const src = optionalString(element.getAttribute("src"));
        if (src) coverUrls.push(src);
      },
    });
  });
  const title = requiredString(
    titles.map(optionalString).find(Boolean),
    "WeebCentral series title",
  );
  const adultText = requiredString(
    adultValues.map(optionalString).find(Boolean),
    "WeebCentral adult-content marker",
  );
  const adult = adultText.toLowerCase() === "yes";
  if (!adult && adultText.toLowerCase() !== "no")
    throw new Error("WeebCentral adult-content marker is invalid");
  const officialText = officialValues.map(optionalString).find(Boolean);
  const description = descriptions.map(optionalString).find(Boolean);
  const status = statuses.map(optionalString).find(Boolean);
  const seriesType = types.map(optionalString).find(Boolean);
  const coverUrl = coverUrls[0]
    ? parseUrl(
        coverUrls[0],
        normalizedOrigin,
        "WeebCentral cover URL",
      ).toString()
    : undefined;
  const yearText = html.match(
    /<strong>\s*Released:\s*<\/strong>\s*<span>\s*(\d{4})\s*<\/span>/iu,
  )?.[1];
  const year = yearText ? Number(yearText) : undefined;
  return {
    ...reference,
    adult,
    authors: [
      ...new Set(
        authors
          .map(optionalString)
          .filter((author): author is string => author !== undefined),
      ),
    ],
    ...(coverUrl ? {coverUrl} : {}),
    ...(description === undefined ? {} : {description}),
    officialTranslation: officialText?.toLowerCase() === "yes",
    ...(status === undefined ? {} : {status}),
    tags: [
      ...new Set(
        tags
          .map(optionalString)
          .filter((tag): tag is string => tag !== undefined),
      ),
    ],
    title,
    ...(seriesType === undefined ? {} : {type: seriesType}),
    ...(year === undefined ? {} : {year}),
  };
};

export const parseWeebCentralChapterListHtml = async (
  html: string,
  origin = DEFAULT_ORIGIN,
): Promise<WeebCentralChapter[]> => {
  const normalizedOrigin = normalizeOrigin(origin);
  const rows: Array<{href: string; text: string}> = [];
  const dates: string[] = [];
  await parseHtml(html, (rewriter) => {
    rewriter.on('a[href*="/chapters/"]', {
      element(element) {
        const href = requiredString(
          element.getAttribute("href"),
          "WeebCentral chapter URL",
        );
        rows.push({href, text: ""});
      },
      text(text) {
        const row = rows.at(-1);
        if (row) row.text += text.text;
      },
    });
    return rewriter.on("time[datetime]", {
      element(element) {
        dates.push(element.getAttribute("datetime") ?? "");
      },
    });
  });
  return rows.map((row, index) => {
    const url = parseUrl(row.href, normalizedOrigin, "WeebCentral chapter URL");
    if (url.origin !== normalizedOrigin)
      throw new Error("WeebCentral chapter URL changed origin");
    const [root, id] = url.pathname.split("/").filter(Boolean);
    if (root !== "chapters" || !id || !/^[a-z\d_-]+$/iu.test(id))
      throw new Error("WeebCentral chapter URL is malformed");
    const match = row.text.match(/Chapter\s+(\d+(?:\.\d+)?)/iu);
    if (!match?.[1]) throw new Error(`WeebCentral chapter ${id} has no number`);
    const number = Number(match[1]);
    if (!Number.isFinite(number) || number <= 0)
      throw new Error(`WeebCentral chapter ${id} has an invalid number`);
    const publishedAt = optionalString(dates[index]);
    if (publishedAt && Number.isNaN(Date.parse(publishedAt)))
      throw new Error(`WeebCentral chapter ${id} has an invalid date`);
    return {
      id,
      label: `Chapter ${match[1]}`,
      number,
      path: `/chapters/${id}`,
      ...(publishedAt ? {publishedAt} : {}),
    };
  });
};

export const parseWeebCentralPageListHtml = async (
  html: string,
  origin = DEFAULT_ORIGIN,
) => {
  const pageUrls: string[] = [];
  await parseHtml(html, (rewriter) =>
    rewriter.on('img[alt^="Page "]', {
      element(element) {
        const src = requiredString(
          element.getAttribute("src"),
          "WeebCentral page URL",
        );
        pageUrls.push(
          assertSafeRemoteAssetUrl(
            parseUrl(src, origin, "WeebCentral page URL"),
            "WeebCentral page URL",
          ).toString(),
        );
      },
    }),
  );
  if (pageUrls.length === 0)
    throw new Error("WeebCentral chapter returned no pages");
  return pageUrls;
};

const retryAfterMilliseconds = (response: Response) => {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1_000, 60_000)
    : undefined;
};

const isRetryableStatus = (status: number) =>
  status === 403 || status === 408 || status === 429 || status >= 500;

export class WeebCentralClient {
  readonly #fetcher: typeof fetch;
  readonly #now: () => number;
  readonly #onRetry:
    | ((event: WeebCentralRequestRetryEvent) => void)
    | undefined;
  readonly #origin: string;
  readonly #requestIntervalMilliseconds: number;
  readonly #retryCount: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #lastSiteRequestAt = Number.NEGATIVE_INFINITY;
  #siteRequestQueue: Promise<void> = Promise.resolve();

  constructor(options: WeebCentralClientOptions = {}) {
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#onRetry = options.onRetry;
    this.#origin = normalizeOrigin(options.origin ?? DEFAULT_ORIGIN);
    this.#requestIntervalMilliseconds = Math.max(
      0,
      options.requestIntervalMilliseconds ??
        DEFAULT_REQUEST_INTERVAL_MILLISECONDS,
    );
    this.#retryCount = Math.max(0, Math.min(5, options.retryCount ?? 2));
    this.#sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  }

  get origin() {
    return this.#origin;
  }

  async searchSeries(
    query: string,
    page: number,
    languages: readonly SupportedLanguage[],
    blockedTags: readonly string[],
  ) {
    if (!Number.isSafeInteger(page) || page <= 0)
      throw new Error("WeebCentral search page must be a positive integer");
    if (!languages.includes("english"))
      throw new Error("WeebCentral only supports English publications");
    const params = new URLSearchParams({
      adult: "False",
      anime: "Any",
      display_mode: "Full Display",
      limit: String(SEARCH_RESULT_LIMIT),
      offset: String((page - 1) * SEARCH_RESULT_LIMIT),
      official: "Any",
      order: "Descending",
      sort: query.trim() ? "Best Match" : "Latest Updates",
      text: query.trim(),
    });
    for (const blockedTag of blockedTags) {
      const remoteTag = TAG_NAMES.get(normalizeTag(blockedTag));
      if (remoteTag) params.append("excluded_tag", remoteTag);
    }
    const html = await this.#requestHtml(`/search/data?${params.toString()}`);
    return parseWeebCentralSearchHtml(html, this.#origin);
  }

  async getSeriesDetails(reference: WeebCentralSeriesReference) {
    const html = await this.#requestHtml(reference.path);
    return parseWeebCentralSeriesHtml(html, reference, this.#origin);
  }

  async getChapterList(seriesId: string) {
    const html = await this.#requestHtml(
      `/series/${encodeURIComponent(seriesId)}/full-chapter-list`,
    );
    return parseWeebCentralChapterListHtml(html, this.#origin);
  }

  async getPageList(chapterId: string) {
    const params = new URLSearchParams({
      is_prev: "False",
      reading_style: "long_strip",
    });
    const html = await this.#requestHtml(
      `/chapters/${encodeURIComponent(chapterId)}/images?${params.toString()}`,
    );
    return parseWeebCentralPageListHtml(html, this.#origin);
  }

  async downloadPage(pageUrl: string) {
    const url = assertSafeRemoteAssetUrl(
      parseUrl(pageUrl, this.#origin, "WeebCentral page URL"),
      "WeebCentral page URL",
    );
    const response = await this.#request(url.toString(), {
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
      Referer: `${this.#origin}/`,
    });
    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.toLowerCase().startsWith("image/"))
      throw new Error("WeebCentral page response was not an image");
    if (response.url)
      assertSafeRemoteAssetUrl(
        parseUrl(response.url, this.#origin, "WeebCentral image redirect URL"),
        "WeebCentral image redirect URL",
      );
    const bytes = Buffer.from(
      await responseBytes(
        response,
        MAX_IMAGE_RESPONSE_BYTES,
        "WeebCentral image",
      ),
    );
    if (bytes.length === 0)
      throw new Error("WeebCentral page response was empty");
    return bytes;
  }

  async #requestHtml(path: string) {
    const response = await this.#siteRequest(`${this.#origin}${path}`, {
      Accept: "text/html,application/xhtml+xml",
      Referer: `${this.#origin}/`,
    });
    if (response.url && new URL(response.url).origin !== this.#origin)
      throw new Error("WeebCentral HTML response changed origin");
    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.toLowerCase().includes("text/html"))
      throw new Error("WeebCentral returned a non-HTML response");
    const bytes = await responseBytes(
      response,
      MAX_HTML_RESPONSE_BYTES,
      "WeebCentral HTML",
    );
    return new TextDecoder().decode(bytes);
  }

  #siteRequest(url: string, headers: Record<string, string>) {
    const run = this.#siteRequestQueue.then(async () => {
      const delay = Math.max(
        0,
        this.#lastSiteRequestAt +
          this.#requestIntervalMilliseconds -
          this.#now(),
      );
      if (delay > 0) await this.#sleep(delay);
      this.#lastSiteRequestAt = this.#now();
      return this.#request(url, headers, this.#requestIntervalMilliseconds);
    });
    this.#siteRequestQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #request(
    url: string,
    headers: Record<string, string>,
    minimumRetryDelayMilliseconds = 0,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.#fetcher(url, {
        headers: {...headers, "User-Agent": USER_AGENT},
        redirect: "follow",
      });
      if (response.ok) return response;
      if (attempt >= this.#retryCount || !isRetryableStatus(response.status))
        throw new Error(
          `WeebCentral request failed with HTTP ${response.status}: ${url}`,
        );
      await response.body?.cancel();
      const delayMilliseconds = Math.max(
        minimumRetryDelayMilliseconds,
        retryAfterMilliseconds(response) ?? 2 ** attempt * 1_000,
      );
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
