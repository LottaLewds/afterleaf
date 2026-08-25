import {
  LIBRARY_SCAN_HELP,
  runLibraryScanCli,
} from "~/content/libraryUpdate/cli";

try {
  const result = await runLibraryScanCli(
    process.argv.slice(2),
    process.cwd(),
    (state) => {
      if (state.status !== "running") return;
      const subProgress =
        state.subProgress === undefined
          ? ""
          : `:${state.subProgress.completed}/${state.subProgress.total}`;
      console.error(
        `[${state.completedSteps}/${state.totalSteps}${subProgress}] ${state.message}`,
      );
    },
  );
  if (!result) {
    console.log(LIBRARY_SCAN_HELP);
    process.exit(0);
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    process.stdout.write(
      `${JSON.stringify(result, null, 2)}\n`,
      (error: Error | null | undefined) => {
        if (error) rejectPromise(error);
        else resolvePromise();
      },
    );
  });
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
