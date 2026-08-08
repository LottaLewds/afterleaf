import {ARCHIVE_IMPORT_HELP, runArchiveImportCli} from "~/content/archiveCli";

try {
  const report = await runArchiveImportCli(Bun.argv.slice(2));
  if (!report) {
    console.log(ARCHIVE_IMPORT_HELP);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
