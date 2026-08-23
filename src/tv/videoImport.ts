import {spawn} from "node:child_process";
import {copyFile, link, lstat, mkdir, mkdtemp, rm} from "node:fs/promises";
import {basename, extname, relative, resolve} from "node:path";

import {
  isSafeTvChannelId,
  isSafeTvPathSegment,
  tvMediaUrl,
  tvVideoImportUrl,
  type TvVideo,
} from "./protocol";

const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;
const OUTPUT_TEMPLATE = "%(title).140B [%(id)s].%(ext)s";
const PLAYABLE_FORMAT =
  "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*[ext=webm]+ba[ext=webm]/b[ext=webm]";

export class TvVideoImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TvVideoImportInputError";
  }
}

export type TvVideoDownloader = (
  url: string,
  stagingDirectory: string,
) => Promise<string>;

const processFailureDetail = (stderr: Buffer) => {
  const lines = stderr.toString("utf8").trim().split("\n");
  return lines.findLast((line) => line.trim().length > 0)?.trim();
};

export const downloadTvVideoWithYtDlp: TvVideoDownloader = (
  url,
  stagingDirectory,
) =>
  new Promise((resolveDownload, rejectDownload) => {
    const temporaryDirectory = resolve(stagingDirectory, "temporary");
    const child = spawn(
      "yt-dlp",
      [
        "--ignore-config",
        "--no-playlist",
        "--playlist-items",
        "1",
        "--match-filter",
        "!is_live",
        "--restrict-filenames",
        "--windows-filenames",
        "--trim-filenames",
        "180",
        "--no-progress",
        "--no-overwrites",
        "--format",
        PLAYABLE_FORMAT,
        "--merge-output-format",
        "mp4/webm",
        "--paths",
        `home:${stagingDirectory}`,
        "--paths",
        `temp:${temporaryDirectory}`,
        "--output",
        OUTPUT_TEMPLATE,
        "--print",
        "after_move:filepath",
        "--",
        url,
      ],
      {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectDownload(error);
    };
    const capture = (
      chunks: Buffer[],
      chunk: Buffer,
      currentBytes: number,
      stream: string,
    ) => {
      const nextBytes = currentBytes + chunk.byteLength;
      if (nextBytes > MAX_PROCESS_OUTPUT_BYTES) {
        fail(new Error(`yt-dlp produced too much ${stream} output`));
        return nextBytes;
      }
      chunks.push(chunk);
      return nextBytes;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes = capture(stdout, chunk, stdoutBytes, "standard");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes = capture(stderr, chunk, stderrBytes, "diagnostic");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      fail(
        error.code === "ENOENT"
          ? new Error("yt-dlp is not installed or unavailable on PATH")
          : error,
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        const detail = processFailureDetail(Buffer.concat(stderr));
        rejectDownload(
          new Error(detail ?? `yt-dlp exited with code ${code ?? "unknown"}`),
        );
        return;
      }
      const outputPath = Buffer.concat(stdout)
        .toString("utf8")
        .trim()
        .split("\n")
        .findLast((line) => line.trim().length > 0)
        ?.trim();
      if (!outputPath) {
        rejectDownload(new Error("yt-dlp did not report a downloaded video"));
        return;
      }
      resolveDownload(outputPath);
    });
  });

const ensureChannelDirectory = async (
  channelsDirectory: string,
  channelId: string,
) => {
  if (!isSafeTvChannelId(channelId))
    throw new TvVideoImportInputError("TV channel is invalid");
  const root = resolve(channelsDirectory);
  const channelDirectory = resolve(root, channelId);
  const channelRelativePath = relative(root, channelDirectory);
  if (
    channelRelativePath.length === 0 ||
    channelRelativePath.startsWith("..") ||
    resolve(root, channelRelativePath) !== channelDirectory
  )
    throw new TvVideoImportInputError("TV channel is invalid");
  await mkdir(channelDirectory, {recursive: true});
  try {
    const channel = await lstat(channelDirectory);
    if (!channel.isDirectory() || channel.isSymbolicLink())
      throw new TvVideoImportInputError("TV channel is unavailable");
  } catch (error) {
    if (error instanceof TvVideoImportInputError) throw error;
    throw new TvVideoImportInputError("TV channel is unavailable");
  }
  return channelDirectory;
};

const downloadedVideoPath = async (
  stagingDirectory: string,
  outputPath: string,
) => {
  const stagingRoot = resolve(stagingDirectory);
  const candidate = resolve(outputPath);
  const candidateRelativePath = relative(stagingRoot, candidate);
  if (
    candidateRelativePath.length === 0 ||
    candidateRelativePath.startsWith("..") ||
    resolve(stagingRoot, candidateRelativePath) !== candidate
  )
    throw new Error("yt-dlp produced a video outside its staging directory");
  const extension = extname(candidate).toLowerCase();
  if (extension !== ".mp4" && extension !== ".webm")
    throw new Error("yt-dlp could not produce a Chrome-compatible video");
  if (!isSafeTvPathSegment(basename(candidate)))
    throw new Error("yt-dlp produced an unsafe video filename");
  const file = await lstat(candidate);
  if (!file.isFile() || file.isSymbolicLink() || file.size <= 0)
    throw new Error("yt-dlp produced an invalid video file");
  return candidate;
};

/**
 * Filesystem error codes meaning a hard link cannot be created (for
 * example a cross-device staging directory, or exFAT/FAT32 channel
 * storage); the publish falls back to copying instead of failing.
 */
const LINK_UNAVAILABLE_CODES = new Set([
  "EACCES",
  "EMLINK",
  "ENOTSUP",
  "EPERM",
  "EXDEV",
]);

const publishVideo = async (sourcePath: string, channelDirectory: string) => {
  const sourceName = basename(sourcePath);
  const extension = extname(sourceName);
  const stem = basename(sourceName, extension);
  for (let copy = 1; ; copy += 1) {
    const videoId = `${stem}${copy === 1 ? "" : ` (${copy})`}${extension}`;
    const destinationPath = resolve(channelDirectory, videoId);
    try {
      await link(sourcePath, destinationPath);
      return videoId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      // The staged download may live on another volume from the channel;
      // copy the finished file into place rather than losing the import.
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          LINK_UNAVAILABLE_CODES.has(String(error.code))
        )
      )
        throw error;
      await copyFile(sourcePath, destinationPath);
      return videoId;
    }
  }
};

export const importTvVideoToChannel = async (options: {
  channelId: string;
  channelsDirectory: string;
  download?: TvVideoDownloader;
  url: string;
}): Promise<TvVideo> => {
  const url = tvVideoImportUrl(options.url);
  if (!url)
    throw new TvVideoImportInputError("Paste a valid HTTP or HTTPS video URL");
  if (!isSafeTvChannelId(options.channelId))
    throw new TvVideoImportInputError("TV channel is invalid");
  const stagingRoot = resolve(options.channelsDirectory, ".imports");
  await mkdir(stagingRoot, {recursive: true});
  const stagingDirectory = await mkdtemp(resolve(stagingRoot, "video-"));
  try {
    const outputPath = await (options.download ?? downloadTvVideoWithYtDlp)(
      url,
      stagingDirectory,
    );
    const sourcePath = await downloadedVideoPath(stagingDirectory, outputPath);
    const channelDirectory = await ensureChannelDirectory(
      options.channelsDirectory,
      options.channelId,
    );
    const videoId = await publishVideo(sourcePath, channelDirectory);
    return {
      id: videoId,
      url: tvMediaUrl(options.channelId, videoId),
    };
  } finally {
    await rm(stagingDirectory, {force: true, recursive: true});
  }
};
