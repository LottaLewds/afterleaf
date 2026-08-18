import {createHash, randomUUID} from "node:crypto";
import {
  access,
  copyFile,
  link,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import sharp, {type FitEnum} from "~/media/sharpRuntime";
import {normalizeTags} from "~/content/normalize";
import {replaceDirectory} from "~/content/replaceDirectory";
import {
  CONTENT_SCHEMA_VERSION,
  type ContentPackCatalog,
  type ContentSeedDiagnostic,
  type ContentSeedReport,
  type PackedPublication,
  type PublicationCandidate,
  type PublicationMaterial,
  type PublicationSource,
  type SeedContentPackOptions,
  type SeedContentPackResult,
  type ShelfAtlasDescriptor,
} from "~/content/schema";
import {
  BOOK_ASPECT_RATIO_INFERENCE_VERSION,
  boundedBookAspectRatio,
  inferRepresentativeBookAspectRatio,
  orientedImageDimensions,
} from "~/content/bookAspectRatio";
import {generateContentPackPreview} from "~/content/preview";
import {physicalBookDepth} from "~/game/bookDimensions";

const COVER_WIDTH = 256;
const COVER_HEIGHT = 384;
const FRONT_ATLAS_WIDTH = 384;
const FRONT_ATLAS_HEIGHT = 576;
const BACK_ATLAS_WIDTH = 384;
const BACK_ATLAS_HEIGHT = 576;
const DETAIL_COVER_MAX_HEIGHT = 1536;
const SPINE_ATLAS_CELL_WIDTH = 48;
const SPINE_TEXTURE_HEIGHT = 1024;
const READER_MAX_DIMENSION = 2048;
const READER_WEBP_PASSTHROUGH_MAX_BYTES = 2 * 1024 * 1024;
const READER_WEBP_QUALITY = 88;
const ATLAS_COLUMNS = 8;
const ATLAS_MAX_ROWS = 10;
const ATLAS_PUBLICATION_CAPACITY = ATLAS_COLUMNS * ATLAS_MAX_ROWS;
const FRONT_ATLAS_FORMAT_VERSION = 4;
const BACK_ATLAS_FORMAT_VERSION = 1;
const BACK_DERIVATIVE_FORMAT_VERSION = 1;
const SPINE_ATLAS_FORMAT_VERSION = 4;
const SPINE_DERIVATIVE_FORMAT_VERSION = 4;
const MAX_PUBLICATION_PAGES = 1_000;
const MAX_SOURCE_FILE_BYTES = 128 * 1024 * 1024;
const VALIDATION_CONCURRENCY = 8;
const PAGE_MATERIALIZATION_CONCURRENCY = 4;
const SUPPORTED_IMAGE_FORMATS = new Set(["avif", "jpeg", "png", "webp"]);

type ShelfSurface = "front" | "back" | "spine";

const SHELF_ATLAS_CELLS = {
  front: {height: FRONT_ATLAS_HEIGHT, width: FRONT_ATLAS_WIDTH},
  back: {height: BACK_ATLAS_HEIGHT, width: BACK_ATLAS_WIDTH},
  spine: {height: SPINE_TEXTURE_HEIGHT, width: SPINE_ATLAS_CELL_WIDTH},
} as const satisfies Record<ShelfSurface, {height: number; width: number}>;

const SHELF_ATLAS_FORMAT_VERSIONS = {
  front: FRONT_ATLAS_FORMAT_VERSION,
  back: BACK_ATLAS_FORMAT_VERSION,
  spine: SPINE_ATLAS_FORMAT_VERSION,
} as const satisfies Record<ShelfSurface, number | undefined>;

interface ValidatedImage {
  format: string;
  height: number;
  orientation?: number;
  size: number;
  width: number;
}

interface ValidatedSelection {
  candidate: PublicationCandidate;
  images: ReadonlyMap<string, ValidatedImage>;
  material: PublicationMaterial;
  previous?: PackedPublication;
}

interface SourceRegion {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface WraparoundLayout {
  back: SourceRegion;
  front: SourceRegion;
  spine: SourceRegion;
}

const hashAsset = (path: string, buffer: Buffer) => {
  const hash = createHash("sha256");
  hash.update(path);
  hash.update("\0");
  hash.update(buffer);
  hash.update("\0");
  return hash.digest("hex");
};

const stableAssetPath = (path: string, assetPathPrefix?: string) =>
  assetPathPrefix && path.startsWith(`${assetPathPrefix}/`)
    ? path.slice(assetPathPrefix.length + 1)
    : path;

const updateAssetHash = (
  hash: ReturnType<typeof createHash>,
  path: string,
  buffer: Buffer,
) => {
  hash.update(path);
  hash.update("\0");
  hash.update(buffer);
  hash.update("\0");
};

const hashJson = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const fileExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const validateImage = async (path: string) => {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) throw new Error(`Asset is not a file: ${path}`);
  if (fileStat.size > MAX_SOURCE_FILE_BYTES)
    throw new Error(`Image exceeds the 128 MiB source limit: ${path}`);
  const metadata = await sharp(path, {
    limitInputPixels: 100_000_000,
  }).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error(`Image has no readable dimensions: ${path}`);
  if (!metadata.format || !SUPPORTED_IMAGE_FORMATS.has(metadata.format))
    throw new Error(
      `Unsupported image format in ${path}; expected AVIF, JPEG, PNG, or WebP`,
    );
  if ((metadata.pages ?? 1) !== 1)
    throw new Error(`Multi-frame images are not supported: ${path}`);
  return {
    format: metadata.format,
    height: metadata.height,
    ...(metadata.orientation === undefined
      ? {}
      : {orientation: metadata.orientation}),
    size: fileStat.size,
    width: metadata.width,
  } satisfies ValidatedImage;
};

const inferAspectRatio = (
  material: PublicationMaterial,
  images: ReadonlyMap<string, ValidatedImage>,
  explicitAspectRatio: number | undefined,
) => {
  if (explicitAspectRatio !== undefined)
    return boundedBookAspectRatio(explicitAspectRatio);
  const firstPage = material.pages[0];
  const lastPage = material.pages.at(-1);
  const firstPageIsCover =
    firstPage !== undefined &&
    (material.front === undefined || material.front === firstPage);
  const lastPageIsBack =
    lastPage !== undefined &&
    (material.back === undefined || material.back === lastPage);
  const interiorSources = material.pages.slice(
    firstPageIsCover ? 1 : 0,
    lastPageIsBack ? -1 : undefined,
  );
  const representativeSources =
    interiorSources.length > 0 ? interiorSources : material.pages;
  const fallbackSources =
    representativeSources.length === 0 && material.front
      ? [material.front]
      : representativeSources;
  return inferRepresentativeBookAspectRatio(
    fallbackSources.flatMap((path) => {
      const image = images.get(path);
      return image ? [image] : [];
    }),
    COVER_WIDTH / COVER_HEIGHT,
  );
};

const columnEdgeScores = (pixels: Buffer, width: number, height: number) => {
  const scores = new Float64Array(width);
  for (let x = 1; x < width; x += 1) {
    let score = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = y * width + x;
      score += Math.abs((pixels[offset] ?? 0) - (pixels[offset - 1] ?? 0));
    }
    scores[x] = score / height;
  }
  return scores;
};

