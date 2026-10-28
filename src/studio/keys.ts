/**
 * Every key the Studio needs beyond what AGS already has, pasted once by the owner in Settings → Keys and
 * kept in Supabase Vault (`studio:key-…`). The server and the workers load them all together into their
 * environment (`hydrateKeys`), at most once a minute, so the rest of the code reads `process.env` as it
 * always has and a key never has to be set on Vercel or in GitHub.
 *
 * A key set in the Studio wins over the same variable in the environment; removing it falls back to the
 * environment's value again. A value is never sent back to a browser: the screen sees only whether a key
 * is set, where from and when, and, for ids that aren't secret (an app id), the id itself.
 */

export type KeyGroup = "posting" | "networks" | "voice" | "email" | "numbers" | "github";

export interface KeyDef {
  /** The environment variable the code reads. */
  readonly env: string;
  readonly label: string;
  readonly group: KeyGroup;
  /** False for ids that identify without unlocking anything (an app id, a page id): shown in full. */
  readonly secret: boolean;
  /** Where the owner finds it. */
  readonly where: string;
  readonly optional?: boolean;
}

export const KEY_GROUPS: readonly { readonly id: KeyGroup; readonly label: string; readonly blurb: string }[] = [
  { id: "posting", label: "Posting service", blurb: "Postly posts to TikTok, YouTube and Pinterest publicly without their app reviews." },
  { id: "networks", label: "The networks' apps", blurb: "Only for the networks the Studio reaches through their own API; Connect each one under Connections." },
  { id: "voice", label: "Voice", blurb: "The cloned voice of the videos and the Video studio's previews." },
  { id: "email", label: "Email", blurb: "Reminders by email." },
  { id: "numbers", label: "Orders and email numbers", blurb: "Read on Fridays for the scorecard." },
  { id: "github", label: "GitHub", blurb: "Starts the background jobs (writing, rendering, posting) and stops them for the kill switch." },
];

export const STUDIO_KEYS: readonly KeyDef[] = [
  { env: "POSTLY_API_KEY", label: "Postly API key", group: "posting", secret: true, where: "app.postly.ai → Automations → API" },
  { env: "META_APP_ID", label: "Meta app id", group: "networks", secret: false, where: "developers.facebook.com → your app → App settings → Basic" },
  { env: "META_APP_SECRET", label: "Meta app secret", group: "networks", secret: true, where: "developers.facebook.com → your app → App settings → Basic" },
  { env: "META_LOGIN_CONFIG_ID", label: "Meta login configuration id", group: "networks", secret: false, where: "Only for Facebook Login for Business: Facebook Login → Configurations", optional: true },
  { env: "META_PAGE_ID", label: "Facebook Page id", group: "networks", secret: false, where: "Only if your account manages several Pages: the Page's About → Page transparency", optional: true },
  { env: "THREADS_APP_ID", label: "Threads app id", group: "networks", secret: false, where: "developers.facebook.com → your app → Use cases → Threads → Settings" },
  { env: "THREADS_APP_SECRET", label: "Threads app secret", group: "networks", secret: true, where: "developers.facebook.com → your app → Use cases → Threads → Settings" },
  { env: "GOOGLE_CLIENT_ID", label: "Google OAuth client id (YouTube)", group: "networks", secret: false, where: "console.cloud.google.com → APIs and services → Credentials" },
  { env: "GOOGLE_CLIENT_SECRET", label: "Google OAuth client secret (YouTube)", group: "networks", secret: true, where: "console.cloud.google.com → APIs and services → Credentials" },
  { env: "PINTEREST_APP_ID", label: "Pinterest app id", group: "networks", secret: false, where: "developers.pinterest.com → My apps" },
  { env: "PINTEREST_APP_SECRET", label: "Pinterest app secret", group: "networks", secret: true, where: "developers.pinterest.com → My apps" },
  { env: "X_CLIENT_ID", label: "X client id", group: "networks", secret: false, where: "developer.x.com → your app → Keys and tokens → OAuth 2.0" },
  { env: "X_CLIENT_SECRET", label: "X client secret", group: "networks", secret: true, where: "developer.x.com → your app → Keys and tokens → OAuth 2.0" },
  { env: "TIKTOK_CLIENT_KEY", label: "TikTok client key", group: "networks", secret: false, where: "developers.tiktok.com → your app" },
  { env: "TIKTOK_CLIENT_SECRET", label: "TikTok client secret", group: "networks", secret: true, where: "developers.tiktok.com → your app" },
  { env: "ELEVENLABS_API_KEY", label: "ElevenLabs API key", group: "voice", secret: true, where: "elevenlabs.io → Profile → API keys" },
  { env: "RESEND_API_KEY", label: "Resend API key (sending access)", group: "email", secret: true, where: "resend.com → API keys" },
  { env: "STUDIO_EMAIL_FROM", label: "Sender address", group: "email", secret: false, where: "An address on a domain verified in Resend, e.g. The Studio <studio@astrostudy.co.uk>" },
  { env: "STRIPE_READ_KEY", label: "Stripe restricted key (Checkout Sessions: read)", group: "numbers", secret: true, where: "dashboard.stripe.com → Developers → API keys → Create restricted key" },
  { env: "MAILERLITE_API_KEY", label: "MailerLite API token", group: "numbers", secret: true, where: "MailerLite → Integrations → API" },
  { env: "GITHUB_STUDIO_TOKEN", label: "GitHub fine-grained token (Actions: read and write on ags-v2)", group: "github", secret: true, where: "github.com → Settings → Developer settings → Fine-grained tokens" },
];

