import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir, readFile, rename, stat, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

import {detectActivePictureRect, getActivePictureConsensus, type ActivePictureRect} from "./activePicture";
import type {TvVideoAnalyzer} from "./channelCatalog";

const CACHE_VERSION = 1;
const ANALYSIS_MAX_WIDTH = 160;
const ANALYSIS_MAX_HEIGHT = 120;
const ANALYSIS_FRAME_RATE = 2;
const ANALYSIS_FRAME_COUNT = 16;
const REQUIRED_SAMPLES = 4;
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;

type CachedVideoAnalysis = {
  activePicture: ActivePictureRect | null;
  modifiedAtMs: number;
  size: number;
};

type VideoAnalysisCache = {
  version: typeof CACHE_VERSION;
  videos: Record<string, CachedVideoAnalysis>;
};

type ProcessResult = {
  stderr: Buffer;
  stdout: Buffer;
};

export type CachedTvVideoAnalyzerOptions = {
  analyzeFile?: (filePath: string) => Promise<ActivePictureRect | undefined>;
  cachePath: string;
  onError?: (filePath: string, error: unknown) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parseActivePictureRect = (value: unknown) => {
  if (!isRecord(value)) return;
  const {height, width, x, y} = value;
  if (
    typeof height !== "number" ||
    typeof width !== "number" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    height <= 0 ||
    width <= 0 ||
    x < 0 ||
    y < 0 ||
    x + width > 1 ||
    y + height > 1
  )
    return;
  return {height, width, x, y} satisfies ActivePictureRect;
};

const parseCache = (value: unknown): VideoAnalysisCache => {
  const cache: VideoAnalysisCache = {version: CACHE_VERSION, videos: {}};
  if (!isRecord(value) || value.version !== CACHE_VERSION || !isRecord(value.videos)) return cache;
  for (const [key, record] of Object.entries(value.videos)) {
    if (!isRecord(record) || typeof record.modifiedAtMs !== "number" || typeof record.size !== "number") continue;
    const activePicture = record.activePicture === null ? null : parseActivePictureRect(record.activePicture);
    if (activePicture === undefined) continue;
    cache.videos[key] = {
      activePicture,
      modifiedAtMs: record.modifiedAtMs,
      size: record.size,
    };
  }
  return cache;
};

const runProcess = (command: string, arguments_: readonly string[], maximumOutputBytes = MAX_PROCESS_OUTPUT_BYTES) =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maximumOutputBytes) {
        fail(new Error(`${command} produced too much output`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stderrSize > maximumOutputBytes) {
        fail(new Error(`${command} produced too much diagnostic output`));
        return;
      }
      stderr.push(chunk);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      const result = {
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      const detail = result.stderr.toString("utf8").trim();
      reject(new Error(`${command} exited with code ${code ?? "unknown"}${detail ? `: ${detail}` : ""}`));
    });
  });

const probeVideoSize = async (filePath: string) => {
  const result = await runProcess(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath],
    64 * 1024,
  );
  const value = JSON.parse(result.stdout.toString("utf8")) as unknown;
  if (!isRecord(value) || !Array.isArray(value.streams)) return;
  const stream = value.streams[0];
  if (
    !isRecord(stream) ||
    typeof stream.width !== "number" ||
    typeof stream.height !== "number" ||
    stream.width <= 0 ||
    stream.height <= 0
  )
    return;
  return {height: stream.height, width: stream.width};
};

export const analyzeTvVideoActivePicture = async (filePath: string) => {
  const videoSize = await probeVideoSize(filePath);
  if (!videoSize) return;
  const analysisScale = Math.min(1, ANALYSIS_MAX_WIDTH / videoSize.width, ANALYSIS_MAX_HEIGHT / videoSize.height);
  const width = Math.max(1, Math.round(videoSize.width * analysisScale));
  const height = Math.max(1, Math.round(videoSize.height * analysisScale));
  const result = await runProcess("ffmpeg", [
    "-nostdin",
    "-v",
    "error",
    "-i",
    filePath,
    "-an",
    "-sn",
    "-dn",
    "-vf",
    `fps=${ANALYSIS_FRAME_RATE},scale=${width}:${height}:flags=area`,
    "-frames:v",
    String(ANALYSIS_FRAME_COUNT),
    "-pix_fmt",
    "rgba",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  const frameBytes = width * height * 4;
  const frameCount = Math.floor(result.stdout.length / frameBytes);
  const samples: ActivePictureRect[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * frameBytes;
    const pixels = new Uint8ClampedArray(result.stdout.buffer, result.stdout.byteOffset + offset, frameBytes);
    const sample = detectActivePictureRect(pixels, width, height);
    if (sample) samples.push(sample);
  }
  return getActivePictureConsensus(samples, REQUIRED_SAMPLES);
};

const readCache = async (cachePath: string) => {
  try {
    return parseCache(JSON.parse(await readFile(cachePath, "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {version: CACHE_VERSION, videos: {}} satisfies VideoAnalysisCache;
    throw error;
  }
};

const writeCache = async (cachePath: string, cache: VideoAnalysisCache) => {
  await mkdir(dirname(cachePath), {recursive: true});
  const temporaryPath = `${cachePath}.staging-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`);
  await rename(temporaryPath, cachePath);
};

export const createCachedTvVideoAnalyzer = (options: CachedTvVideoAnalyzerOptions): TvVideoAnalyzer => {
  const analyzeFile = options.analyzeFile ?? analyzeTvVideoActivePicture;
  const cachePromise = readCache(options.cachePath);
  const pending = new Map<string, Promise<ActivePictureRect | undefined>>();

  return async (filePath, cacheKey) => {
    const file = await stat(filePath);
    const cache = await cachePromise;
    const cached = cache.videos[cacheKey];
    if (cached?.modifiedAtMs === file.mtimeMs && cached.size === file.size) return cached.activePicture ?? undefined;

    const existing = pending.get(cacheKey);
    if (existing) return existing;
    const analysis = (async () => {
      let activePicture: ActivePictureRect | undefined;
      try {
        activePicture = await analyzeFile(filePath);
      } catch (error) {
        options.onError?.(filePath, error);
      }
      cache.videos[cacheKey] = {
        activePicture: activePicture ?? null,
        modifiedAtMs: file.mtimeMs,
        size: file.size,
      };
      await writeCache(options.cachePath, cache);
      return activePicture;
    })();
    pending.set(cacheKey, analysis);
    try {
      return await analysis;
    } finally {
      pending.delete(cacheKey);
    }
  };
};
