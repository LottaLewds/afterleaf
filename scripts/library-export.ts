import {runExportCli} from "~/content/port/cli";

try {
  await runExportCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