const strongestColumn = (scores: Float64Array, start: number, end: number) => {
  let strongest = Math.max(1, Math.floor(start));
  for (let x = strongest + 1; x <= Math.min(scores.length - 1, end); x += 1)
    if ((scores[x] ?? 0) > (scores[strongest] ?? 0)) strongest = x;
  return strongest;
};

const medianScore = (scores: Float64Array) => {
  const sorted = Array.from(scores).sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const barcodeScore = (
  pixels: Buffer,
  imageWidth: number,
  imageHeight: number,
  left: number,
  right: number,
) => {
  const windowWidth = Math.max(12, Math.floor((right - left) * 0.26));
  const windowHeight = Math.max(12, Math.floor(imageHeight * 0.16));
  let strongest = 0;
  for (let top = 4; top + windowHeight < imageHeight; top += 5) {
    for (let x = left + 4; x + windowWidth < right; x += 5) {
      let horizontalEdges = 0;
      let verticalEdges = 0;
      for (let y = top + 1; y < top + windowHeight; y += 1) {
        for (let column = x + 1; column < x + windowWidth; column += 1) {
          const offset = y * imageWidth + column;
          horizontalEdges += Math.abs(
            (pixels[offset] ?? 0) - (pixels[offset - 1] ?? 0),
          );
          verticalEdges += Math.abs(
            (pixels[offset] ?? 0) - (pixels[offset - imageWidth] ?? 0),
          );
        }
      }
      strongest = Math.max(
        strongest,
        horizontalEdges / Math.max(1, verticalEdges),
      );
    }
  }
  return strongest;
};

const detectWraparoundLayout = async (
  source: string,
  sourceImage: ValidatedImage,
  aspectRatio: number,
  readingDirection: "ltr" | "rtl" | undefined,
): Promise<WraparoundLayout | undefined> => {
  const dimensions = orientedImageDimensions(sourceImage);
  if (dimensions.width / dimensions.height < aspectRatio * 2.25)
    return undefined;
  const analysis = await sharp(source, {limitInputPixels: 100_000_000})
    .rotate()
    .resize({height: 256})
    .greyscale()
    .raw()
    .toBuffer({resolveWithObject: true});
  const {height, width} = analysis.info;
  const expectedPanelWidth = height * aspectRatio;
  const center = width / 2;
  const scores = columnEdgeScores(analysis.data, width, height);
  const leftSpineEdge = strongestColumn(
    scores,
    center - expectedPanelWidth * 0.24,
    center - 2,
  );
  const rightSpineEdge = strongestColumn(
    scores,
    center + 2,
    center + expectedPanelWidth * 0.24,
  );
  const spineWidth = rightSpineEdge - leftSpineEdge;
  const baseline = medianScore(scores);
  if (
    spineWidth < expectedPanelWidth * 0.025 ||
    spineWidth > expectedPanelWidth * 0.3 ||
    (scores[leftSpineEdge] ?? 0) < Math.max(12, baseline * 3) ||
    (scores[rightSpineEdge] ?? 0) < Math.max(12, baseline * 3)
  )
    return undefined;
  const leftPanelStart = Math.max(
    0,
    Math.round(leftSpineEdge - expectedPanelWidth),
  );
  const rightPanelEnd = Math.min(
    width,
    Math.round(rightSpineEdge + expectedPanelWidth),
  );
  if (
    leftSpineEdge - leftPanelStart < expectedPanelWidth * 0.8 ||
    rightPanelEnd - rightSpineEdge < expectedPanelWidth * 0.8
  )
    return undefined;
  const leftBarcodeScore = barcodeScore(
    analysis.data,
    width,
    height,
    leftPanelStart,
    leftSpineEdge,
  );
  const rightBarcodeScore = barcodeScore(
    analysis.data,
    width,
    height,
    rightSpineEdge,
    rightPanelEnd,
  );
  const barcodeIdentifiesRightBack =
    rightBarcodeScore >= 2.4 && rightBarcodeScore > leftBarcodeScore * 1.22;
  const barcodeIdentifiesLeftBack =
    leftBarcodeScore >= 2.4 && leftBarcodeScore > rightBarcodeScore * 1.22;
  let frontIsLeft =
    readingDirection === undefined ? undefined : readingDirection === "rtl";
  if (barcodeIdentifiesRightBack) frontIsLeft = true;
  else if (barcodeIdentifiesLeftBack) frontIsLeft = false;
  if (frontIsLeft === undefined) return undefined;
  const scale = dimensions.width / width;
  const sourceRegion = (left: number, right: number): SourceRegion => ({
    height: dimensions.height,
    left: Math.round(left * scale),
    top: 0,
    width: Math.max(1, Math.round((right - left) * scale)),
  });
  const leftPanel = sourceRegion(leftPanelStart, leftSpineEdge);
  const rightPanel = sourceRegion(rightSpineEdge, rightPanelEnd);
  return {
    back: frontIsLeft ? rightPanel : leftPanel,
    front: frontIsLeft ? leftPanel : rightPanel,
    spine: sourceRegion(leftSpineEdge, rightSpineEdge),
  };
};

const validateRealAssetPath = async (sourceDirectory: string, path: string) => {
  const [realSourceDirectory, realAssetPath] = await Promise.all([
    realpath(sourceDirectory),
    realpath(path),
  ]);
  const relativePath = relative(realSourceDirectory, realAssetPath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  )
    throw new Error(
      `Asset resolves outside its publication directory: ${path}`,
    );
};

const validateMaterial = async (
  material: PublicationMaterial,
  sourceDirectory: string,
) => {
  if (material.pages.length === 0 && material.front === undefined)
    throw new Error("Publication must contain a page or front asset");
  if (material.pages.length > MAX_PUBLICATION_PAGES)
    throw new Error(
      `Publication exceeds the ${MAX_PUBLICATION_PAGES}-page safety limit`,
    );
  if (new Set(material.pages).size !== material.pages.length)
    throw new Error("Publication page paths must be unique");
  const paths = [
    ...new Set([
      ...material.pages,
      ...(material.front === undefined ? [] : [material.front]),
      ...(material.back === undefined ? [] : [material.back]),
      ...(material.spine === undefined ? [] : [material.spine]),
    ]),
  ];
  const images = new Map<string, ValidatedImage>();
  let nextPathIndex = 0;
  await Promise.all(
    Array.from(
      {length: Math.min(VALIDATION_CONCURRENCY, paths.length)},
      async () => {
        while (nextPathIndex < paths.length) {
          const path = paths[nextPathIndex];
          nextPathIndex += 1;
          if (!path) continue;
          await validateRealAssetPath(sourceDirectory, path);
          images.set(path, await validateImage(path));
        }
      },
    ),
  );
  const alternates = material.alternates ?? [];
  if (new Set(alternates.map(({id}) => id)).size !== alternates.length)
    throw new Error("Publication alternate IDs must be unique");
  await Promise.all(
    alternates.map(async (alternate) => {
      await validateRealAssetPath(alternate.sourceDirectory, alternate.page0);
      images.set(alternate.page0, await validateImage(alternate.page0));
    }),
  );
  return images;
};

const webpDerivative = async (
  source: string,
  width: number,
  height: number,
  fit: keyof FitEnum,
  position = "centre",
  region?: SourceRegion,
) => {
  const image = sharp(source, {limitInputPixels: 100_000_000}).rotate();
  if (region) image.extract(region);
  return image
    .flatten({background: "#f7f3ec"})
    .toColourspace("srgb")
    .resize({width, height, fit, position, withoutEnlargement: false})
    .webp({quality: 86, effort: 5, smartSubsample: true})
    .toBuffer();
};

const detailCoverDerivative = async (
  source: string,
  width: number,
  height: number,
  position: string,
  region?: SourceRegion,
) => {
  const image = sharp(source, {limitInputPixels: 100_000_000}).rotate();
  if (region) image.extract(region);
  return image
    .flatten({background: "#f7f3ec"})
    .toColourspace("srgb")
    .resize({width, height, fit: "cover", position, withoutEnlargement: true})
    .webp({quality: 90, effort: 5, smartSubsample: true})
    .toBuffer();
};

const readerSourceCanPassThrough = (image: ValidatedImage) =>
  image.format === "webp" &&
  image.width <= READER_MAX_DIMENSION &&
  image.height <= READER_MAX_DIMENSION &&
  image.size <= READER_WEBP_PASSTHROUGH_MAX_BYTES &&
  (image.orientation === undefined || image.orientation === 1);

const readerDerivative = async (source: string, image: ValidatedImage) => {
  if (readerSourceCanPassThrough(image)) return readFile(source);
  return sharp(source, {limitInputPixels: 100_000_000})
    .rotate()
    .flatten({background: "#f7f3ec"})
    .toColourspace("srgb")
    .resize({
      width: READER_MAX_DIMENSION,
      height: READER_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({quality: READER_WEBP_QUALITY, effort: 5, smartSubsample: true})
    .toBuffer();
};

const SPINE_PALETTES = [
  {accent: "#ba7659", background: "#382620", ink: "#f1e4cf"},
  {accent: "#bd9b5f", background: "#273530", ink: "#eee5d2"},
  {accent: "#798fa2", background: "#252f39", ink: "#ebeadf"},
  {accent: "#a5778a", background: "#392832", ink: "#f0e2e5"},
  {accent: "#82966f", background: "#2b3426", ink: "#eee7d5"},
] as const;

const spinePalette = (publicationId: string) => {
  const index = createHash("sha256").update(publicationId).digest()[0] ?? 0;
  return SPINE_PALETTES[index % SPINE_PALETTES.length] ?? SPINE_PALETTES[0];
};

const escapeXmlText = (value: string) =>
  Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 8 || codePoint === 11 || codePoint === 12) return "";
    if (codePoint >= 14 && codePoint <= 31) return "";
    return character;
  })
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const compactSpineTitle = (title: string, limit: number) => {
  const characters = Array.from(title.trim().replace(/\s+/g, " "));
  if (characters.length <= limit) return characters.join("");
  return `${characters.slice(0, limit - 1).join("")}…`;
};

