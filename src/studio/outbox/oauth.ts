/**
 * Connecting an account, per network: the address the owner is sent to, and the exchange of the code
 * it sends back for a long-lived token with the account's ids. Bluesky and Mastodon have no OAuth here:
 * an app password and a personal token are pasted into a form, checked, and stored the same way.
 * The redirect address of every app is `{the Studio's address}/api/studio/oauth/{key}/callback`: AGS's
 * own address (STUDIO_BASE_URL when set, else the address the Studio was opened at).
 */
import { createHash, randomBytes } from "node:crypto";
import type { Http } from "./http";
import { graphVersion } from "./meta";
import type { ConnectionKey, Token } from "./types";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function newState(): string {
  return b64url(randomBytes(24));
}

/** PKCE: the verifier stays on our side (an httpOnly cookie); the challenge goes in the address. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

const env = (name: string) => (process.env[name] ?? "").trim();
const qs = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`)
    .join("&");
const expiresAt = (seconds: number | undefined) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null);

export interface OAuthProvider {
  readonly key: ConnectionKey;
  /** The environment variables the app's credentials come from. */
  readonly env: readonly string[];
  readonly scopes: readonly string[];
  readonly pkce: boolean;
  authorizeUrl(p: { redirectUri: string; state: string; challenge: string }): string;
  exchange(p: { code: string; redirectUri: string; verifier: string; http: Http }): Promise<{ token: Token; label: string }>;
}

const meta: OAuthProvider = {
  key: "meta",
  env: ["META_APP_ID", "META_APP_SECRET"],
  scopes: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_engagement",
    "pages_read_user_content",
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
    "business_management",
  ],
  pkce: false,
  authorizeUrl({ redirectUri, state }) {
    // A Business app logs in through a configuration (META_LOGIN_CONFIG_ID) that holds the permissions;
    // a classic app asks for them by name.
    const config = env("META_LOGIN_CONFIG_ID");
    return `https://www.facebook.com/${graphVersion()}/dialog/oauth?${qs({ client_id: env("META_APP_ID"), redirect_uri: redirectUri, state, response_type: "code", ...(config ? { config_id: config } : { scope: this.scopes.join(",") }) })}`;
  },
  async exchange({ code, redirectUri, http }) {
    const base = `https://graph.facebook.com/${graphVersion()}`;
    const short = await http.get<{ access_token: string }>(`${base}/oauth/access_token?${qs({ client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"), redirect_uri: redirectUri, code })}`);
    const long = await http.get<{ access_token: string; expires_in?: number }>(`${base}/oauth/access_token?${qs({ grant_type: "fb_exchange_token", client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"), fb_exchange_token: short.access_token })}`);
    const pages = await http.get<{ data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
      `${base}/me/accounts?${qs({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: long.access_token })}`,
    );
    const wanted = env("META_PAGE_ID");
    const list = pages.data ?? [];
    const page = list.find((p) => p.id === wanted) ?? list.find((p) => p.instagram_business_account) ?? list[0];
    if (!page) throw new Error("this Facebook account manages no Page: the Studio posts as a Page");
    const ig = page.instagram_business_account;
    // A Page token made from a long-lived user token doesn't expire; it is what every call uses.
    const token: Token = {
      access_token: long.access_token,
      expires_at: null,
      scopes: this.scopes,
      account: { page_id: page.id, page_name: page.name, page_token: page.access_token, ...(ig ? { ig_user_id: ig.id, ig_username: ig.username ?? "" } : {}), user_token_expires_at: expiresAt(long.expires_in) ?? "" },
    };
    return { token, label: ig?.username ? `${page.name} · @${ig.username}` : `${page.name} (no Instagram account linked)` };
  },
};

