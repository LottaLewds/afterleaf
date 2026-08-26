/**
 * Registry of emulated systems available on the shop's arcade cabinet.
 *
 * `core` is the EmulatorJS `EJS_core` value and `extensions` are the ROM file
 * extensions (lowercase, without dots) accepted for the system. Games come
 * from a local folder the user configures for each system in the Options
 * menu; see `~/arcade/romFolders`.
 */
export type ArcadeSystemId =
  | "nes"
  | "snes"
  | "arcade"
  | "gb"
  | "gba"
  | "n64"
  | "vb"
  | "segaMS"
  | "segaMD"
  | "segaGG"
  | "pce"
  | "atari2600";

export type ArcadeControlHint = {
  keys: string;
  action: string;
};

export type ArcadeSystem = {
  id: ArcadeSystemId;
  label: string;
  shortLabel: string;
  core: string;
  extensions: readonly string[];
  controlHints: readonly ArcadeControlHint[];
};

const CONSOLE_HINTS = [
  {keys: "Arrows", action: "D-pad"},
  {keys: "Z / X", action: "B / A buttons"},
  {keys: "Enter", action: "Start"},
  {keys: "Shift", action: "Select"},
] as const satisfies readonly ArcadeControlHint[];

export const ARCADE_SYSTEMS: readonly ArcadeSystem[] = [
  {
    id: "nes",
    label: "NES / Famicom",
    shortLabel: "NES",
    core: "nes",
    extensions: ["nes", "fds", "unf", "unif"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "snes",
    label: "SNES",
    shortLabel: "SNES",
    core: "snes",
    extensions: ["smc", "sfc", "swc", "fig"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "arcade",
    label: "Arcade · MAME 2003+",
    shortLabel: "Arcade",
    core: "mame2003",
    extensions: ["zip"],
    controlHints: [
      {keys: "Arrows", action: "Joystick"},
      {keys: "Z / X / C", action: "Action buttons"},
      {keys: "Enter", action: "Start"},
      {keys: "Shift", action: "Coin / credit"},
    ],
  },
  {
    id: "gb",
    label: "Game Boy & Color",
    shortLabel: "Game Boy",
    core: "gb",
    extensions: ["gb", "gbc", "dmg"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "gba",
    label: "Game Boy Advance",
    shortLabel: "GBA",
    core: "gba",
    extensions: ["gba", "agb"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "n64",
    label: "Nintendo 64",
    shortLabel: "N64",
    core: "n64",
    extensions: ["n64", "z64", "v64", "ndd"],
    controlHints: [
      ...CONSOLE_HINTS,
      {keys: "I / J / K / L", action: "C buttons"},
      {keys: "Q / E / W", action: "L / R / Z"},
    ],
  },
  {
    id: "vb",
    label: "Virtual Boy",
    shortLabel: "Virtual Boy",
    core: "vb",
    extensions: ["vb", "vboy"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "segaMS",
    label: "Sega Master System",
    shortLabel: "Master System",
    core: "segaMS",
    extensions: ["sms"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "segaMD",
    label: "Sega Mega Drive / Genesis",
    shortLabel: "Mega Drive",
    core: "segaMD",
    extensions: ["md", "gen", "smd", "bin", "68k"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "segaGG",
    label: "Sega Game Gear",
    shortLabel: "Game Gear",
    core: "segaGG",
    extensions: ["gg"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "pce",
    label: "PC Engine / TurboGrafx-16",
    shortLabel: "PC Engine",
    core: "pce",
    extensions: ["pce", "sgx", "cue", "ccd"],
    controlHints: CONSOLE_HINTS,
  },
  {
    id: "atari2600",
    label: "Atari 2600",
    shortLabel: "Atari 2600",
    core: "atari2600",
    extensions: ["a26"],
    controlHints: [
      {keys: "Arrows", action: "Joystick"},
      {keys: "X", action: "Button"},
      {keys: "Enter", action: "Game select / start"},
    ],
  },
];

const systemsById = new Map<string, ArcadeSystem>(ARCADE_SYSTEMS.map((system) => [system.id, system]));

/**
 * Archive containers EmulatorJS decompresses for any core. Discovery sources
 * often ship ROMs zipped regardless of system, so these are playable
 * everywhere.
 */
export const ARCHIVE_EXTENSIONS: readonly string[] = ["zip", "7z"];

const extensionToSystem = (() => {
  const map = new Map<string, ArcadeSystem>();
  // First system wins for shared extensions so lookups stay deterministic.
  for (let index = ARCADE_SYSTEMS.length - 1; index >= 0; index -= 1) {
    const system = ARCADE_SYSTEMS[index];
    if (!system) continue;
    for (const extension of system.extensions) map.set(extension.toLowerCase(), system);
  }
  return map;
})();

/** File input accept pattern covering every known ROM extension. */
export const ARCADE_ROM_ACCEPT = ARCADE_SYSTEMS.flatMap((system) => system.extensions)
  .map((extension) => `.${extension}`)
  .join(",");

export const findArcadeSystem = (id: string): ArcadeSystem | undefined => systemsById.get(id);

export const arcadeFileNameExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
};

export const guessArcadeSystemByFileName = (fileName: string): ArcadeSystem | undefined =>
  extensionToSystem.get(arcadeFileNameExtension(fileName));

export const arcadeSystemSupportsFileName = (system: ArcadeSystem, fileName: string): boolean => {
  const extension = arcadeFileNameExtension(fileName);
  if (extension === "") return false;
  // Zipped ROMs are playable on every system via EmulatorJS decompression.
  return ARCHIVE_EXTENSIONS.includes(extension) || system.extensions.includes(extension);
};

/**
 * Stable numeric game identifier for EmulatorJS save-data separation.
 * Deterministic across sessions because it hashes the identity fields only.
 */
export const arcadeGameId = (systemId: string, romName: string): number => {
  let hash = 2166136261;
  const value = `${systemId}:${romName}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // EmulatorJS expects a positive 32-bit integer below 2^31.
  return (hash >>> 0) % 2147483647;
};
