const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222";

export type CdpTarget = {
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
};

type CdpMessage = {
  error?: {message?: string};
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (result: unknown) => void;
};

export const cdpEndpoint = () => process.env.AFTERLEAF_CDP_ENDPOINT ?? DEFAULT_CDP_ENDPOINT;

export const afterleafGameUrl = () => {
  const url = process.env.AFTERLEAF_GAME_URL;
  if (!url) throw new Error("AFTERLEAF_GAME_URL is unavailable; use the WSL wrapper or set it explicitly");
  return url;
};

export const findAfterleafTarget = async () => {
  const response = await fetch(`${cdpEndpoint()}/json/list`);
  if (!response.ok) throw new Error(`CDP target discovery failed: ${response.status}`);
  const targets = (await response.json()) as CdpTarget[];
  const targetSubstring = process.env.AFTERLEAF_CDP_TARGET ?? new URL(afterleafGameUrl()).host;
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.includes(targetSubstring));
  if (!target) throw new Error(`No page target URL contains ${JSON.stringify(targetSubstring)}`);
  return target;
};

export class CdpSession {
  readonly #eventListeners = new Set<(method: string, params: unknown) => void>();
  readonly #pending = new Map<number, PendingRequest>();
  readonly #socket: WebSocket;
  #nextRequestId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const request = this.#pending.get(message.id);
        if (!request) return;
        this.#pending.delete(message.id);
        if (message.error?.message) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }
      if (!message.method) return;
      for (const listener of this.#eventListeners) listener(message.method, message.params);
    });
  }

  static async connect(target?: CdpTarget) {
    const resolvedTarget = target ?? (await findAfterleafTarget());
    const socket = new WebSocket(resolvedTarget.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), {once: true});
      socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed")), {once: true});
    });
    return new CdpSession(socket);
  }

  close() {
    this.#socket.close();
  }

  onEvent(listener: (method: string, params: unknown) => void) {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  request<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.#nextRequestId;
    this.#nextRequestId += 1;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        reject,
        resolve: (result) => resolve(result as T),
      });
      this.#socket.send(JSON.stringify({id, method, params}));
    });
  }

  async evaluate<T>(expression: string) {
    const response = await this.request<{
      exceptionDetails?: {
        exception?: {description?: string};
        text?: string;
      };
      result?: {value?: T};
    }>("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    const error = response.exceptionDetails?.exception?.description ?? response.exceptionDetails?.text;
    if (error) throw new Error(error);
    return response.result?.value;
  }
}

export const positiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
