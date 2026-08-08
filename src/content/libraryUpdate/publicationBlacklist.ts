import {randomUUID} from "node:crypto";
import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, parse, relative, resolve} from "node:path";

const BLACKLIST_SCHEMA_VERSION = 1 as const;
const BLACKLIST_FILE_NAME = "publication-blacklist.json";
const PUBLICATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,255}$/u;

export type PublicationBlacklistDocument = {
  publicationIds: string[];
  schemaVersion: typeof BLACKLIST_SCHEMA_VERSION;
};

export type AddPublicationBlacklistResult = {
  added: boolean;
  blacklistedCount: number;
  publicationId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const assertStablePublicationId = (publicationId: string) => {
  if (!PUBLICATION_ID_PATTERN.test(publicationId))
    throw new Error(
      "Publication ID must start with a lowercase letter or number, contain only lowercase letters, numbers, dots, underscores, or hyphens, and be at most 256 characters",
    );
  return publicationId;
};

const parseDocument = (
  value: unknown,
  path: string,
): PublicationBlacklistDocument => {
  if (!isRecord(value)) throw new Error(`${path} must contain an object`);
  if (value.schemaVersion !== BLACKLIST_SCHEMA_VERSION)
    throw new Error(
      `${path}.schemaVersion must be ${BLACKLIST_SCHEMA_VERSION}`,
    );
  if (!Array.isArray(value.publicationIds))
    throw new Error(`${path}.publicationIds must be an array`);
  const publicationIds = value.publicationIds.map((entry, index) => {
    if (typeof entry !== "string")
      throw new Error(`${path}.publicationIds[${index}] must be a string`);
    return assertStablePublicationId(entry);
  });
  if (new Set(publicationIds).size !== publicationIds.length)
    throw new Error(`${path}.publicationIds must not contain duplicates`);
  return {
    publicationIds: publicationIds.toSorted(),
    schemaVersion: BLACKLIST_SCHEMA_VERSION,
  };
};

const assertSafeRoot = (path: string) => {
  const root = resolve(path);
  if (root === parse(root).root)
    throw new Error(
      "The publication blacklist root cannot be a filesystem root",
    );
  if (basename(root) === "." || basename(root) === "..")
    throw new Error("The publication blacklist root must be a named directory");
  return root;
};

export class PublicationBlacklistStore {
  readonly #path: string;
  readonly #root: string;
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(rootDirectory: string) {
    this.#root = assertSafeRoot(rootDirectory);
    this.#path = resolve(this.#root, BLACKLIST_FILE_NAME);
    if (relative(this.#root, this.#path) !== BLACKLIST_FILE_NAME)
      throw new Error("The publication blacklist path escapes its root");
  }

  get path() {
    return this.#path;
  }

  async read(): Promise<PublicationBlacklistDocument> {
    try {
      const fileStat = await stat(this.#path);
      if (!fileStat.isFile())
        throw new Error(`Publication blacklist is not a file: ${this.#path}`);
      const value = JSON.parse(await readFile(this.#path, "utf8")) as unknown;
      return parseDocument(value, this.#path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return {publicationIds: [], schemaVersion: BLACKLIST_SCHEMA_VERSION};
      throw error;
    }
  }

  async list() {
    return (await this.read()).publicationIds;
  }

  add(publicationId: string) {
    const stablePublicationId = assertStablePublicationId(publicationId);
    const mutation = this.#mutationQueue.then(() =>
      this.#add(stablePublicationId),
    );
    this.#mutationQueue = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  async #add(publicationId: string): Promise<AddPublicationBlacklistResult> {
    const document = await this.read();
    if (document.publicationIds.includes(publicationId))
      return {
        added: false,
        blacklistedCount: document.publicationIds.length,
        publicationId,
      };

    const nextDocument: PublicationBlacklistDocument = {
      publicationIds: [...document.publicationIds, publicationId].toSorted(),
      schemaVersion: BLACKLIST_SCHEMA_VERSION,
    };
    await mkdir(this.#root, {recursive: true});
    const temporaryPath = resolve(
      this.#root,
      `.${BLACKLIST_FILE_NAME}.staging-${randomUUID()}`,
    );
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(nextDocument, null, 2)}\n`,
        {flag: "wx"},
      );
      await rename(temporaryPath, this.#path);
    } catch (error) {
      await rm(temporaryPath, {force: true});
      throw error;
    }
    return {
      added: true,
      blacklistedCount: nextDocument.publicationIds.length,
      publicationId,
    };
  }
}