const spineTitle = (candidate: PublicationCandidate) => {
  if (candidate.language === "japanese")
    return candidate.document.title.trim().replace(/\s+/g, " ");
  const readableTitle = Array.from(candidate.document.title, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x024f) return character;
    if (codePoint >= 0x2000 && codePoint <= 0x206f) return character;
    return " ";
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return readableTitle || "Untitled edition";
};

const spineTextureWidth = (thicknessMillimeters: number | undefined) =>
  Math.max(
    1,
    Math.round(physicalBookDepth(thicknessMillimeters, SPINE_TEXTURE_HEIGHT)),
  );

const packedSpineRegions = (publications: readonly PackedPublication[]) => {
  let x = 0;
  return publications.map((publication) => {
    const width = spineTextureWidth(publication.physical.thicknessMm);
    const region = {height: SPINE_TEXTURE_HEIGHT, width, x, y: 0};
    x += width;
    return region;
  });
};

const spineDerivative = async (
  candidate: PublicationCandidate,
  width: number,
) => {
  const scale = SPINE_TEXTURE_HEIGHT / 768;
  const palette = spinePalette(candidate.document.id);
  const fullTitle = spineTitle(candidate);
  const characterWidth = candidate.language === "japanese" ? 0.95 : 0.58;
  const horizontalMargin = Math.max(2 * scale, width * 0.12);
  const titleAvailableLength = 570 * scale;
  const preferredTitleFontSize = Math.max(
    6 * scale,
    Math.min(16 * scale, width * 0.48),
  );
  const titleCharacterLimit = Math.max(
    12,
    Math.floor(
      titleAvailableLength / (preferredTitleFontSize * characterWidth),
    ),
  );
  const title = compactSpineTitle(fullTitle, titleCharacterLimit);
  const titleLength = Array.from(title).length;
  const titleFontSize = Math.max(
    6 * scale,
    Math.min(
      preferredTitleFontSize,
      titleAvailableLength / Math.max(1, titleLength * characterWidth),
    ),
  );
  const languageFontSize = Math.max(
    5 * scale,
    Math.min(12 * scale, width * 0.3),
  );
  const centerX = width / 2;
  const fontFamily =
    candidate.language === "japanese"
      ? "Droid Sans Fallback, sans-serif"
      : "Noto Sans, sans-serif";
  const languageMark = candidate.language === "japanese" ? "JP" : "EN";
  const titlePadding = titleFontSize * 2;
  const titleSvgWidth = Math.ceil(
    titleLength * (titleFontSize * characterWidth + 0.6 * scale) +
      titlePadding * 2,
  );
  const titleSvgHeight = Math.ceil(titleFontSize * 5);
  const titleSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${titleSvgWidth}" height="${titleSvgHeight}" viewBox="0 0 ${titleSvgWidth} ${titleSvgHeight}">
      <text x="${titlePadding}" y="${titleFontSize * 3}" fill="${palette.ink}" font-family="${fontFamily}" font-size="${titleFontSize}" font-weight="600" letter-spacing="${0.6 * scale}">${escapeXmlText(title)}</text>
    </svg>`,
  );
  const titleImage = await sharp(titleSvg)
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}})
    .rotate(270)
    .resize({
      fit: "inside",
      height: titleAvailableLength,
      width: Math.max(1, Math.floor(width - horizontalMargin * 2 - 2 * scale)),
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({resolveWithObject: true});
  const titleLeft = Math.round((width - titleImage.info.width) / 2);
  const titleTop = Math.round(395 * scale - titleImage.info.height / 2);
  const spineSvg =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${SPINE_TEXTURE_HEIGHT}" viewBox="0 0 ${width} ${SPINE_TEXTURE_HEIGHT}">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#11100e" stop-opacity=".42"/>
        <stop offset=".13" stop-color="${palette.background}"/>
        <stop offset=".86" stop-color="${palette.background}"/>
        <stop offset="1" stop-color="#faf2dc" stop-opacity=".14"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${SPINE_TEXTURE_HEIGHT}" fill="${palette.background}"/>
    <rect width="${width}" height="${SPINE_TEXTURE_HEIGHT}" fill="url(#paper)"/>
    <rect x="${horizontalMargin}" y="${10 * scale}" width="${Math.max(1, width - horizontalMargin * 2)}" height="${748 * scale}" rx="${2 * scale}" fill="none" stroke="${palette.accent}" stroke-opacity=".72" stroke-width="${scale}"/>
    <rect x="${horizontalMargin}" y="${88 * scale}" width="${Math.max(1, width - horizontalMargin * 2)}" height="${3 * scale}" fill="${palette.accent}" opacity=".9"/>
    <rect x="${horizontalMargin}" y="${700 * scale}" width="${Math.max(1, width - horizontalMargin * 2)}" height="${3 * scale}" fill="${palette.accent}" opacity=".9"/>
    <text x="${centerX}" y="${55 * scale}" text-anchor="middle" fill="${palette.ink}" font-family="sans-serif" font-size="${languageFontSize}" font-weight="700">${languageMark}</text>
    <circle cx="${centerX}" cy="${734 * scale}" r="${Math.max(2 * scale, Math.min(10 * scale, width * 0.16))}" fill="${palette.accent}"/>
  </svg>`);
  return sharp(spineSvg)
    .composite([{input: titleImage.data, left: titleLeft, top: titleTop}])
    .webp({quality: 90, effort: 5, smartSubsample: true})
    .toBuffer();
};