const threads: OAuthProvider = {
  key: "threads",
  env: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
  scopes: ["threads_basic", "threads_content_publish", "threads_manage_replies", "threads_read_replies", "threads_manage_insights"],
  pkce: false,
  authorizeUrl({ redirectUri, state }) {
    return `https://threads.net/oauth/authorize?${qs({ client_id: env("THREADS_APP_ID"), redirect_uri: redirectUri, scope: this.scopes.join(","), response_type: "code", state })}`;
  },
  async exchange({ code, redirectUri, http }) {
    const short = await http.signIn<{ access_token: string; user_id: string | number }>("https://graph.threads.net/oauth/access_token", {
      form: { client_id: env("THREADS_APP_ID"), client_secret: env("THREADS_APP_SECRET"), grant_type: "authorization_code", redirect_uri: redirectUri, code },
    });
    const long = await http.get<{ access_token: string; expires_in?: number }>(`https://graph.threads.net/access_token?${qs({ grant_type: "th_exchange_token", client_secret: env("THREADS_APP_SECRET"), access_token: short.access_token })}`);
    const me = await http.get<{ id: string; username?: string }>(`https://graph.threads.net/v1.0/me?${qs({ fields: "id,username", access_token: long.access_token })}`);
    const token: Token = { access_token: long.access_token, expires_at: expiresAt(long.expires_in ?? 60 * 86400), scopes: this.scopes, account: { user_id: me.id, username: me.username ?? "" } };
    return { token, label: me.username ? `@${me.username}` : me.id };
  },
};

const youtube: OAuthProvider = {
  key: "youtube",
  env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"],
  pkce: true,
  authorizeUrl({ redirectUri, state, challenge }) {
    return `https://accounts.google.com/o/oauth2/v2/auth?${qs({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: this.scopes.join(" "),
      // Offline and consent, or Google sends no refresh token and the connection dies in an hour.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`;
  },
  async exchange({ code, redirectUri, verifier, http }) {
    const t = await http.signIn<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>("https://oauth2.googleapis.com/token", {
      form: { code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier },
    });
    if (!t.refresh_token) throw new Error("Google sent no refresh token: remove the Studio's access at myaccount.google.com/permissions and connect again");
    const ch = await http.get<{ items?: { id: string; snippet?: { title?: string; customUrl?: string } }[] }>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { Authorization: `Bearer ${t.access_token}` });
    const channel = ch.items?.[0];
    if (!channel) throw new Error("this Google account has no YouTube channel");
    const token: Token = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiresAt(t.expires_in), scopes: t.scope?.split(" ") ?? this.scopes, account: { channel_id: channel.id, username: channel.snippet?.customUrl ?? channel.snippet?.title ?? "" } };
    return { token, label: channel.snippet?.title ?? channel.id };
  },
};

const pinterest: OAuthProvider = {
  key: "pinterest",
  env: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
  scopes: ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"],
  pkce: false,
  authorizeUrl({ redirectUri, state }) {
    return `https://www.pinterest.com/oauth/?${qs({ client_id: env("PINTEREST_APP_ID"), redirect_uri: redirectUri, response_type: "code", scope: this.scopes.join(","), state })}`;
  },
  async exchange({ code, redirectUri, http }) {
    const basic = Buffer.from(`${env("PINTEREST_APP_ID")}:${env("PINTEREST_APP_SECRET")}`).toString("base64");
    const t = await http.signIn<{ access_token: string; refresh_token?: string; expires_in: number; refresh_token_expires_in?: number; scope?: string }>("https://api.pinterest.com/v5/oauth/token", {
      headers: { Authorization: `Basic ${basic}` },
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, continuous_refresh: "true" },
    });
    const me = await http.get<{ username?: string }>("https://api.pinterest.com/v5/user_account", { Authorization: `Bearer ${t.access_token}` });
    const token: Token = {
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      expires_at: expiresAt(t.expires_in),
      scopes: t.scope?.split(",") ?? this.scopes,
      account: { username: me.username ?? "", ...(t.refresh_token_expires_in ? { refresh_expires_at: expiresAt(t.refresh_token_expires_in) ?? "" } : {}) },
    };
    return { token, label: me.username ? `@${me.username}` : "Pinterest" };
  },
};

