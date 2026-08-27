export type PageTurnDirection = "LTR" | "RTL";
export type PageTurnPhase = "peel" | "cross" | "settle";

export type PageTurnProgress = {
  /** Input clamped to the inclusive 0–1 turn interval. */
  readonly normalized: number;
  /** Smootherstep timing used for the leaf's binding angle. */
  readonly eased: number;
  readonly phase: PageTurnPhase;
  /** Progress local to the current phase, also normalized to 0–1. */
  readonly phaseProgress: number;
};

export type PageBlock = {
  readonly pageCount: number;
  readonly fraction: number;
  readonly depth: number;
  /** Mesh center measured from its cover/contact plane along the local normal. */
  readonly centerOffset: number;
  /** Top paper surface measured from that same cover/contact plane. */
  readonly surfaceOffset: number;
};

export type PageBlockSplit = {
  readonly committedPageIndex: number;
  readonly totalPages: number;
  readonly left: PageBlock;
  readonly right: PageBlock;
  readonly turnedSide: "left" | "right";
};

export type PageBlockSplitOptions = {
  /** Number of page units already committed across the binding. */
  committedPageIndex: number;
  totalPages: number;
  /** Combined paper depth, excluding both covers. */
  totalDepth: number;
  direction: PageTurnDirection;
};

export type ActiveLeafDeformationOptions = {
  /** Maximum extra curl as a fraction of page width. Defaults to 0.09. */
  maxCurl?: number;
  /** Maximum corner-to-corner twist as a fraction of width. Defaults to 0.012. */
  maxTorsion?: number;
};

/** Scalar values that can also be passed directly to shader/TSL uniforms. */
export type ActiveLeafDeformation = PageTurnProgress & {
  readonly sourceSide: -1 | 1;
  readonly turnAngle: number;
  readonly lift: number;
  readonly curl: number;
  readonly torsion: number;
};

export type ActiveLeafDeformationTarget = {
  normalized: number;
  eased: number;
  phase: PageTurnPhase;
  phaseProgress: number;
  sourceSide: -1 | 1;
  turnAngle: number;
  lift: number;
  curl: number;
  torsion: number;
};

export type ActiveLeafVertex = {
  x: number;
  y: number;
  z: number;
};

type WritablePositionArray = Float32Array | number[];

const PEEL_END = 0.24;
const CROSS_END = 0.76;
const CURL_ENVELOPE_SCALE = 256 / 27;
const DEFAULT_DEFORMATION_OPTIONS: ActiveLeafDeformationOptions = {};

const nonNegativeFinite = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

const normalizedInteger = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

export const normalizeTurnProgress = (progress: number) => {
  if (Number.isNaN(progress) || progress <= 0) return 0;
  if (progress >= 1) return 1;
  return progress;
};

/** Quintic smootherstep: continuous velocity and acceleration at both rests. */
export const easeTurnProgress = (progress: number) => {
  const normalized = normalizeTurnProgress(progress);
  return normalized * normalized * normalized * (normalized * (normalized * 6 - 15) + 10);
};

const writePageTurnProgress = <Target extends PageTurnProgress>(
  target: {
    normalized: number;
    eased: number;
    phase: PageTurnPhase;
    phaseProgress: number;
  },
  progress: number,
): Target => {
  const normalized = normalizeTurnProgress(progress);
  target.normalized = normalized;
  target.eased = easeTurnProgress(normalized);
  if (normalized < PEEL_END) {
    target.phase = "peel";
    target.phaseProgress = normalized / PEEL_END;
    return target as Target;
  }

  if (normalized < CROSS_END) {
    target.phase = "cross";
    target.phaseProgress = (normalized - PEEL_END) / (CROSS_END - PEEL_END);
    return target as Target;
  }

  target.phase = "settle";
  target.phaseProgress = (normalized - CROSS_END) / (1 - CROSS_END);
  return target as Target;
};

export const getPageTurnProgress = (progress: number): PageTurnProgress =>
  writePageTurnProgress({normalized: 0, eased: 0, phase: "peel", phaseProgress: 0}, progress);

const createPageBlock = (pageCount: number, totalPages: number, totalDepth: number): PageBlock => {
  const fraction = totalPages === 0 ? 0 : pageCount / totalPages;
  const depth = totalDepth * fraction;
  return {
    pageCount,
    fraction,
    depth,
    centerOffset: depth / 2,
    surfaceOffset: depth,
  };
};

/**
 * Splits a fixed paper depth between the physical left and right page blocks.
 * Offsets are unsigned because each block is positioned along its own local
 * cover normal. Zero-depth blocks should be hidden rather than epsilon-scaled.
 */
