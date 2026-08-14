import {randomUUID} from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

// Vite loads this module while its config is still being evaluated, before the
// application alias is installed.
import {parseWorldSave, type WorldSaveV1} from "./worldSave";

export const loadWorldSaveFile = async (
  filePath: string,
): Promise<WorldSaveV1 | undefined> => {
  try {
    return parseWorldSave(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }
};

export const saveWorldSaveFile = async (
  filePath: string,
  save: WorldSaveV1,
) => {
  const validatedSave = parseWorldSave(save);
  const directory = path.dirname(filePath);
  const temporaryPath = path.resolve(
    directory,
    `.${path.basename(filePath)}.staging-${process.pid}-${randomUUID()}`,
  );
  await mkdir(directory, {recursive: true});
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(validatedSave, null, 2)}\n`,
      {
        flag: "wx",
      },
    );
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, {force: true}).catch(() => {});
    throw error;
  }
};

const WORLD_STATE_BACKUP_FILE_PATTERN = /^world-state\..+\.json$/u;

export const saveWorldStateBackup = async (
  backupDirectory: string,
  save: WorldSaveV1,
  createdAt = new Date(),
) => {
  const timestamp = createdAt.toISOString().replaceAll(":", "-");
  const backupPath = path.resolve(
    backupDirectory,
    `world-state.${timestamp}.json`,
  );
  await saveWorldSaveFile(backupPath, save);
  return backupPath;
};

export const pruneWorldStateBackups = async (
  backupDirectory: string,
  maximumCount: number,
) => {
  let backupNames: string[];
  try {
    backupNames = (await readdir(backupDirectory))
      .filter((name) => WORLD_STATE_BACKUP_FILE_PATTERN.test(name))
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return 0;
    throw error;
  }
  const removalCount = Math.max(0, backupNames.length - maximumCount);
  await Promise.all(
    backupNames
      .slice(0, removalCount)
      .map((name) => rm(path.resolve(backupDirectory, name))),
  );
  return removalCount;
};
