import {NodeIO} from "@gltf-transform/core";
import {ALL_EXTENSIONS} from "@gltf-transform/extensions";
import {metalRough} from "@gltf-transform/functions";
import {createHash, randomUUID} from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import {resolve} from "node:path";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_HEADER_BYTE_LENGTH = 20;
const LEGACY_SPEC_GLOSS_EXTENSION = "KHR_materials_pbrSpecularGlossiness";
const MODEL_COMPATIBILITY_CACHE_VERSION = 1;

type PreparedModel = {
  byteLength: number;
  etag: string;
  filePath: string;
};

const conversionIo = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const pendingConversions = new Map<string, Promise<PreparedModel>>();

const readGlbJson = async (filePath: string) => {
  const file = await open(filePath, "r");
  try {
    const header = Buffer.alloc(GLB_HEADER_BYTE_LENGTH);
    const {bytesRead} = await file.read(header, 0, GLB_HEADER_BYTE_LENGTH, 0);
    if (
      bytesRead !== GLB_HEADER_BYTE_LENGTH ||
      header.readUInt32LE(0) !== GLB_MAGIC ||
      header.readUInt32LE(4) !== 2 ||
      header.readUInt32LE(16) !== GLB_JSON_CHUNK
    )
      return;
    const totalByteLength = header.readUInt32LE(8);
    const jsonByteLength = header.readUInt32LE(12);
    const source = await file.stat();
    if (
      totalByteLength > source.size ||
      jsonByteLength <= 0 ||
      jsonByteLength > totalByteLength - GLB_HEADER_BYTE_LENGTH
    )
      return;
    const json = Buffer.alloc(jsonByteLength);
    const result = await file.read(json, 0, jsonByteLength, 20);
    if (result.bytesRead !== jsonByteLength) return;
    return JSON.parse(json.toString("utf8").replace(/\0+$/u, "")) as unknown;
  } finally {
    await file.close();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const modelNeedsSpecGlossConversion = async (filePath: string) => {
  const document = await readGlbJson(filePath);
  if (!isRecord(document)) return false;
  return (
    Array.isArray(document.extensionsUsed) &&
    document.extensionsUsed.includes(LEGACY_SPEC_GLOSS_EXTENSION)
  );
};

const cachedModelName = (filePath: string, byteLength: number) => {
  const pathHash = createHash("sha256")
    .update(resolve(filePath))
    .digest("hex")
    .slice(0, 24);
  return `compat-v${MODEL_COMPATIBILITY_CACHE_VERSION}-${pathHash}-${byteLength}.glb`;
};

const preparedFile = async (filePath: string): Promise<PreparedModel> => {
  const file = await stat(filePath);
  return {
    byteLength: file.size,
    etag: `W/"${file.size.toString(16)}-${Math.floor(file.mtimeMs).toString(16)}"`,
    filePath,
  };
};

const convertModel = async (
  sourcePath: string,
  cacheDirectory: string,
): Promise<PreparedModel> => {
  const source = await stat(sourcePath);
  const cachePath = resolve(
    cacheDirectory,
    cachedModelName(sourcePath, source.size),
  );
  try {
    const cached = await stat(cachePath);
    if (cached.isFile() && cached.size > 0 && cached.mtimeMs >= source.mtimeMs)
      return preparedFile(cachePath);
  } catch {
    // The derivative will be generated below.
  }

  await mkdir(cacheDirectory, {recursive: true});
  const input = new Uint8Array(await readFile(sourcePath));
  const document = await conversionIo.readBinary(input);
  await document.transform(metalRough());
  const output = await conversionIo.writeBinary(document);
  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, output);
    await rename(temporaryPath, cachePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return preparedFile(cachePath);
};

export const prepareModelForThree = async (
  filePath: string,
  cacheDirectory: string,
) => {
  if (!(await modelNeedsSpecGlossConversion(filePath)))
    return preparedFile(filePath);
  const key = `${resolve(filePath)}\0${resolve(cacheDirectory)}`;
  const current = pendingConversions.get(key);
  if (current) return current;
  const pending = convertModel(filePath, cacheDirectory);
  pendingConversions.set(key, pending);
  try {
    return await pending;
  } finally {
    if (pendingConversions.get(key) === pending) pendingConversions.delete(key);
  }
};
