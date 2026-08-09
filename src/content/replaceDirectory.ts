import {cp, rename, rm} from "node:fs/promises";

const ATTEMPT_COUNT = 6;
const TRANSIENT_ERROR_CODES = new Set([
  "EACCES",
  "EBUSY",
  "ENOTEMPTY",
  "EPERM",
]);

export interface ReplaceDirectoryOperations {
  copy: typeof cp;
  remove: typeof rm;
  rename: typeof rename;
  wait: (milliseconds: number) => Promise<void>;
}

const defaultOperations: ReplaceDirectoryOperations = {
  copy: cp,
  remove: rm,
  rename,
  wait: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const errorCode = (error: unknown) =>
  error instanceof Error && "code" in error ? String(error.code) : undefined;

const isTransientFilesystemError = (error: unknown) => {
  const code = errorCode(error);
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
};

const errorSummary = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const code = errorCode(error);
  return code === undefined ? message : `${code}: ${message}`;
};

// Prefer an atomic directory rename on every host. Watchers, indexers, and
// antivirus tools can temporarily deny either rename or reads of freshly
// written files, so the copy fallback gets the same bounded retry treatment.
export const replaceDirectory = async (
  source: string,
  destination: string,
  operations: ReplaceDirectoryOperations = defaultOperations,
) => {
  let renameError: unknown;
  for (let attempt = 0; attempt < ATTEMPT_COUNT; attempt += 1) {
    try {
      await operations.rename(source, destination);
      return;
    } catch (error) {
      renameError = error;
      if (!isTransientFilesystemError(error)) throw error;
      await operations.wait(100 * (attempt + 1));
    }
  }

  let copyError: unknown;
  for (let attempt = 0; attempt < ATTEMPT_COUNT; attempt += 1) {
    try {
      await operations.remove(destination, {force: true, recursive: true});
      await operations.copy(source, destination, {
        force: true,
        recursive: true,
      });
      await operations
        .remove(source, {force: true, recursive: true})
        .catch(() => {});
      return;
    } catch (error) {
      copyError = error;
      await operations
        .remove(destination, {force: true, recursive: true})
        .catch(() => {});
      if (!isTransientFilesystemError(error)) break;
      await operations.wait(100 * (attempt + 1));
    }
  }

  throw new Error(
    `Failed to replace directory ${destination}; rename failed (${errorSummary(renameError)}), then copy fallback failed (${errorSummary(copyError)})`,
    {cause: new AggregateError([renameError, copyError])},
  );
};
