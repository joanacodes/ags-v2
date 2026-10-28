/**
 * A pretend internet for the outbox tests: it answers each platform's endpoints with the shapes their
 * documentation gives, and records every request, so a test can prove which ones were made.
 */
export interface Call {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export function fakeNetwork(overrides: (call: Call) => Response | null = () => null): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // a form body stays a string
      }
    } else if (body instanceof Uint8Array) body = { bytes: body.byteLength };
    else if (body instanceof FormData) body = Object.fromEntries([...body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "(file)"]));
    const call: Call = { method, url, headers, body };
    calls.push(call);
    const custom = overrides(call);
    if (custom) return custom;
    const u = new URL(url);
    const p = u.pathname;
    // Sign-in and token endpoints
    if (p.endsWith("/com.atproto.server.createSession")) return json({ accessJwt: "jwt", refreshJwt: "r", did: "did:plc:astro", handle: "astrostudy.bsky.social" });
    if (/\/oauth2?\/token\/?$|\/token$/.test(p)) return json({ access_token: "fresh", refresh_token: "fresh-r", expires_in: 3600 });
    // Meta
    if (u.host === "graph.facebook.com") {
      if (method === "GET" && u.searchParams.get("fields") === "status_code,status") return json({ status_code: "FINISHED" });
      if (method === "GET" && u.searchParams.get("fields") === "permalink") return json({ permalink: "https://www.instagram.com/reel/abc/" });
      if (method === "POST" && p.endsWith("/media")) return json({ id: "container-1" });
      if (method === "POST" && p.endsWith("/media_publish")) return json({ id: "ig-media-1" });
      if (method === "POST" && p.endsWith("/feed")) return json({ id: "page_post-1" });
      if (method === "POST" && p.endsWith("/video_reels"))
        return u.searchParams.get("upload_phase") === "start" ? json({ video_id: "fb-reel-1", upload_url: "https://rupload.facebook.com/video-upload/v24.0/fb-reel-1" }) : json({ success: true });
      if (method === "POST" && p.endsWith("/replies")) return json({ id: "ig-reply-1" });
      return json({ data: [] });
    }
    // Threads
    if (u.host === "graph.threads.net") {
      if (method === "GET" && u.searchParams.get("fields") === "status,error_message") return json({ status: "FINISHED" });
      if (method === "GET" && u.searchParams.get("fields") === "permalink") return json({ permalink: "https://www.threads.net/@astrostudy/post/abc" });
      if (method === "POST" && p.endsWith("/threads")) return json({ id: "th-container-1" });
      if (method === "POST" && p.endsWith("/threads_publish")) return json({ id: "th-post-1" });
      return json({ data: [] });
    }
    // YouTube
    if (u.host === "www.googleapis.com") {
      if (method === "POST" && p.startsWith("/upload/youtube")) return new Response("", { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=xyz" } });
      if (method === "PUT") return json({ id: "yt-video-1" });
      if (method === "POST" && p.endsWith("/comments")) return json({ id: "yt-reply-1" });
      return json({ items: [] });
    }
    // Pinterest
    if (u.host === "api.pinterest.com") {
      if (method === "GET" && p === "/v5/boards") return json({ items: [{ id: "board-test", name: "The Astro Study test" }] });
      if (method === "POST" && p === "/v5/boards") return json({ id: "board-new" });
      if (method === "POST" && p === "/v5/pins") return json({ id: "pin-1" });
      return json({});
    }
    // Bluesky
    if (u.host === "bsky.social") {
      if (p.endsWith("/com.atproto.repo.uploadBlob")) return json({ blob: { $type: "blob", ref: { $link: "bafy" }, mimeType: "image/jpeg", size: 1024 } });
      if (p.endsWith("/com.atproto.repo.createRecord")) return json({ uri: "at://did:plc:astro/app.bsky.feed.post/3kabc", cid: "bafycid" });
      if (p.endsWith("/app.bsky.feed.getPosts")) return json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/3kreply", cid: "cid-reply", record: { reply: { root: { uri: "at://did:plc:astro/app.bsky.feed.post/3kabc", cid: "bafycid" } } }, likeCount: 4, repostCount: 1, replyCount: 2, quoteCount: 0 }] });
      if (p.endsWith("/app.bsky.notification.listNotifications")) return json({ notifications: [] });
      return json({});
    }
    // Mastodon
    if (u.host === "mastodon.social") {
      if (method === "POST" && p === "/api/v2/media") return json({ id: "media-1", url: "https://files.mastodon.social/media-1.jpg" });
      if (method === "POST" && p === "/api/v1/statuses") return json({ id: "status-1", url: "https://mastodon.social/@astrostudy/status-1" });
      if (p === "/api/v1/notifications") return json([]);
      return json({});
    }
    // X
    if (u.host === "api.x.com") {
      if (method === "POST" && p === "/2/media/upload") return json({ data: { id: "x-media-1" } });
      if (method === "POST" && p === "/2/tweets") return json({ data: { id: "x-post-1", text: "" } });
      return json({ data: [] });
    }
    // TikTok
    if (u.host === "open.tiktokapis.com") {
      if (p.endsWith("/creator_info/query/")) return json({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
      if (p.endsWith("/video/init/")) return json({ data: { publish_id: "tt-publish-1", upload_url: "https://open-upload.tiktokapis.com/upload/?id=1" }, error: { code: "ok" } });
      if (p.endsWith("/status/fetch/")) return json({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } });
      return json({ data: {}, error: { code: "ok" } });
    }
    if (u.host === "open-upload.tiktokapis.com") return json({});
    if (u.host === "rupload.facebook.com") return json({ success: true });
    return json({});
  };
  return { fetch: fake as typeof fetch, calls };
}
