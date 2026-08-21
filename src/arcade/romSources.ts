import {
  arcadeSystemSupportsFileName,
  findArcadeSystem,
  type ArcadeSystemId,
} from "~/arcade/systems";

/** A playable ROM entry surfaced by a discovery source. */
export type ArcadeRomListing = {
  /** Stable identity used for downloads, saves, and the local library. */
  id: string;
  name: string;
  sizeBytes: number;
  downloadUrl: string;
  systemId: ArcadeSystemId;
};

export const ARCADE_ROM_CONTENT_REPO = {
  owner: "libretro",
  repo: "libretro-content",
  branch: "master",
} as const;

/**
 * Homebrew and freeware content distributed by libretro through the
 * RetroArch content downloader, mirrored on GitHub where raw file serving is
 * CORS-enabled so the browser can download ROMs directly.
 */
const rawRomUrl = (path: string) => {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://raw.githubusercontent.com/${ARCADE_ROM_CONTENT_REPO.owner}/${ARCADE_ROM_CONTENT_REPO.repo}/${ARCADE_ROM_CONTENT_REPO.branch}/${encoded}`;
};

type GitHubContentEntry = {
  name?: unknown;
  size?: unknown;
  type?: unknown;
  download_url?: unknown;
};

/**
 * Converts a GitHub contents-API listing into catalog entries for one system.
 * Exported for tests; returns whatever parsed cleanly.
 */
export const parseLibretroContentListing = (
  systemId: ArcadeSystemId,
  payload: unknown,
): ArcadeRomListing[] => {
  if (!Array.isArray(payload)) return [];
  const system = findArcadeSystem(systemId);
  if (!system) return [];
  const listings: ArcadeRomListing[] = [];
  for (const entry of payload as GitHubContentEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type !== "file") continue;
    if (
      typeof entry.name !== "string" ||
      typeof entry.download_url !== "string"
    )
      continue;
    if (!arcadeSystemSupportsFileName(system, entry.name)) continue;
    const path = `${system.contentPath}/${entry.name}`;
    listings.push({
      id: `libretro-content:${system.id}:${path}`,
      name: entry.name,
      sizeBytes: typeof entry.size === "number" ? entry.size : 0,
      // Prefer the stable raw URL over the API's media download endpoint.
      downloadUrl: rawRomUrl(path),
      systemId,
    });
  }
  return listings.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Small always-available seed of verified freely redistributable ROMs. Used
 * directly when the discovery API is unavailable or rate-limited so the
 * cabinet never boots to an empty shelf.
 */
export const SEED_ROMS: readonly ArcadeRomListing[] = (
  [
    ["nes", "240p Test Suite.nes"],
    ["nes", "Alter Ego.nes"],
    ["nes", "Bobl (v1.1).nes"],
    ["nes", "LJ65.zip"],
    ["nes", "Nova the Squirrel.nes"],
    ["nes", "Spacegulls (v1.1).nes"],
    ["nes", "Super Bat Puncher (Demo).nes"],
    ["snes", "240pTestSuite-SNES-latest.zip"],
    ["snes", "KeepingSNESalive.sfc"],
    ["snes", "N-Warp Daisakusen (Europe).zip"],
    ["snes", "Super Boss Gaiden (Japan).zip"],
    ["arcade", "Alien Arena.zip"],
    ["gb", "Deadeus.gb"],
    ["gb", "Sheep It Up.zip"],
    ["gb", "Tobu Tobu Girl.zip"],
    ["gba", "Celeste Classic (v1.0).zip"],
  ] as const satisfies readonly (readonly [ArcadeSystemId, string])[]
).flatMap(([systemId, fileName]) => {
  const system = findArcadeSystem(systemId);
  if (!system?.contentPath) return [];
  const path = `${system.contentPath}/${fileName}`;
  return [
    {
      id: `libretro-content:${systemId}:${path}`,
      name: fileName,
      sizeBytes: 0,
      downloadUrl: rawRomUrl(path),
      systemId,
    },
  ];
});

const listingCache = new Map<ArcadeSystemId, ArcadeRomListing[]>();

class ArcadediscoveryError extends Error {}

const fetchGitHubJson = async (
  url: string,
  signal: AbortSignal | undefined,
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(url, signal ? {signal} : {});
  } catch (cause) {
    throw new ArcadediscoveryError(
      cause instanceof Error ? cause.message : "Network request failed",
      {cause},
    );
  }
  if (!response.ok)
    throw new ArcadediscoveryError(
      response.status === 403
        ? "The ROM discovery API rate limit was reached."
        : `The ROM discovery API responded with ${response.status}.`,
    );
  try {
    return await response.json();
  } catch (cause) {
    throw new ArcadediscoveryError("The ROM discovery API sent invalid JSON.", {
      cause,
    });
  }
};

const githubContentsApiUrl = (contentPath: string) =>
  `https://api.github.com/repos/${ARCADE_ROM_CONTENT_REPO.owner}/${ARCADE_ROM_CONTENT_REPO.repo}/contents/${encodeURIComponent(contentPath)}`;

/**
 * Lists the freely distributable homebrew ROMs available for a system. Falls
 * back to the bundled seed catalog when live discovery fails.
 */
export const listArcadeSystemRoms = async (
  systemId: ArcadeSystemId,
  options?: {signal?: AbortSignal; forceRefresh?: boolean},
): Promise<{
  listings: readonly ArcadeRomListing[];
  source: "live" | "seed";
}> => {
  if (!options?.forceRefresh) {
    const cached = listingCache.get(systemId);
    if (cached) return {listings: cached, source: "live"};
  }
  const system = findArcadeSystem(systemId);
  if (!system?.contentPath) return {listings: SEED_ROMS, source: "seed"};
  try {
    const payload = await fetchGitHubJson(
      githubContentsApiUrl(system.contentPath),
      options?.signal,
    );
    const listings = parseLibretroContentListing(systemId, payload);
    if (listings.length === 0) throw new ArcadediscoveryError("empty");
    listingCache.set(systemId, listings);
    return {listings, source: "live"};
  } catch (cause) {
    if (options?.signal?.aborted) throw cause;
    if (import.meta.env.DEV)
      console.warn("Arcade discovery fell back to seed.", cause);
    return {listings: SEED_ROMS, source: "seed"};
  }
};