/** What AGS already holds and the Studio shares: shown, never edited here. */
export const SHARED_KEYS: readonly { readonly env: string; readonly label: string }[] = [
  { env: "ANTHROPIC_API_KEY", label: "Anthropic API key (AGS's)" },
  { env: "FREE_ASTRO_API_KEY", label: "FreeAstroAPI key (AGS's)" },
];

const BY_ENV = new Map(STUDIO_KEYS.map((k) => [k.env, k]));
export const keyDef = (env: string): KeyDef | undefined => BY_ENV.get(env);

/** The Vault name of a key: `key-elevenlabs-api-key` for ELEVENLABS_API_KEY. */
export function vaultName(env: string): string {
  return `key-${env.toLowerCase().replace(/_/g, "-")}`;
}

export interface StoredKey {
  /** The Vault name, without the `studio:` prefix. */
  readonly name: string;
  readonly value: string;
  readonly updated_at: string;
}

export interface KeySource {
  studioKeys(): Promise<StoredKey[]>;
}

type Env = Record<string, string | undefined>;

interface KeysState {
  loadedAt: number;
  /** The environment's own values, kept aside before the first load wrote over any of them. */
  original: Map<string, string | undefined> | null;
  fromStudio: Map<string, string>;
  error: string | null;
}

// One state per process, not per module: Next.js bundles each route with its own copy of this file, and
// they all share process.env. A copy loading for the first time after another had written a key into the
// environment would otherwise keep that key aside as the environment's own, and removing it would not.
const holder = globalThis as typeof globalThis & { __studioKeys?: KeysState };
const state: KeysState = (holder.__studioKeys ??= { loadedAt: 0, original: null, fromStudio: new Map(), error: null });

/** The keys currently in force from the Studio (env name → when it was set). */
export function keysFromStudio(): ReadonlyMap<string, string> {
  return state.fromStudio;
}

/**
 * Put the Studio's keys into the environment. Within `maxAgeMs` of the last load nothing is read again;
 * `force` (after the owner saves or removes a key) reloads now. The environment's own values are kept
 * aside on the first load, so removing a key in the Studio gives the environment's back.
 */
export async function hydrateKeys(source: KeySource, opts: { env?: Env; now?: number; maxAgeMs?: number; force?: boolean } = {}): Promise<void> {
  const env = opts.env ?? (process.env as Env);
  const now = opts.now ?? Date.now();
  if (!opts.force && state.original && now - state.loadedAt < (opts.maxAgeMs ?? 60_000)) return;
  state.original ??= new Map(STUDIO_KEYS.map((k) => [k.env, env[k.env]]));
  let stored: StoredKey[];
  try {
    stored = await source.studioKeys();
  } catch (err) {
    // Vault out of reach (or the migration not run yet) must not take every screen down: the keys in
    // force stay as they were, and Settings → Keys says why it can't show the Studio's own.
    state.error = err instanceof Error ? err.message : String(err);
    state.loadedAt = now;
    console.warn(`[studio] keys not loaded from Vault: ${state.error}`);
    return;
  }
  state.error = null;
  const byName = new Map(stored.map((s) => [s.name, s]));
  const fromStudio = new Map<string, string>();
  for (const k of STUDIO_KEYS) {
    const s = byName.get(vaultName(k.env));
    const value = s?.value.trim();
    if (value) {
      env[k.env] = value;
      fromStudio.set(k.env, s!.updated_at);
    } else {
      const original = state.original.get(k.env);
      if (original === undefined) delete env[k.env];
      else env[k.env] = original;
    }
  }
  state.fromStudio = fromStudio;
  state.loadedAt = now;
}

/** For tests: forget what was loaded, as a fresh process would. */
export function resetKeysForTests(): void {
  state.loadedAt = 0;
  state.original = null;
  state.fromStudio = new Map();
  state.error = null;
}

export type KeyState = "studio" | "environment" | "missing";

export interface KeyLine {
  readonly env: string;
  readonly label: string;
  readonly group: KeyGroup;
  readonly secret: boolean;
  readonly where: string;
  readonly optional: boolean;
  readonly state: KeyState;
  /** When it was set in the Studio. */
  readonly setAt: string | null;
  /** The value itself, for ids only; a secret's value never leaves the server. */
  readonly shown: string | null;
  readonly checkable: boolean;
}

