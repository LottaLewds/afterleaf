import type {
  ContentPackCatalog,
  PackedPublication,
  PublicationIssue,
} from "~/content/schema";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const encodeAssetPath = (path: string) => {
  const segments = path.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  )
    throw new Error(
      `Preview asset path must be a contained relative path: ${path}`,
    );
  return segments.map(encodeURIComponent).join("/");
};

const formatIssue = (issue: PublicationIssue | undefined) => {
  if (!issue) return undefined;
  const parts: string[] = [];
  if (issue.year !== undefined && issue.month !== undefined)
    parts.push(`${issue.year}-${String(issue.month).padStart(2, "0")}`);
  else if (issue.year !== undefined) parts.push(String(issue.year));
  if (issue.number !== undefined) parts.push(`No. ${issue.number}`);
  if (issue.label !== undefined) parts.push(issue.label);
  return parts.join(" · ");
};

const renderTags = (tags: readonly string[]) =>
  tags.map((tag) => `<li class="tag">${escapeHtml(tag)}</li>`).join("");

const renderPublication = (publication: PackedPublication, index: number) => {
  const issue = formatIssue(publication.issue);
  const group = publication.groupId ?? "independent";
  const physicalDetails = [
    publication.kind,
    publication.physical.trim,
    publication.physical.thicknessMm === undefined
      ? undefined
      : `${publication.physical.thicknessMm} mm`,
    publication.physical.readingDirection?.toUpperCase() ??
      "DIRECTION UNSPECIFIED",
  ].filter((value): value is string => value !== undefined);
  return `<li class="publication-card" style="--card-index: ${index}">
  <figure class="book-stage">
    <img class="book-cover" src="${encodeAssetPath(publication.assets.front)}" alt="Front cover of ${escapeHtml(publication.title)}" loading="lazy">
    <img class="book-spine" src="${encodeAssetPath(publication.assets.spine)}" alt="" loading="lazy">
    <figcaption class="shelf-index">${String(index + 1).padStart(2, "0")}</figcaption>
  </figure>
  <div class="publication-copy">
    <div class="eyebrow-row">
      <span class="language language-${publication.language}">${escapeHtml(publication.language)}</span>
      <span>${escapeHtml(group)}</span>
    </div>
    <h2>${escapeHtml(publication.title)}</h2>
    ${issue === undefined ? "" : `<p class="issue">${escapeHtml(issue)}</p>`}
    <p class="physical">${physicalDetails.map(escapeHtml).join(" · ")}</p>
    <ul class="tags" aria-label="Tags">${renderTags(publication.tags)}</ul>
  </div>
</li>`;
};

const renderAtlas = (
  label: string,
  path: string,
  dimensions: string,
) => `<figure class="atlas">
  <figcaption>${escapeHtml(label)} <span>${escapeHtml(dimensions)}</span></figcaption>
  <img src="${encodeAssetPath(path)}" alt="${escapeHtml(label)}">
</figure>`;

