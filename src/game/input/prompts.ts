/**
 * Controller prompt iconography (CC0 Kenney-style SVGs), bundled as assets so
 * they work identically in dev and production builds.
 *
 * Keys come from import.meta.glob as root-relative paths; this module exposes
 * them by icon stem ("xbox-a", "playstation-circle", ...).
 */
const modules = import.meta.glob<string>("/src/assets/input-prompts/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const iconsByStem = new Map<string, string>();
for (const [path, url] of Object.entries(modules)) {
  const stem = path
    .split("/")
    .at(-1)
    ?.replace(/\.svg$/u, "");
  if (stem) iconsByStem.set(stem, url);
}

export const promptIconUrl = (icon: string): string | undefined =>
  iconsByStem.get(icon);