/** What Settings → Keys shows, from the environment after `hydrateKeys`. */
export function keyLines(env: Env = process.env as Env): { keys: KeyLine[]; shared: { env: string; label: string; set: boolean }[]; loadError: string | null } {
  const keys = STUDIO_KEYS.map((k): KeyLine => {
    const value = (env[k.env] ?? "").trim();
    const setAt = state.fromStudio.get(k.env) ?? null;
    return {
      env: k.env,
      label: k.label,
      group: k.group,
      secret: k.secret,
      where: k.where,
      optional: !!k.optional,
      state: setAt ? "studio" : value ? "environment" : "missing",
      setAt,
      shown: !k.secret && value ? value : null,
      checkable: k.env in CHECKS,
    };
  });
  return { keys, shared: SHARED_KEYS.map((s) => ({ ...s, set: !!(env[s.env] ?? "").trim() })), loadError: state.error };
}

export interface KeyCheck {
  readonly ok: boolean;
  readonly detail: string;
}

type Check = (value: string, fetchImpl: typeof fetch, env: Env) => Promise<KeyCheck>;

async function answer(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = await res.text();
  try {
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  } catch {
    return { status: res.status, body: { message: text.slice(0, 200) } };
  }
}

const said = (body: Record<string, unknown>): string => {
  const m = body["message"] ?? (body["error"] as Record<string, unknown> | undefined)?.["message"] ?? body["error"] ?? body["detail"];
  return typeof m === "string" ? m : typeof m === "object" && m ? JSON.stringify(m).slice(0, 200) : "no reason given";
};

/** A cheap read per service that has one: the key works, or what the service said. Reads only, never a write. */
const CHECKS: Readonly<Record<string, Check>> = {
  POSTLY_API_KEY: async (v, f) => {
    const r = await answer(await f("https://openapi.postly.ai/v1/workspaces", { headers: { "X-API-Key": v } }));
    if (r.status !== 200) return { ok: false, detail: `Postly answered ${r.status}: ${said(r.body)}` };
    const n = Array.isArray(r.body["data"]) ? (r.body["data"] as unknown[]).length : 0;
    return { ok: true, detail: `Postly answered: ${n} workspace${n === 1 ? "" : "s"}` };
  },
  ELEVENLABS_API_KEY: async (v, f) => {
    const r = await answer(await f("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": v } }));
    if (r.status !== 200) return { ok: false, detail: `ElevenLabs answered ${r.status}: ${said(r.body)}` };
    return { ok: true, detail: `ElevenLabs answered: plan ${String(r.body["tier"] ?? "unknown")}` };
  },
  RESEND_API_KEY: async (v, f) => {
    const r = await answer(await f("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${v}` } }));
    if (r.status === 200) return { ok: true, detail: "Resend answered" };
    // A key with sending access only may not list domains: it works for what the Studio does.
    if (r.status === 401 && /restricted/i.test(said(r.body))) return { ok: true, detail: "Resend answered: a sending-only key" };
    return { ok: false, detail: `Resend answered ${r.status}: ${said(r.body)}` };
  },
  STRIPE_READ_KEY: async (v, f) => {
    const r = await answer(await f("https://api.stripe.com/v1/checkout/sessions?limit=1", { headers: { Authorization: `Bearer ${v}` } }));
    return r.status === 200 ? { ok: true, detail: "Stripe answered: Checkout Sessions can be read" } : { ok: false, detail: `Stripe answered ${r.status}: ${said(r.body)}` };
  },
  MAILERLITE_API_KEY: async (v, f) => {
    const r = await answer(await f("https://connect.mailerlite.com/api/subscribers?limit=1", { headers: { Authorization: `Bearer ${v}`, Accept: "application/json" } }));
    return r.status === 200 ? { ok: true, detail: "MailerLite answered" } : { ok: false, detail: `MailerLite answered ${r.status}: ${said(r.body)}` };
  },
  GITHUB_STUDIO_TOKEN: async (v, f, env) => {
    const repo = (env["STUDIO_GITHUB_REPO"] ?? "joanacodes/ags-v2").trim();
    const r = await answer(await f(`https://api.github.com/repos/${repo}/actions/workflows`, { headers: { Authorization: `Bearer ${v}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }));
    if (r.status !== 200) return { ok: false, detail: `GitHub answered ${r.status}: ${said(r.body)}` };
    const names = ((r.body["workflows"] as { path?: string }[] | undefined) ?? []).map((w) => (w.path ?? "").split("/").pop());
    const missing = ["studio-run.yml", "studio-render.yml"].filter((w) => !names.includes(w));
    return missing.length ? { ok: false, detail: `GitHub answered, but ${repo} has no ${missing.join(" or ")} on its default branch yet` } : { ok: true, detail: `GitHub answered: the Studio's workflows are in ${repo}` };
  },
};

export async function checkKey(envName: string, opts: { env?: Env; fetchImpl?: typeof fetch } = {}): Promise<KeyCheck> {
  const env = opts.env ?? (process.env as Env);
  const check = CHECKS[envName];
  if (!check) return { ok: false, detail: "this key has no check: Connect tests it" };
  const value = (env[envName] ?? "").trim();
  if (!value) return { ok: false, detail: "not set" };
  try {
    return await check(value, opts.fetchImpl ?? fetch, env);
  } catch (err) {
    return { ok: false, detail: `no answer: ${err instanceof Error ? err.message : String(err)}` };
  }
}