const writeAsset = async (
  stagingDirectory: string,
  path: string,
  buffer: Buffer,
) => {
  const outputPath = resolve(stagingDirectory, path);
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, buffer);
};

const writeHashedAsset = async (
  stagingDirectory: string,
  path: string,
  buffer: Buffer,
  hash: ReturnType<typeof createHash>,
  assetPathPrefix?: string,
) => {
  updateAssetHash(hash, stableAssetPath(path, assetPathPrefix), buffer);
  await writeAsset(stagingDirectory, path, buffer);
};

const reusablePublicationMetadata = (
  candidate: PublicationCandidate,
  material: PublicationMaterial,
) => {
  const document = candidate.document;
  const includeAspectRatio =
    document.physical?.aspectRatio !== undefined &&
    (document.aspectRatioInferenceVersion === undefined ||
      document.aspectRatioInferenceVersion ===
        BOOK_ASPECT_RATIO_INFERENCE_VERSION);
  return {
    ...(document.groupId === undefined ? {} : {groupId: document.groupId}),
    id: document.id,
    ...(document.issue === undefined ? {} : {issue: document.issue}),
    ...(document.kind === undefined ? {} : {kind: document.kind}),
    title: document.title,
    language: candidate.language,
    ...(document.pageCount === undefined
      ? {}
      : {pageCount: document.pageCount}),
    tags: candidate.normalizedTags,
    originalTags: normalizeTags(document.tags),
    alternates: candidate.alternates ?? [],
    physical: {
      ...(document.physical?.readingDirection === undefined
        ? {}
        : {readingDirection: document.physical.readingDirection}),
      ...(!includeAspectRatio
        ? {}
        : {aspectRatio: document.physical.aspectRatio}),
      ...(document.physical?.thicknessMm === undefined
        ? {}
        : {thicknessMm: document.physical.thicknessMm}),
      ...(document.physical?.trim === undefined
        ? {}
        : {trim: document.physical.trim}),
    },
    source: document.source,
    materialPageCount: material.pages.length,
  };
};

const previousPublicationMetadata = (
  previous: PackedPublication,
  candidate: PublicationCandidate,
) => ({
  ...(previous.groupId === undefined ? {} : {groupId: previous.groupId}),
  id: previous.id,
  ...(previous.issue === undefined ? {} : {issue: previous.issue}),
  ...(previous.kind === undefined ? {} : {kind: previous.kind}),
  title: previous.title,
  language: previous.language,
  ...(previous.pageCount === undefined ? {} : {pageCount: previous.pageCount}),
  tags: previous.tags,
  originalTags: previous.originalTags,
  alternates: previous.alternates.map(({id, originalTags, source, title}) => ({
    id,
    originalTags,
    ...(source === undefined ? {} : {source}),
    title,
  })),
  physical: {
    ...(previous.physical.readingDirection === undefined
      ? {}
      : {readingDirection: previous.physical.readingDirection}),
    ...(candidate.document.physical?.aspectRatio === undefined ||
    (candidate.document.aspectRatioInferenceVersion !== undefined &&
      candidate.document.aspectRatioInferenceVersion !==
        BOOK_ASPECT_RATIO_INFERENCE_VERSION)
      ? {}
      : {aspectRatio: previous.physical.aspectRatio}),
    ...(previous.physical.thicknessMm === undefined
      ? {}
      : {thicknessMm: previous.physical.thicknessMm}),
    ...(previous.physical.trim === undefined
      ? {}
      : {trim: previous.physical.trim}),
  },
  source: previous.source,
  materialPageCount: previous.assets.pages.length,
});

const canReusePublication = (
  candidate: PublicationCandidate,
  material: PublicationMaterial,
  previous: PackedPublication,
) => {
  const currentSource = candidate.document.source;
  const previousSource = previous.source;

  // Cas provider externe : les deux sources doivent exister et correspondre.
  if (currentSource || previousSource) {
    if (!currentSource || !previousSource) return false;
    if (
      currentSource.provider !== previousSource.provider ||
      currentSource.remoteId !== previousSource.remoteId ||
      currentSource.metadataHash !== previousSource.metadataHash
    )
      return false;
  }
  // Si les deux sont absents (contenu local scanné à la main), on continue
  // et on se fie uniquement à la comparaison de métadonnées ci-dessous.

  const usesInferredAspectRatio =
    candidate.document.physical?.aspectRatio === undefined ||
    candidate.document.aspectRatioInferenceVersion !== undefined;
  if (
    usesInferredAspectRatio &&
    previous.aspectRatioInferenceVersion !== BOOK_ASPECT_RATIO_INFERENCE_VERSION
  )
    return false;
  return (
    hashJson(reusablePublicationMetadata(candidate, material)) ===
    hashJson(previousPublicationMetadata(previous, candidate))
  );
};

const resolveReusableAsset = (root: string, assetPath: string) => {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, assetPath);
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  )
    throw new Error(`Reusable asset escapes its snapshot: ${assetPath}`);
  return resolvedPath;
};

const hardLinkUnavailable = (error: unknown) => {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return ["EACCES", "EMLINK", "ENOTSUP", "EPERM", "EXDEV"].includes(
    String(error.code),
  );
};

const reuseAsset = async (
  previousDirectory: string,
  stagingDirectory: string,
  assetPath: string,
  nextAssetPath = assetPath,
) => {
  const previousPath = resolveReusableAsset(previousDirectory, assetPath);
  const nextPath = resolveReusableAsset(stagingDirectory, nextAssetPath);
  await mkdir(dirname(nextPath), {recursive: true});
  try {
    await link(previousPath, nextPath);
  } catch (error) {
    if (!hardLinkUnavailable(error)) throw error;
    await copyFile(previousPath, nextPath);
  }
};

const publicationAssetPaths = (publication: PackedPublication) => [
  publication.assets.front,
  publication.assets.frontDetail,
  publication.assets.back,
  ...(publication.assets.backDetail ? [publication.assets.backDetail] : []),
  publication.assets.spine,
  ...publication.assets.pages,
  ...publication.alternates.map(({page0}) => page0),
];

const prefixedAssetPath = (prefix: string | undefined, assetPath: string) =>
  prefix ? `${prefix}/${assetPath}` : assetPath;

const persistentPublicationExists = async (
  publication: PackedPublication,
  persistentAssetDirectory: string | undefined,
) => {
  if (!persistentAssetDirectory) return false;
  const assets = publicationAssetPaths(publication).map((assetPath) =>
    resolveReusableAsset(persistentAssetDirectory, assetPath),
  );
  return (await Promise.all(assets.map(fileExists))).every(Boolean);
};

