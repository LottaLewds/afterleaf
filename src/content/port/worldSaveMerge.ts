import {readFile, writeFile} from "node:fs/promises";

export interface WorldSaveBook {
  publicationId?: string;
  state?: string;
  pose?: unknown;
  shelf?: unknown;
}

export interface WorldSaveMergeSummary {
  addedKeys: string[];
  replacedKeys: string[];
  shallowMergedKeys: string[];
  unchangedKeys: string[];
  onlyInCurrentKeys: string[];
  skippedKeys: string[];
  books: {
    shelvedInBackup: number;
    duplicateShelved: number;
    merged: number;
    unchanged: number;
    missingFromNew: string[];
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const mergeBooks = (
  backup: Record<string, unknown>,
  current: Record<string, unknown>,
  summary: WorldSaveMergeSummary,
  mode: "placement" | "union",
): void => {
  if (!Array.isArray(backup.books) || !Array.isArray(current.books)) {
    console.warn(
      'Warning: "books" key is not an array in one of the files; skipping books merge.',
    );
    return;
  }

  const backupById = new Map<string, WorldSaveBook>();
  for (const book of backup.books as WorldSaveBook[]) {
    if (!book || typeof book.publicationId !== "string") continue;
    if (book.state !== "shelved") continue;
    if (backupById.has(book.publicationId)) {
      summary.books.duplicateShelved += 1;
      continue;
    }
    backupById.set(book.publicationId, book);
  }
  summary.books.shelvedInBackup = backupById.size;

  const mergedIds = new Set<string>();
  for (const book of current.books as WorldSaveBook[]) {
    const backupBook = backupById.get(book.publicationId ?? "");
    if (!backupBook) {
      summary.books.unchanged += 1;
      continue;
    }
    book.pose = backupBook.pose;
    book.state = "shelved";
    if (backupBook.shelf) book.shelf = backupBook.shelf;
    else delete book.shelf;
    mergedIds.add(book.publicationId ?? "");
    summary.books.merged += 1;
  }

  if (mode === "union") {
    for (const [id, backupBook] of backupById) {
      if (mergedIds.has(id)) continue;
      (current.books as WorldSaveBook[]).push({...backupBook});
      mergedIds.add(id);
      summary.books.merged += 1;
    }
  }

  summary.books.missingFromNew = [...backupById.keys()].filter(
    (id) => !mergedIds.has(id),
  );
};

export const mergeWorldSave = (
  backup: Record<string, unknown>,
  current: Record<string, unknown>,
  selectedKeys: Set<string>,
  mode: "placement" | "union" = "placement",
): {data: Record<string, unknown>; summary: WorldSaveMergeSummary} => {
  const summary: WorldSaveMergeSummary = {
    addedKeys: [],
    replacedKeys: [],
    shallowMergedKeys: [],
    unchangedKeys: [],
    onlyInCurrentKeys: [],
    skippedKeys: [],
    books: {
      shelvedInBackup: 0,
      duplicateShelved: 0,
      merged: 0,
      unchanged: 0,
      missingFromNew: [],
    },
  };

  const allKeys = [
    ...new Set([...Object.keys(backup), ...Object.keys(current)]),
  ].sort();

  for (const key of allKeys) {
    if (!selectedKeys.has(key)) {
      summary.skippedKeys.push(key);
      continue;
    }

    if (key === "books") {
      mergeBooks(backup, current, summary, mode);
      continue;
    }

    const hasBackup = Object.prototype.hasOwnProperty.call(backup, key);
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);

    if (!hasBackup && hasCurrent) {
      summary.onlyInCurrentKeys.push(key);
      continue;
    }

    const backupValue = backup[key];

    if (!hasCurrent) {
      current[key] = backupValue;
      summary.addedKeys.push(key);
      continue;
    }

    const currentValue = current[key];

    if (isPlainObject(backupValue) && isPlainObject(currentValue)) {
      const before = JSON.stringify(currentValue);
      current[key] = {...currentValue, ...backupValue};
      const after = JSON.stringify(current[key]);
      if (before === after) summary.unchangedKeys.push(key);
      else summary.shallowMergedKeys.push(key);
      continue;
    }

    const before = JSON.stringify(currentValue);
    const after = JSON.stringify(backupValue);
    if (before === after) {
      summary.unchangedKeys.push(key);
    } else {
      current[key] = backupValue;
      summary.replacedKeys.push(key);
    }
  }

  return {data: current, summary};
};

export const mergeWorldSaveFiles = async (
  backupPath: string,
  currentPath: string,
  outputPath: string,
  selectedKeys: Set<string>,
  mode: "placement" | "union" = "placement",
): Promise<WorldSaveMergeSummary> => {
  const backup = JSON.parse(await readFile(backupPath, "utf8")) as Record<
    string,
    unknown
  >;
  const current = JSON.parse(await readFile(currentPath, "utf8")) as Record<
    string,
    unknown
  >;
  const {data, summary} = mergeWorldSave(backup, current, selectedKeys, mode);
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return summary;
};
