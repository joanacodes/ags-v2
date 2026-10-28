/**
 * The only way a platform client talks to the network. Reads (GET) go through; writes (anything else)
 * go through only when the client was made live, which the publish worker does after checking
 * STUDIO_LIVE and the owner's approval. A client made dry records the exact write it would have sent
 * and throws DryRunStop, so a dry run is the real code path up to the last moment. A test builds every
 * client dry and proves no write ever reaches fetch.
 */

export class DryRunStop extends Error {
  constructor(readonly request: RecordedRequest) {
    super(`dry run: ${request.method} ${request.url}`);
  }
}

export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  /** The body as sent (JSON or form fields); binary uploads are summarised by their size. */
  readonly body?: unknown;
}

export type Fetch = typeof fetch;

/** The POST endpoints that only read: TikTok's creator settings, a post's status, its videos' numbers. */
export const READ_ONLY_POST = /^\/v2\/(?:post\/publish\/creator_info\/query|post\/publish\/status\/fetch|video\/query)\/?$/;

/** The token endpoints signIn may call: OAuth token exchanges and Bluesky's sessions. */
export const AUTH_ENDPOINT = /(?:\/oauth2?\/token\/?|\/oauth\/access_token|\/token|\/com\.atproto\.server\.(?:createSession|refreshSession))$/;

/** Keep secrets out of logs: tokens in query strings and auth headers never leave this file. */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:access_token|client_secret|fb_exchange_token|code|refresh_token)=)[^&]+/gi, "$1…");
}

export class Http {
  readonly recorded: RecordedRequest[] = [];

  constructor(
    private readonly live: boolean,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  get isLive(): boolean {
    return this.live;
  }

  async get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const res = await this.fetchImpl(url, { method: "GET", headers });
    return this.read<T>(res, "GET", url);
  }

  /** Any request that changes something on a platform. */
  async write<T>(method: "POST" | "PUT" | "DELETE" | "PATCH", url: string, init: { headers?: Record<string, string>; json?: unknown; form?: Record<string, string>; body?: Uint8Array | FormData; summary?: unknown } = {}): Promise<T> {
    const recorded: RecordedRequest = { method, url: redactUrl(url), body: init.summary ?? init.json ?? init.form ?? (init.body instanceof Uint8Array ? { bytes: init.body.byteLength } : init.body ? "(form data)" : undefined) };
    this.recorded.push(recorded);
    if (!this.live) throw new DryRunStop(recorded);
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(init.form).toString();
    } else if (init.body) {
      body = init.body as BodyInit;
    }
    const res = await this.fetchImpl(url, { method, headers, body });
    return this.read<T>(res, method, url);
  }

  /**
   * A POST that only trades credentials for a token (sign in, refresh). It changes nothing anyone can
   * see, so it runs in dry runs too, which lets a dry run read comments and numbers. It refuses any
   * address that isn't a token endpoint, so it can't become a way round the guard.
   */
  async signIn<T>(url: string, init: { headers?: Record<string, string>; json?: unknown; form?: Record<string, string> }): Promise<T> {
    if (!AUTH_ENDPOINT.test(new URL(url).pathname)) throw new Error(`signIn is for token endpoints only, not ${redactUrl(url)}`);
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    let body: string | undefined;
    if (init.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(init.form).toString();
    }
    const res = await this.fetchImpl(url, { method: "POST", headers, body });
    return this.read<T>(res, "POST", url);
  }

  /**
   * A POST that only reads (TikTok asks with POST for a creator's settings, a post's status and its
   * numbers). It runs in dry runs; it refuses any address not on the read-only list.
   */
  async query<T>(url: string, init: { headers?: Record<string, string>; json?: unknown }): Promise<T> {
    if (!READ_ONLY_POST.test(new URL(url).pathname)) throw new Error(`query is for read-only endpoints only, not ${redactUrl(url)}`);
    const res = await this.fetchImpl(url, { method: "POST", headers: { ...(init.headers ?? {}), "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(init.json ?? {}) });
    return this.read<T>(res, "POST", url);
  }

  /** The raw response of a write, for uploads whose answer is in a header (resumable sessions). */
  async writeRaw(method: "POST" | "PUT", url: string, init: { headers?: Record<string, string>; json?: unknown; body?: Uint8Array; summary?: unknown }): Promise<Response> {
    const recorded: RecordedRequest = { method, url: redactUrl(url), body: init.summary ?? init.json ?? (init.body ? { bytes: init.body.byteLength } : undefined) };
    this.recorded.push(recorded);
    if (!this.live) throw new DryRunStop(recorded);
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      body = JSON.stringify(init.json);
    } else if (init.body) body = init.body as BodyInit;
    const res = await this.fetchImpl(url, { method, headers, body });
    if (!res.ok) throw new PlatformError(`${method} ${redactUrl(url)} answered ${res.status}`, res.status, (await res.text()).slice(0, 600));
    return res;
  }

  private async read<T>(res: Response, method: string, url: string): Promise<T> {
    const text = await res.text();
    if (!res.ok) throw new PlatformError(`${method} ${redactUrl(url)} answered ${res.status}: ${text.slice(0, 300)}`, res.status, text.slice(0, 600));
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return { raw: text } as T;
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
