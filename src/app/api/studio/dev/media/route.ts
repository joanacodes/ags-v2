/** Local files for the local demo and dry runs (LocalMediaStorage). Answers nothing in production. */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".srt": "text/plain; charset=utf-8", ".json": "application/json" };

export async function GET(req: Request): Promise<Response> {
  const root = (process.env.STUDIO_LOCAL_DIR ?? "").trim();
  if (process.env.NODE_ENV === "production" || !root) return new Response("Not found", { status: 404 });
  const p = new URL(req.url).searchParams.get("path") ?? "";
  const full = path.resolve(root, p);
  if (!full.startsWith(path.resolve(root) + path.sep)) return new Response("Not found", { status: 404 });
  try {
    return new Response(await readFile(full), { headers: { "content-type": TYPES[path.extname(full)] ?? "application/octet-stream" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