export const getPageBlockSplit = (options: PageBlockSplitOptions): PageBlockSplit => {
  const totalPages = normalizedInteger(options.totalPages);
  const committedPageIndex = Math.min(totalPages, normalizedInteger(options.committedPageIndex));
  const totalDepth = nonNegativeFinite(options.totalDepth);
  const turnedPages = committedPageIndex;
  const remainingPages = totalPages - committedPageIndex;
  const leftPages = options.direction === "LTR" ? turnedPages : remainingPages;
  const rightPages = options.direction === "LTR" ? remainingPages : turnedPages;

  return {
    committedPageIndex,
    totalPages,
    left: createPageBlock(leftPages, totalPages, totalDepth),
    right: createPageBlock(rightPages, totalPages, totalDepth),
    turnedSide: options.direction === "LTR" ? "left" : "right",
  };
};

/**
 * Produces compact deformation uniforms for a forward page turn. Mirroring the
 * source side makes the same curve work for LTR and RTL books.
 */
export const getActiveLeafDeformation = (
  progress: number,
  direction: PageTurnDirection,
  options: ActiveLeafDeformationOptions = DEFAULT_DEFORMATION_OPTIONS,
): ActiveLeafDeformation =>
  writeActiveLeafDeformation(
    {
      normalized: 0,
      eased: 0,
      phase: "peel",
      phaseProgress: 0,
      sourceSide: 1,
      turnAngle: 0,
      lift: 0,
      curl: 0,
      torsion: 0,
    },
    progress,
    direction,
    options,
  );

/** Updates caller-owned deformation uniforms without allocating. */
export const writeActiveLeafDeformation = (
  target: ActiveLeafDeformationTarget,
  progress: number,
  direction: PageTurnDirection,
  options: ActiveLeafDeformationOptions = DEFAULT_DEFORMATION_OPTIONS,
) => {
  writePageTurnProgress<ActiveLeafDeformationTarget>(target, progress);
  const lift = Math.sin(Math.PI * target.eased);
  const maxCurl = nonNegativeFinite(options.maxCurl ?? 0.09);
  const maxTorsion = nonNegativeFinite(options.maxTorsion ?? 0.012);

  target.sourceSide = direction === "LTR" ? 1 : -1;
  target.turnAngle = Math.PI * target.eased;
  target.lift = lift;
  target.curl = lift * maxCurl;
  target.torsion = lift * maxTorsion;
  return target;
};

/**
 * Maps normalized PlaneGeometry UVs into book-local coordinates. `u` runs from
 * the fixed spine to the fore-edge and `v` from page bottom to top. The spine is
 * exactly pinned for the full turn. Passing `target` avoids a per-vertex object
 * allocation in CPU deformation loops.
 */
export const deformActiveLeafVertex = (
  u: number,
  v: number,
  width: number,
  height: number,
  deformation: ActiveLeafDeformation,
  target: ActiveLeafVertex = {x: 0, y: 0, z: 0},
) => {
  const normalizedU = normalizeTurnProgress(u);
  const normalizedV = normalizeTurnProgress(v);
  const pageWidth = nonNegativeFinite(width);
  const pageHeight = nonNegativeFinite(height);
  const edgeDistance = normalizedU * pageWidth;
  const centeredV = normalizedV - 0.5;
  if (normalizedU === 0) {
    target.x = 0;
    target.y = centeredV * pageHeight;
    target.z = 0;
    return target;
  }
  const turnCos = Math.cos(deformation.turnAngle);
  const turnSin = Math.sin(deformation.turnAngle);
  // Paper bends most visibly near the unsupported fore-edge. Keeping the
  // spine-side majority nearly planar makes the leaf read as one stiff sheet
  // instead of a uniformly sagging textile.
  const curlEnvelope = CURL_ENVELOPE_SCALE * normalizedU ** 3 * (1 - normalizedU);
  const torsionEnvelope = normalizedU * normalizedU * (3 - 2 * normalizedU);
  const normalOffset =
    pageWidth * (deformation.curl * curlEnvelope + deformation.torsion * centeredV * torsionEnvelope);

  target.x = deformation.sourceSide * (edgeDistance * turnCos - normalOffset * turnSin);
  target.y = centeredV * pageHeight;
  target.z = edgeDistance * turnSin + normalOffset * turnCos;
  return target;
};

/**
 * Writes positions for a standard Three PlaneGeometry UV buffer without taking
 * a dependency on Three. `positions` may be the geometry position attribute's
 * Float32Array and is returned for convenient chaining.
 */
export const writeActiveLeafPositions = (
  uvs: ArrayLike<number>,
  positions: WritablePositionArray,
  width: number,
  height: number,
  deformation: ActiveLeafDeformation,
  vertex: ActiveLeafVertex = {x: 0, y: 0, z: 0},
) => {
  const vertexCount = Math.min(Math.floor(uvs.length / 2), Math.floor(positions.length / 3));
  for (let index = 0; index < vertexCount; index += 1) {
    const uvOffset = index * 2;
    const positionOffset = index * 3;
    deformActiveLeafVertex(uvs[uvOffset] ?? 0, uvs[uvOffset + 1] ?? 0, width, height, deformation, vertex);
    positions[positionOffset] = vertex.x;
    positions[positionOffset + 1] = vertex.y;
    positions[positionOffset + 2] = vertex.z;
  }
  return positions;
};