const materializeReusedPublication = async (
  selection: ValidatedSelection,
  previousDirectory: string,
  stagingDirectory: string,
  shelfAtlasIndex: number,
  assetPathPrefix?: string,
  persistentAssetDirectory?: string,
) => {
  const previous = selection.previous;
  if (!previous)
    throw new Error("A reused publication requires its previous catalog entry");
  const migrateBack =
    previous.backFormatVersion !== BACK_DERIVATIVE_FORMAT_VERSION ||
    previous.assets.backDetail === undefined;
  const migrateSpine =
    previous.spineFormatVersion !== SPINE_DERIVATIVE_FORMAT_VERSION;
  if (migrateBack || migrateSpine) {
    const publicationDirectory = prefixedAssetPath(
      assetPathPrefix,
      `publications/${selection.candidate.document.id}`,
    );
    const frontSource = selection.material.front ?? selection.material.pages[0];
    const fallbackBackSource =
      selection.material.back ??
      selection.material.pages[selection.material.pages.length - 1];
    if (!frontSource || !fallbackBackSource)
      throw new Error(
        `${selection.candidate.document.id} has no usable front/back source`,
      );
    const canDetectWraparound =
      frontSource === selection.material.pages[0] &&
      selection.material.back === undefined &&
      selection.material.spine === undefined;
    let wraparoundLayout: WraparoundLayout | undefined;
    if (canDetectWraparound && frontSource) {
      await validateRealAssetPath(
        selection.candidate.sourceDirectory,
        frontSource,
      );
      wraparoundLayout = await detectWraparoundLayout(
        frontSource,
        await validateImage(frontSource),
        previous.physical.aspectRatio,
        selection.candidate.document.physical?.readingDirection,
      );
    }
    let spineBuffer: Buffer | undefined;
    const spinePath = `${publicationDirectory}/spine.webp`;
    if (migrateSpine) {
      const spineWidth = spineTextureWidth(previous.physical.thicknessMm);
      const spineSource =
        selection.material.spine ??
        (wraparoundLayout ? frontSource : undefined);
      if (spineSource)
        await validateRealAssetPath(
          selection.candidate.sourceDirectory,
          spineSource,
        );
      spineBuffer = spineSource
        ? await webpDerivative(
            spineSource,
            spineWidth,
            SPINE_TEXTURE_HEIGHT,
            "cover",
            "centre",
            wraparoundLayout?.spine,
          )
        : await spineDerivative(selection.candidate, spineWidth);
      await writeAsset(stagingDirectory, spinePath, spineBuffer);
    }
    let backDetailBuffer: Buffer | undefined;
    const backDetailPath = `${publicationDirectory}/back-detail.webp`;
    if (migrateBack) {
      const backSource = wraparoundLayout ? frontSource : fallbackBackSource;
      await validateRealAssetPath(
        selection.candidate.sourceDirectory,
        backSource,
      );
      const backImage = await validateImage(backSource);
      const backDetailHeight = Math.min(
        DETAIL_COVER_MAX_HEIGHT,
        wraparoundLayout?.back.height ??
          orientedImageDimensions(backImage).height,
      );
      backDetailBuffer = await detailCoverDerivative(
        backSource,
        Math.max(
          1,
          Math.round(backDetailHeight * previous.physical.aspectRatio),
        ),
        backDetailHeight,
        "centre",
        wraparoundLayout?.back,
      );
      await writeAsset(stagingDirectory, backDetailPath, backDetailBuffer);
    }
    const replacedAssets = new Set<string>();
    if (migrateSpine) replacedAssets.add(previous.assets.spine);
    if (migrateBack && previous.assets.backDetail)
      replacedAssets.add(previous.assets.backDetail);
    const reusableAssets = publicationAssetPaths(previous).filter(
      (assetPath) => !replacedAssets.has(assetPath),
    );
    const persistentAssetsAvailable =
      persistentAssetDirectory !== undefined &&
      (
        await Promise.all(
          reusableAssets.map((assetPath) =>
            fileExists(
              resolveReusableAsset(persistentAssetDirectory, assetPath),
            ),
          ),
        )
      ).every(Boolean);
    const migratedPath = (assetPath: string) =>
      persistentAssetsAvailable
        ? assetPath
        : prefixedAssetPath(assetPathPrefix, assetPath);
    if (!persistentAssetsAvailable)
      await Promise.all(
        reusableAssets.map((assetPath) =>
          reuseAsset(
            previousDirectory,
            stagingDirectory,
            assetPath,
            migratedPath(assetPath),
          ),
        ),
      );
    const nextSpinePath = migrateSpine
      ? spinePath
      : migratedPath(previous.assets.spine);
    let nextBackDetailPath: string | undefined;
    if (migrateBack) nextBackDetailPath = backDetailPath;
    else if (previous.assets.backDetail)
      nextBackDetailPath = migratedPath(previous.assets.backDetail);
    return {
      ...previous,
      alternates: previous.alternates.map((alternate) => ({
        ...alternate,
        page0: migratedPath(alternate.page0),
      })),
      assets: {
        back: migratedPath(previous.assets.back),
        ...(nextBackDetailPath ? {backDetail: nextBackDetailPath} : {}),
        front: migratedPath(previous.assets.front),
        frontDetail: migratedPath(previous.assets.frontDetail),
        pages: previous.assets.pages.map(migratedPath),
        spine: nextSpinePath,
      },
      shelfAtlasIndex,
      backFormatVersion: BACK_DERIVATIVE_FORMAT_VERSION,
      spineFormatVersion: SPINE_DERIVATIVE_FORMAT_VERSION,
      contentHash: hashJson({
        ...(backDetailBuffer
          ? {
              backDetailAssetHash: hashAsset(
                stableAssetPath(backDetailPath, assetPathPrefix),
                backDetailBuffer,
              ),
            }
          : {}),
        previousContentHash: previous.contentHash,
        ...(spineBuffer
          ? {
              spineAssetHash: hashAsset(
                stableAssetPath(spinePath, assetPathPrefix),
                spineBuffer,
              ),
            }
          : {}),
        backFormatVersion: BACK_DERIVATIVE_FORMAT_VERSION,
        spineFormatVersion: SPINE_DERIVATIVE_FORMAT_VERSION,
      }),
    };
  }
  if (await persistentPublicationExists(previous, persistentAssetDirectory))
    return {...previous, shelfAtlasIndex};

  const migratedPath = (assetPath: string) =>
    prefixedAssetPath(assetPathPrefix, assetPath);
  await Promise.all(
    publicationAssetPaths(previous).map((assetPath) =>
      reuseAsset(
        previousDirectory,
        stagingDirectory,
        assetPath,
        migratedPath(assetPath),
      ),
    ),
  );
  return {
    ...previous,
    alternates: previous.alternates.map((alternate) => ({
      ...alternate,
      page0: migratedPath(alternate.page0),
    })),
    assets: {
      back: migratedPath(previous.assets.back),
      ...(previous.assets.backDetail
        ? {backDetail: migratedPath(previous.assets.backDetail)}
        : {}),
      front: migratedPath(previous.assets.front),
      frontDetail: migratedPath(previous.assets.frontDetail),
      pages: previous.assets.pages.map(migratedPath),
      spine: migratedPath(previous.assets.spine),
    },
    shelfAtlasIndex,
    backFormatVersion: BACK_DERIVATIVE_FORMAT_VERSION,
    spineFormatVersion: SPINE_DERIVATIVE_FORMAT_VERSION,
  };
};

