import {
  LIBRARY_FETCH_MORE_HELP,
  runLibraryFetchMoreCli,
} from "~/content/libraryUpdate/cli";

try {
  const result = await runLibraryFetchMoreCli(
    process.argv.slice(2),
    process.cwd(),
    (state) => {
      if (state.status !== "running") return;
      console.error(
        `[${state.completedSteps}/${state.totalSteps}] ${state.message}`,
      );
    },
  );
  if (!result) {
    console.log(LIBRARY_FETCH_MORE_HELP);
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
