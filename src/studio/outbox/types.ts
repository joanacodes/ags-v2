/** What every platform client offers the publish worker, the metrics worker and the community agent. */
import type { CardRow, MediaRow, PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import type { Platform } from "../types";
import type { Http, RecordedRequest } from "./http";

export interface Token {
  readonly access_token: string;
  readonly refresh_token?: string | null;
  /** ISO time the access token stops working; null for tokens that don't expire. */
  readonly expires_at?: string | null;
  readonly scopes?: readonly string[];
  /** Whatever the platform needs besides the token: account ids, the page's token, the instance. */
  readonly account: Record<string, string>;
}

export interface PublishInput {
  readonly post: PostRow;
  readonly card: CardRow;
  readonly media: readonly MediaRow[];
  /** A URL the platform can fetch the file from (a signed Storage URL, 7 days). */
  signedUrl(path: string): Promise<string>;
  /** The file itself, for platforms that take an upload. */
  download(path: string): Promise<Uint8Array>;
}

export interface Published {
  readonly id: string;
  readonly url: string | null;
  readonly state?: Record<string, unknown>;
}

export interface Numbers {
  readonly views: number | null;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly shares: number | null;
  readonly saves: number | null;
  readonly link_taps: number | null;
}

export interface PlatformClient {
  readonly platform: Platform;
  /** Post one piece. Every write goes through `http`, which stops it in a dry run. */
  publish(input: PublishInput): Promise<Published>;
  /** New comments and mentions since a moment, mapped to our pieces by their platform ids. */
  comments?(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]>;
  /** Send the owner's approved reply. */
  reply?(reply: ReplyRow, text: string): Promise<{ ref: string }>;
  /** A piece's numbers so far (running totals). */
  numbers?(post: PostRow): Promise<Numbers | null>;
}

export interface ClientDeps {
  readonly http: Http;
  readonly token: Token;
  /** Persist a refreshed token (the vault). */
  saveToken(token: Token): Promise<void>;
}

export type DryRunRecord = readonly RecordedRequest[];

/** The connection each platform posts through (Instagram and Facebook share Meta's). */
export const CONNECTION_OF: Readonly<Partial<Record<Platform, string>>> = {
  instagram: "meta",
  facebook: "meta",
  threads: "threads",
  youtube: "youtube",
  pinterest: "pinterest",
  bluesky: "bluesky",
  mastodon: "mastodon",
  x: "x",
  tiktok: "tiktok",
};

export const CONNECTIONS = ["meta", "threads", "youtube", "pinterest", "bluesky", "mastodon", "x", "tiktok"] as const;
export type ConnectionKey = (typeof CONNECTIONS)[number];

export const CONNECTION_LABELS: Readonly<Record<ConnectionKey, string>> = {
  meta: "Instagram and Facebook (Meta)",
  threads: "Threads",
  youtube: "YouTube",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  x: "X",
  tiktok: "TikTok",
};

export function mediaOf(media: readonly MediaRow[], kind: MediaRow["kind"]): MediaRow[] {
  return media.filter((m) => m.kind === kind).sort((a, b) => a.path.localeCompare(b.path));
}
