/**
 * Wraps a minimal fetch implementation as a full `typeof fetch`, attaching
 * the `preconnect` companion that Bun's fetch typing requires. Tests only
 * exercise request/response behavior, so preconnect is a no-op stub.
 */
export const stubFetch = (
  handler: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>,
): typeof fetch => {
  const stub = ((input, init) => handler(input, init)) as typeof fetch;
  stub.preconnect = () => {};
  return stub;
};
