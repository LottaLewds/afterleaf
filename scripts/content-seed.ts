import {CONTENT_SEED_HELP, runContentSeedCli} from "~/content/cli";

try {
  const result = await runContentSeedCli(Bun.argv.slice(2));
  if (!result) {
    console.log(CONTENT_SEED_HELP);
  } else {
    console.log(JSON.stringify(result.report, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
