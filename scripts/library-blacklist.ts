import {runLibraryBlacklistCli} from "~/content/libraryUpdate/cli";

try {
  const result = await runLibraryBlacklistCli(process.argv.slice(2), process.cwd());
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