const materializePublication = async (
  selection: ValidatedSelection,
  stagingDirectory: string,
  shelfAtlasIndex: number,
  assetPathPrefix?: string,
): Promise<PackedPublication> => {
  const publicationDirectory = prefixedAssetPath(
    assetPathPrefix,
    `publications/${selection.candidate.document.id}`,
  );
  const frontSource = selection.material.front ?? selection.material.pages[0];
  const fallbackBackSource =
    selection.material.back ??
    selection.material.pages[selection.material.pages.length - 1];
  if (!frontSource || !fallbackBackSource)
    throw new Error(
      `${selection.candidate.document.id} has no usable front/back source`,
    );
  const document = selection.candidate.document;
  const usesInferredAspectRatio =
    document.physical?.aspectRatio === undefined ||
    document.aspectRatioInferenceVersion !== undefined;
  const explicitAspectRatio =
    document.aspectRatioInferenceVersion === undefined ||
    document.aspectRatioInferenceVersion === BOOK_ASPECT_RATIO_INFERENCE_VERSION
      ? document.physical?.aspectRatio
      : undefined;
  const aspectRatio = inferAspectRatio(
    selection.material,
    selection.images,
    explicitAspectRatio,
  );
  const frontImage = selection.images.get(frontSource);
  if (!frontImage)
    throw new Error(`Missing validated image metadata for ${frontSource}`);
  const canDetectWraparound =
    frontSource === selection.material.pages[0] &&
    selection.material.back === undefined &&
    selection.material.spine === undefined;
  const wraparoundLayout = canDetectWraparound
    ? await detectWraparoundLayout(
        frontSource,
        frontImage,
        aspectRatio,
        document.physical?.readingDirection,
      )
    : undefined;
  const coverWidth = Math.max(1, Math.round(COVER_HEIGHT * aspectRatio));
  const frontDimensions = orientedImageDimensions(frontImage);
  const frontPosition =
    !wraparoundLayout &&
    frontDimensions.width / frontDimensions.height > aspectRatio * 1.35
      ? "right"
      : "centre";
  const pageDigits = Math.max(
    3,
    String(selection.material.pages.length).length,
  );
  const surfaceSources = [
    {
      path: `${publicationDirectory}/front.webp`,
      source: frontSource,
      width: coverWidth,
      position: frontPosition,
      region: wraparoundLayout?.front,
    },
    {
      path: `${publicationDirectory}/back.webp`,
      source: wraparoundLayout ? frontSource : fallbackBackSource,
      width: coverWidth,
      position: "centre",
      region: wraparoundLayout?.back,
    },
  ];
  const publicationHash = createHash("sha256");
  for (const surface of surfaceSources) {
    const buffer = await webpDerivative(
      surface.source,
      surface.width,
      COVER_HEIGHT,
      "cover",
      surface.position,
      surface.region,
    );
    await writeHashedAsset(
      stagingDirectory,
      surface.path,
      buffer,
      publicationHash,
      assetPathPrefix,
    );
  }
  const detailCoverHeight = Math.min(
    DETAIL_COVER_MAX_HEIGHT,
    wraparoundLayout?.front.height ?? frontDimensions.height,
  );
  const detailCoverPath = `${publicationDirectory}/front-detail.webp`;
  await writeHashedAsset(
    stagingDirectory,
    detailCoverPath,
    await detailCoverDerivative(
      frontSource,
      Math.max(1, Math.round(detailCoverHeight * aspectRatio)),
      detailCoverHeight,
      frontPosition,
      wraparoundLayout?.front,
    ),
    publicationHash,
    assetPathPrefix,
  );
  const backSource = wraparoundLayout ? frontSource : fallbackBackSource;
  const backImage = selection.images.get(backSource);
  if (!backImage)
    throw new Error(`Missing validated image metadata for ${backSource}`);
  const backDetailHeight = Math.min(
    DETAIL_COVER_MAX_HEIGHT,
    wraparoundLayout?.back.height ?? orientedImageDimensions(backImage).height,
  );
  const backDetailPath = `${publicationDirectory}/back-detail.webp`;
  await writeHashedAsset(
    stagingDirectory,
    backDetailPath,
    await detailCoverDerivative(
      backSource,
      Math.max(1, Math.round(backDetailHeight * aspectRatio)),
      backDetailHeight,
      "centre",
      wraparoundLayout?.back,
    ),
    publicationHash,
    assetPathPrefix,
  );
  const spinePath = `${publicationDirectory}/spine.webp`;
  const spineWidth = spineTextureWidth(document.physical?.thicknessMm);
  const spineSource =
    selection.material.spine ?? (wraparoundLayout ? frontSource : undefined);
  await writeHashedAsset(
    stagingDirectory,
    spinePath,
    spineSource
      ? await webpDerivative(
          spineSource,
          spineWidth,
          SPINE_TEXTURE_HEIGHT,
          "cover",
          "centre",
          wraparoundLayout?.spine,
        )
      : await spineDerivative(selection.candidate, spineWidth),
    publicationHash,
    assetPathPrefix,
  );
  const pagePaths: string[] = [];
  for (
    let batchStart = 0;
    batchStart < selection.material.pages.length;
    batchStart += PAGE_MATERIALIZATION_CONCURRENCY
  ) {
    const sources = selection.material.pages.slice(
      batchStart,
      batchStart + PAGE_MATERIALIZATION_CONCURRENCY,
    );
    const assets = await Promise.all(
      sources.map(async (source, batchIndex) => {
        const image = selection.images.get(source);
        if (!image)
          throw new Error(`Missing validated image metadata for ${source}`);
        const index = batchStart + batchIndex;
        return {
          buffer: await readerDerivative(source, image),
          path: `${publicationDirectory}/pages/${String(index + 1).padStart(pageDigits, "0")}.webp`,
        };
      }),
    );
    for (const asset of assets) {
      updateAssetHash(
        publicationHash,
        stableAssetPath(asset.path, assetPathPrefix),
        asset.buffer,
      );
      pagePaths.push(asset.path);
    }
    await Promise.all(
      assets.map((asset) =>
        writeAsset(stagingDirectory, asset.path, asset.buffer),
      ),
    );
  }

  const alternateMaterialById = new Map(
    selection.material.alternates?.map((alternate) => [
      alternate.id,
      alternate,
    ]) ?? [],
  );
  const alternateAssets = await Promise.all(
    (selection.candidate.alternates ?? []).map(async (alternate) => {
      const material = alternateMaterialById.get(alternate.id);
      if (!material)
        throw new Error(`Missing page zero for alternate ${alternate.id}`);
      const image = selection.images.get(material.page0);
      if (!image)
        throw new Error(
          `Missing validated image metadata for alternate ${alternate.id}`,
        );
      const page0 = `${publicationDirectory}/alternates/${alternate.id}/page-000.webp`;
      return {
        buffer: await readerDerivative(material.page0, image),
        id: alternate.id,
        originalTags: alternate.originalTags,
        page0,
        ...(alternate.source === undefined ? {} : {source: alternate.source}),
        title: alternate.title,
      };
    }),
  );
  if (alternateMaterialById.size !== alternateAssets.length)
    throw new Error(`Alternate metadata and page-zero assets do not match`);
  for (const alternate of alternateAssets)
    updateAssetHash(
      publicationHash,
      stableAssetPath(alternate.page0, assetPathPrefix),
      alternate.buffer,
    );
  await Promise.all(
    alternateAssets.map(({buffer, page0}) =>
      writeAsset(stagingDirectory, page0, buffer),
    ),
  );
  const alternates = alternateAssets.map(
    ({id, originalTags, page0, source, title}) => ({
      id,
      originalTags,
      page0,
      ...(source === undefined ? {} : {source}),
      title,
    }),
  );

  const physical = {
    ...(document.physical ?? {}),
    aspectRatio,
  };
  const frontPath = surfaceSources[0]?.path;
  const backPath = surfaceSources[1]?.path;
  if (!frontPath || !backPath)
    throw new Error(`Failed to define surfaces for ${document.id}`);
  const publication = {
    id: document.id,
    ...(document.groupId === undefined ? {} : {groupId: document.groupId}),
    ...(document.issue === undefined ? {} : {issue: document.issue}),
    ...(document.kind === undefined ? {} : {kind: document.kind}),
    title: document.title,
    language: selection.candidate.language,
    ...(document.pageCount === undefined
      ? {}
      : {pageCount: document.pageCount}),
    tags: selection.candidate.normalizedTags,
    originalTags: normalizeTags(document.tags),
    alternates,
    physical,
    ...(document.source === undefined ? {} : {source: document.source}),
    assets: {
      front: frontPath,
      frontDetail: detailCoverPath,
      back: backPath,
      backDetail: backDetailPath,
      spine: spinePath,
      pages: pagePaths,
    },
    shelfAtlasIndex,
    ...(usesInferredAspectRatio
      ? {aspectRatioInferenceVersion: BOOK_ASPECT_RATIO_INFERENCE_VERSION}
      : {}),
    backFormatVersion: BACK_DERIVATIVE_FORMAT_VERSION,
    spineFormatVersion: SPINE_DERIVATIVE_FORMAT_VERSION,
  };
  const {shelfAtlasIndex: _shelfAtlasIndex, ...publicationContent} =
    publication;
  return {
    ...publication,
    contentHash: hashJson({
      assetContentHash: publicationHash.digest("hex"),
      publication: publicationContent,
    }),
  };
};

