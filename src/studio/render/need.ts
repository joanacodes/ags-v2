/** Which pieces need media, kept apart from the renderer so the outbox can ask without loading Chromium. */
import type { PostRow } from "../store/rows";

export const VIDEO_FORMATS: ReadonlySet<string> = new Set(["video", "long_video"]);
export const PICTURE_FORMATS: ReadonlySet<string> = new Set(["carousel", "pin", "story", "still"]);
/** Text pieces on these networks carry a still picture (a text post with a picture travels further there). */
export const STILL_PLATFORMS: ReadonlySet<string> = new Set(["facebook", "x", "bluesky", "mastodon"]);

export function mediaNeed(post: Pick<PostRow, "format" | "platform">): "video" | "picture" | null {
  if (VIDEO_FORMATS.has(post.format)) return "video";
  if (PICTURE_FORMATS.has(post.format)) return "picture";
  if (post.format === "text" && STILL_PLATFORMS.has(post.platform)) return "picture";
  return null;
}
