import {
  NHENTAI_SYNC_HELP,
  runNhentaiSyncCli,
} from "~/content/providers/nhentai/cli";

try {
  const result = await runNhentaiSyncCli(process.argv.slice(2));
  if (!result) {
    console.log(NHENTAI_SYNC_HELP);
    process.exit(0);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