const shelfAtlasAssetPath = (
  publication: PackedPublication,
  surface: ShelfSurface,
) => {
  if (surface === "front") return publication.assets.frontDetail;
  if (surface === "back")
    return publication.assets.backDetail ?? publication.assets.back;
  return publication.assets.spine;
};

const createAtlas = async (
  publications: readonly PackedPublication[],
  stagingDirectory: string,
  surface: ShelfSurface,
  atlasIndex: number,
  firstPublicationIndex: number,
  assetPathPrefix?: string,
  persistentAssetDirectory?: string,
): Promise<ShelfAtlasDescriptor> => {
  const {height: cellHeight, width: cellWidth} = SHELF_ATLAS_CELLS[surface];
  const formatVersion = SHELF_ATLAS_FORMAT_VERSIONS[surface];
  const regions =
    surface === "spine" ? packedSpineRegions(publications) : undefined;
  const columns = regions
    ? publications.length
    : Math.min(ATLAS_COLUMNS, publications.length);
  const rows = regions ? 1 : Math.ceil(publications.length / columns);
  const width = regions
    ? regions.reduce((total, region) => total + region.width, 0)
    : columns * cellWidth;
  const height = regions ? SPINE_TEXTURE_HEIGHT : rows * cellHeight;
  const path = prefixedAssetPath(
    assetPathPrefix,
    `atlases/${surface}-${String(atlasIndex + 1).padStart(3, "0")}.webp`,
  );
  const cellBuffers = await Promise.all(
    publications.map(async (publication) => {
      const assetPath = shelfAtlasAssetPath(publication, surface);
      const stagedPath = resolveReusableAsset(stagingDirectory, assetPath);
      const sourcePath = (await fileExists(stagedPath))
        ? stagedPath
        : persistentAssetDirectory
          ? resolveReusableAsset(persistentAssetDirectory, assetPath)
          : stagedPath;
      const source = await readFile(sourcePath);
      if (surface === "spine") return source;
      return sharp(source)
        .resize({
          width: cellWidth,
          height: cellHeight,
          fit: "contain",
          background: "#181512",
        })
        .toBuffer();
    }),
  );
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#181512",
    },
  })
    .composite(
      cellBuffers.map((input, index) => {
        const region = regions?.[index];
        return {
          input,
          left: region?.x ?? (index % columns) * cellWidth,
          top: region?.y ?? Math.floor(index / columns) * cellHeight,
        };
      }),
    )
    .webp(
      surface === "spine"
        ? {effort: 5, lossless: true}
        : {quality: 86, effort: 5, smartSubsample: true},
    )
    .toBuffer();
  await writeAsset(stagingDirectory, path, buffer);
  return {
    path,
    ...(formatVersion === undefined ? {} : {formatVersion}),
    cellWidth,
    cellHeight,
    columns,
    rows,
    width,
    height,
    contentHash: hashAsset(path, buffer),
    firstPublicationIndex,
    publicationCount: publications.length,
    ...(regions ? {regions} : {}),
  };
};

const createAtlases = async (
  publications: readonly PackedPublication[],
  stagingDirectory: string,
  surface: ShelfSurface,
  reuse?: NonNullable<SeedContentPackOptions["reuse"]>,
  assetPathPrefix?: string,
  persistentAssetDirectory?: string,
) => {
  const atlases: ShelfAtlasDescriptor[] = [];
  for (const {firstPublicationIndex, publicationCount} of planShelfAtlasRanges(
    publications.length,
  )) {
    const atlasIndex = atlases.length;
    const publicationSlice = publications.slice(
      firstPublicationIndex,
      firstPublicationIndex + publicationCount,
    );
    const previousAtlas = reuse?.catalog.atlases[surface][atlasIndex];
    const previousPublications = reuse?.catalog.publications.slice(
      firstPublicationIndex,
      firstPublicationIndex + publicationCount,
    );
    const previousAtlasIsPersistent =
      previousAtlas !== undefined &&
      persistentAssetDirectory !== undefined &&
      (await fileExists(
        resolveReusableAsset(persistentAssetDirectory, previousAtlas.path),
      ));
    const formatVersion = SHELF_ATLAS_FORMAT_VERSIONS[surface];
    const canReuseAtlas =
      previousAtlas !== undefined &&
      (formatVersion === undefined ||
        previousAtlas.formatVersion === formatVersion) &&
      (assetPathPrefix === undefined || previousAtlasIsPersistent) &&
      previousAtlas.firstPublicationIndex === firstPublicationIndex &&
      previousAtlas.publicationCount === publicationCount &&
      previousPublications?.length === publicationSlice.length &&
      publicationSlice.every((publication, index) => {
        const previous = previousPublications[index];
        return (
          previous?.id === publication.id &&
          previous.contentHash === publication.contentHash
        );
      });
    if (canReuseAtlas && previousAtlas && reuse) {
      if (!previousAtlasIsPersistent)
        await reuseAsset(reuse.directory, stagingDirectory, previousAtlas.path);
      atlases.push(previousAtlas);
      continue;
    }
    atlases.push(
      await createAtlas(
        publicationSlice,
        stagingDirectory,
        surface,
        atlasIndex,
        firstPublicationIndex,
        assetPathPrefix,
        persistentAssetDirectory,
      ),
    );
  }
  return atlases;
};

export const planShelfAtlasRanges = (
  publicationCount: number,
  capacity = ATLAS_PUBLICATION_CAPACITY,
) => {
  if (!Number.isSafeInteger(publicationCount) || publicationCount < 0)
    throw new Error("Atlas publication count must be a non-negative integer");
  if (!Number.isSafeInteger(capacity) || capacity <= 0)
    throw new Error("Atlas capacity must be a positive integer");
  return Array.from(
    {length: Math.ceil(publicationCount / capacity)},
    (_, atlasIndex) => {
      const firstPublicationIndex = atlasIndex * capacity;
      return {
        firstPublicationIndex,
        publicationCount: Math.min(
          capacity,
          publicationCount - firstPublicationIndex,
        ),
      };
    },
  );
};

