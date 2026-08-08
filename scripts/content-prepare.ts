import {CONTENT_PREPARE_HELP, runContentPrepareCli} from "~/content/prepareCli";

try {
  const report = await runContentPrepareCli(Bun.argv.slice(2));
  if (!report) {
    console.log(CONTENT_PREPARE_HELP);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
