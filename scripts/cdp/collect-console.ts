import {CdpSession, positiveNumber} from "./client";

const sampleMs = positiveNumber(process.env.AFTERLEAF_CDP_CONSOLE_MS, 5_000);
const reload = process.env.AFTERLEAF_CDP_CONSOLE_RELOAD === "true";
const messages = new Map<string, number>();
const session = await CdpSession.connect();
const stopListening = session.onEvent((method, rawParams) => {
  if (method === "Runtime.consoleAPICalled") {
    const params = rawParams as {
      args?: {description?: string; value?: unknown}[];
      type?: string;
    };
    if (params.type !== "error" && params.type !== "warning") return;
    const text = (params.args ?? [])
      .map((argument) =>
        argument.value === undefined
          ? (argument.description ?? "")
          : String(argument.value),
      )
      .join(" ");
    const key = `${params.type}: ${text}`;
    messages.set(key, (messages.get(key) ?? 0) + 1);
    return;
  }
  if (method !== "Runtime.exceptionThrown") return;
  const params = rawParams as {
    exceptionDetails?: {
      exception?: {description?: string};
      text?: string;
    };
  };
  const text =
    params.exceptionDetails?.exception?.description ??
    params.exceptionDetails?.text ??
    "Unknown exception";
  const key = `exception: ${text}`;
  messages.set(key, (messages.get(key) ?? 0) + 1);
});
try {
  await session.request("Runtime.enable");
  if (reload) await session.request("Page.reload", {ignoreCache: false});
  await Bun.sleep(sampleMs);
  console.log(
    JSON.stringify(
      [...messages.entries()]
        .map(([message, count]) => ({count, message}))
        .sort((left, right) => right.count - left.count),
      null,
      2,
    ),
  );
} finally {
  stopListening();
  session.close();
}