const x: OAuthProvider = {
  key: "x",
  env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
  pkce: true,
  authorizeUrl({ redirectUri, state, challenge }) {
    return `https://x.com/i/oauth2/authorize?${qs({ response_type: "code", client_id: env("X_CLIENT_ID"), redirect_uri: redirectUri, scope: this.scopes.join(" "), state, code_challenge: challenge, code_challenge_method: "S256" })}`;
  },
  async exchange({ code, redirectUri, verifier, http }) {
    const secret = env("X_CLIENT_SECRET");
    const t = await http.signIn<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>("https://api.x.com/2/oauth2/token", {
      headers: secret ? { Authorization: `Basic ${Buffer.from(`${env("X_CLIENT_ID")}:${secret}`).toString("base64")}` } : {},
      form: { code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier, client_id: env("X_CLIENT_ID") },
    });
    const me = await http.get<{ data?: { id: string; username: string } }>("https://api.x.com/2/users/me", { Authorization: `Bearer ${t.access_token}` });
    if (!me.data) throw new Error("X didn't say which account this is");
    const token: Token = { access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_at: expiresAt(t.expires_in), scopes: t.scope?.split(" ") ?? this.scopes, account: { user_id: me.data.id, username: me.data.username } };
    return { token, label: `@${me.data.username}` };
  },
};

const tiktok: OAuthProvider = {
  key: "tiktok",
  env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  scopes: ["user.info.basic", "user.info.profile", "video.upload", "video.publish", "video.list"],
  pkce: false,
  authorizeUrl({ redirectUri, state }) {
    return `https://www.tiktok.com/v2/auth/authorize/?${qs({ client_key: env("TIKTOK_CLIENT_KEY"), scope: this.scopes.join(","), response_type: "code", redirect_uri: redirectUri, state })}`;
  },
  async exchange({ code, redirectUri, http }) {
    const t = await http.signIn<{ access_token: string; refresh_token?: string; expires_in: number; refresh_expires_in?: number; open_id: string; scope?: string }>("https://open.tiktokapis.com/v2/oauth/token/", {
      form: { client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri: redirectUri },
    });
    const me = await http
      .get<{ data?: { user?: { username?: string; display_name?: string } } }>("https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name", { Authorization: `Bearer ${t.access_token}` })
      .catch(() => ({ data: undefined }));
    const user = me.data?.user;
    const token: Token = {
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      expires_at: expiresAt(t.expires_in),
      scopes: t.scope?.split(",") ?? this.scopes,
      account: { open_id: t.open_id, username: user?.username ?? "", ...(t.refresh_expires_in ? { refresh_expires_at: expiresAt(t.refresh_expires_in) ?? "" } : {}) },
    };
    return { token, label: user?.username ? `@${user.username}` : (user?.display_name ?? "TikTok") };
  },
};

export const OAUTH: Readonly<Partial<Record<ConnectionKey, OAuthProvider>>> = { meta, threads, youtube, pinterest, x, tiktok };

/** The keys whose app credentials are missing from the environment, so Settings can say what to add. */
export function missingEnv(key: ConnectionKey): string[] {
  const p = OAUTH[key];
  return p ? p.env.filter((name) => !env(name)) : [];
}

/** Bluesky: a handle and an app password, checked by opening a session. */
export async function connectBluesky(http: Http, form: { handle: string; password: string; service?: string }): Promise<{ token: Token; label: string }> {
  const service = (form.service || "https://bsky.social").replace(/\/$/, "");
  const handle = form.handle.trim().replace(/^@/, "");
  const s = await http.signIn<{ did: string; handle: string }>(`${service}/xrpc/com.atproto.server.createSession`, { json: { identifier: handle, password: form.password.trim() } });
  return { token: { access_token: form.password.trim(), expires_at: null, scopes: ["app-password"], account: { handle: s.handle, did: s.did, service } }, label: `@${s.handle}` };
}

/** Mastodon: the instance and a personal token, checked by asking who it belongs to. */
export async function connectMastodon(http: Http, form: { instance: string; token: string }): Promise<{ token: Token; label: string }> {
  const raw = form.instance.trim().replace(/\/$/, "");
  const instance = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  const me = await http.get<{ id: string; acct: string; username?: string }>(`${instance}/api/v1/accounts/verify_credentials`, { Authorization: `Bearer ${form.token.trim()}` });
  const host = new URL(instance).host;
  return { token: { access_token: form.token.trim(), expires_at: null, scopes: ["read", "write"], account: { instance, user_id: me.id, username: me.acct } }, label: `@${me.acct}@${host}` };
}
