import {randomUUID} from "node:crypto";
import {mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
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
