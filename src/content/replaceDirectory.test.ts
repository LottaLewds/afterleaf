import {describe, expect, test} from "bun:test";
import type {ReplaceDirectoryOperations} from "~/content/replaceDirectory";
import {replaceDirectory} from "~/content/replaceDirectory";

const filesystemError = (code: string) => Object.assign(new Error(code), {code});

describe("replaceDirectory", () => {
  test("retries the cross-platform copy fallback after transient failures", async () => {
    let copyAttempts = 0;
    let renameAttempts = 0;
    const removed: string[] = [];
    const operations: ReplaceDirectoryOperations = {
      copy: async () => {
        copyAttempts += 1;
        if (copyAttempts === 1) throw filesystemError("EPERM");
      },
      remove: async (path) => {
        removed.push(String(path));
      },
      rename: async () => {
        renameAttempts += 1;
        throw filesystemError("EPERM");
      },
      wait: async () => {},
    };

    await expect(replaceDirectory("staging", "revision", operations)).resolves.toBeUndefined();
    expect(renameAttempts).toBe(6);
    expect(copyAttempts).toBe(2);
    expect(removed).toEqual(["revision", "revision", "revision", "staging"]);
  });

  test("reports both rename and fallback errors", async () => {
    const operations: ReplaceDirectoryOperations = {
      copy: async () => {
        throw filesystemError("EIO");
      },
      remove: async () => {},
      rename: async () => {
        throw filesystemError("EPERM");
      },
      wait: async () => {},
    };

    await expect(replaceDirectory("staging", "revision", operations)).rejects.toThrow(
      "rename failed (EPERM: EPERM), then copy fallback failed (EIO: EIO)",
    );
  });
});