export const generateContentPackPreview = (catalog: ContentPackCatalog) => {
  const selectionTags = catalog.selection.tags.length
    ? catalog.selection.tags.join(", ")
    : "all tags";
  const atlasEntries = [
    ["Front-cover atlas", catalog.atlases.front],
    ["Back-cover atlas", catalog.atlases.back],
    ["Spine atlas", catalog.atlases.spine],
  ] as const;
  const atlases = atlasEntries
    .flatMap(([label, surfaceAtlases]) =>
      surfaceAtlases.map((atlas, atlasIndex) =>
        renderAtlas(
          `${label} ${atlasIndex + 1}`,
          atlas.path,
          `${atlas.width} × ${atlas.height}`,
        ),
      ),
    )
    .join("");
  const publications = catalog.publications.map(renderPublication).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(catalog.id)} · Afterleaf content preview</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #100f0d;
      color: #eee8dc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-width: 320px;
      background:
        radial-gradient(circle at 15% -10%, #453529 0, transparent 38rem),
        linear-gradient(180deg, #171512 0, #0d0c0b 70%);
    }
    main { width: min(1500px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 80px; }
    .masthead {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 32px;
      align-items: end;
      padding: 0 4px 28px;
      border-bottom: 1px solid #76644e;
    }
    .kicker, .eyebrow-row, .physical, .hash, .selection {
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .kicker { margin: 0 0 8px; color: #dd5c42; font-size: 12px; font-weight: 800; }
    h1 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(40px, 6vw, 84px); line-height: .92; font-weight: 500; }
    .selection { margin: 14px 0 0; color: #bcb19f; font-size: 11px; line-height: 1.8; }
    .pack-count { min-width: 142px; text-align: right; }
    .pack-count strong { display: block; font-family: Georgia, serif; font-size: 68px; line-height: .8; color: #f0d8a8; font-weight: 400; }
    .pack-count span { color: #9e927f; font-size: 11px; letter-spacing: .15em; text-transform: uppercase; }
    details { margin: 28px 0 46px; border: 1px solid #3a332b; background: #171411cc; }
    summary { padding: 14px 18px; cursor: pointer; color: #d7c9b3; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
    .atlas-grid { display: grid; gap: 18px; padding: 0 18px 20px; overflow: hidden; }
    .atlas { margin: 0; min-width: 0; }
    .atlas figcaption { display: flex; justify-content: space-between; margin-bottom: 7px; color: #8e8170; font-size: 11px; }
    .atlas img { display: block; max-width: 100%; max-height: 420px; border: 1px solid #55483a; background: #0b0a09; object-fit: contain; }
    .shelf {
      position: relative;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
      gap: 42px 24px;
      margin: 0;
      padding: 0 12px 44px;
      list-style: none;
    }
    .shelf::after {
      content: "";
      position: absolute;
      inset: auto 0 0;
      height: 28px;
      border-top: 5px solid #70523b;
      background: linear-gradient(180deg, #3b291e, #17110d);
      box-shadow: 0 18px 30px #000b;
    }
    .publication-card { min-width: 0; }
    .book-stage {
      position: relative;
      display: flex;
      align-items: end;
      justify-content: center;
      height: 340px;
      margin: 0;
      padding: 20px 12px 0;
      background: linear-gradient(180deg, transparent 70%, #2b211a80);
      perspective: 900px;
    }
    .book-cover {
      z-index: 1;
      width: 200px;
      height: 300px;
      border: 1px solid #b8a58a66;
      box-shadow: 10px 15px 26px #000a, 0 0 0 1px #000;
      object-fit: cover;
      transform: rotateY(-2deg);
      transform-origin: right center;
    }
    .book-spine {
      width: 38px;
      height: 300px;
      border: 1px solid #b8a58a55;
      border-right: 0;
      box-shadow: -8px 13px 20px #0008;
      object-fit: cover;
      transform: rotateY(13deg);
      transform-origin: right center;
    }
    .shelf-index {
      position: absolute;
      right: 5px;
      bottom: 3px;
      color: #7d6f5d;
      font-family: Georgia, serif;
      font-size: 28px;
    }
    .publication-copy { padding: 18px 8px 0; }
    .eyebrow-row { display: flex; gap: 8px; align-items: center; color: #877b6b; font-size: 9px; }
    .language { padding: 4px 6px; border: 1px solid #6e5e4c; color: #d6c7b1; }
    .language-japanese { border-color: #9d4c3b; color: #ee9b80; }
    h2 { min-height: 2.45em; margin: 11px 0 6px; font-family: Georgia, "Times New Roman", serif; font-size: 22px; line-height: 1.12; font-weight: 500; }
    .issue { margin: 0 0 7px; color: #e2a15c; font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 12px; }
    .physical { min-height: 1.4em; margin: 0; color: #817668; font-size: 9px; }
    .tags { display: flex; flex-wrap: wrap; gap: 5px; min-height: 50px; margin: 14px 0; padding: 0; list-style: none; }
    .tag { align-self: start; padding: 5px 7px; border-radius: 2px; background: #302922; color: #c9bca9; font-size: 10px; }
    footer { display: flex; justify-content: space-between; gap: 24px; padding: 22px 4px 0; border-top: 1px solid #3c342c; color: #6e655a; font-size: 10px; }
    .hash { overflow-wrap: anywhere; text-align: right; }
    @media (max-width: 600px) {
      main { width: min(100% - 20px, 1500px); padding-top: 28px; }
      .masthead { grid-template-columns: 1fr; }
      .pack-count { text-align: left; }
      footer { flex-direction: column; }
      .hash { text-align: left; }
    }
  </style>
</head>
<body>
  <main>
    <header class="masthead">
      <div>
        <p class="kicker">Afterleaf content-pack contact sheet</p>
        <h1>${escapeHtml(catalog.id)}</h1>
        <p class="selection">${escapeHtml(selectionTags)} · ${escapeHtml(catalog.selection.languages.join(" + "))} · seed ${escapeHtml(catalog.selection.seed)}</p>
      </div>
      <div class="pack-count"><strong>${catalog.publications.length}</strong><span>publications</span></div>
    </header>
    <details>
      <summary>Generated texture atlases</summary>
      <div class="atlas-grid">${atlases}</div>
    </details>
    <ol class="shelf">${publications}</ol>
    <footer>
      <span>Generated content pack preview</span>
      <span class="hash">catalog ${escapeHtml(catalog.contentHash)}</span>
    </footer>
  </main>
</body>
</html>
`;
};