const assertSafeOutputDirectory = (outputDirectory: string) => {
  const resolvedOutput = resolve(outputDirectory);
  if (resolvedOutput === parse(resolvedOutput).root)
    throw new Error("The content-pack output cannot be a filesystem root");
  if (basename(resolvedOutput) === ".." || basename(resolvedOutput) === ".")
    throw new Error("The content-pack output must be a named directory");
  return resolvedOutput;
};

const commitStagingDirectory = async (
  stagingDirectory: string,
  outputDirectory: string,
  force: boolean,
) => {
  const outputExists = await fileExists(outputDirectory);
  if (outputExists && !force)
    throw new Error(
      `Output directory already exists: ${outputDirectory}. Pass --force to replace it.`,
    );
  if (!outputExists) {
    await replaceDirectory(stagingDirectory, outputDirectory);
    return;
  }

  const backupDirectory = `${outputDirectory}.backup-${randomUUID()}`;
  await rename(outputDirectory, backupDirectory);
  try {
    await replaceDirectory(stagingDirectory, outputDirectory);
    await rm(backupDirectory, {recursive: true, force: true}).catch(() => {});
  } catch (error) {
    if (!(await fileExists(outputDirectory)))
      await rename(backupDirectory, outputDirectory);
    throw error;
  }
};

const createReport = (
  source: PublicationSource,
  options: SeedContentPackOptions,
  selectedPublicationIds: string[],
  diagnostics: ContentSeedDiagnostic[],
  outputWritten: boolean,
): ContentSeedReport => ({
  schemaVersion: CONTENT_SCHEMA_VERSION,
  packId: options.packId,
  source: source.name,
  outputDirectory: options.outputDirectory,
  outputWritten,
  requestedLimit: options.limit,
  selectedCount: selectedPublicationIds.length,
  selectedPublicationIds,
  diagnostics,
});

export const seedContentPack = async (
  source: PublicationSource,
  options: SeedContentPackOptions,
): Promise<SeedContentPackResult> => {
  if (options.limit <= 0 || !Number.isSafeInteger(options.limit))
    throw new Error("limit must be a positive integer");
  const outputDirectory = assertSafeOutputDirectory(options.outputDirectory);
  const references = await source.search(options);
  const diagnostics = [...source.diagnostics];
  const selections: ValidatedSelection[] = [];
  const reuse =
    options.reuse?.catalog.id === options.packId ? options.reuse : undefined;
  const previousPublicationById = new Map(
    reuse?.catalog.publications.map((publication) => [
      publication.id,
      publication,
    ]) ?? [],
  );

  for (const reference of references) {
    if (selections.length >= options.limit) break;
    try {
      const [candidate, material] = await Promise.all([
        source.getMetadata(reference),
        source.materialize(reference),
      ]);
      const previous = previousPublicationById.get(candidate.document.id);
      if (previous && canReusePublication(candidate, material, previous)) {
        selections.push({candidate, images: new Map(), material, previous});
        continue;
      }
      const images = await validateMaterial(
        material,
        candidate.sourceDirectory,
      );
      selections.push({candidate, images, material});
    } catch (error) {
      diagnostics.push({
        code: "invalid-assets",
        sourceId: reference.sourceId,
        message: `Skipped ${reference.sourceId}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (selections.length < options.limit)
    diagnostics.push({
      code: "fewer-than-limit",
      message: `Selected ${selections.length} valid publications from a requested limit of ${options.limit}`,
    });
  if (selections.length === 0 && !options.allowEmpty)
    throw new Error("No valid publications matched the requested selection");

  if (reuse) {
    const previousIndexById = new Map(
      reuse.catalog.publications.map((publication, index) => [
        publication.id,
        index,
      ]),
    );
    selections.sort((left, right) => {
      const leftIndex = previousIndexById.get(left.candidate.document.id);
      const rightIndex = previousIndexById.get(right.candidate.document.id);
      if (leftIndex !== undefined && rightIndex !== undefined)
        return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return 0;
    });
  }
  const selectedPublicationIds = selections.map(
    (selection) => selection.candidate.document.id,
  );
  if (options.dryRun)
    return {
      report: createReport(
        source,
        options,
        selectedPublicationIds,
        diagnostics,
        false,
      ),
    };

  await mkdir(dirname(outputDirectory), {recursive: true});
  const stagingDirectory = resolve(
    dirname(outputDirectory),
    `.${basename(outputDirectory)}.staging-${randomUUID()}`,
  );
  await mkdir(stagingDirectory, {recursive: true});

  try {
    const publications: PackedPublication[] = [];
    for (const selection of selections) {
      try {
        if (selection.previous && reuse) {
          publications.push(
            await materializeReusedPublication(
              selection,
              reuse.directory,
              stagingDirectory,
              publications.length,
              options.assetPathPrefix,
              options.persistentAssetDirectory,
            ),
          );
          continue;
        }
        publications.push(
          await materializePublication(
            selection,
            stagingDirectory,
            publications.length,
            options.assetPathPrefix,
          ),
        );
      } catch (error) {
        const diagnostic: ContentSeedDiagnostic = {
          code: "invalid-assets",
          sourceId: selection.candidate.document.id,
          message: `Failed to materialize ${selection.candidate.document.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
        diagnostics.push(diagnostic);
        options.onDiagnostic?.(diagnostic);
      }
    }

    const selectedPublicationIds = publications.map(
      (publication) => publication.id,
    );
    const atlases = {
      front: await createAtlases(
        publications,
        stagingDirectory,
        "front",
        reuse,
        options.assetPathPrefix,
        options.persistentAssetDirectory,
      ),
      back: await createAtlases(
        publications,
        stagingDirectory,
        "back",
        reuse,
        options.assetPathPrefix,
        options.persistentAssetDirectory,
      ),
      spine: await createAtlases(
        publications,
        stagingDirectory,
        "spine",
        reuse,
        options.assetPathPrefix,
        options.persistentAssetDirectory,
      ),
    };
    const catalogWithoutHash = {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      id: options.packId,
      selection: {
        excludedTags: options.excludedTags,
        languages: options.languages,
        limit: options.limit,
        match: options.match,
        seed: options.seed,
        source: source.name,
        tags: options.tags,
      },
      atlases,
      publications,
    };
    const catalog: ContentPackCatalog = {
      ...catalogWithoutHash,
      contentHash: hashJson(catalogWithoutHash),
    };
    const report = createReport(
      source,
      options,
      selectedPublicationIds,
      diagnostics,
      true,
    );
    await Promise.all([
      writeFile(
        resolve(stagingDirectory, "catalog.json"),
        `${JSON.stringify(catalog, null, 2)}\n`,
      ),
      writeFile(
        resolve(stagingDirectory, "seed-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      ),
      writeFile(
        resolve(stagingDirectory, "preview.html"),
        generateContentPackPreview(catalog),
      ),
    ]);
    await commitStagingDirectory(
      stagingDirectory,
      outputDirectory,
      options.force,
    );
    return {catalog, report};
  } catch (error) {
    await rm(stagingDirectory, {recursive: true, force: true}).catch(() => {});
    throw error;
  }
};
