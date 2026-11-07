/**
 * Media on the local disk, for a dry run on a laptop or a runner without Supabase Storage. Never used
 * in production: the context picks it only when STUDIO_LOCAL_DIR is set and Supabase isn't.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaStorage } from "../store/store";

export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly root: string, private readonly publicBase = "/api/studio/dev/media") {}

  private resolve(p: string): string {
    const full = path.resolve(this.root, p);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`path outside the media folder: ${p}`);
    return full;
  }
  async upload(p: string, bytes: Uint8Array) {
    const full = this.resolve(p);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }
  async download(p: string) {
    return new Uint8Array(await readFile(this.resolve(p)));
  }
  async signedUrl(p: string) {
    return `${this.publicBase}?path=${encodeURIComponent(p)}`;
  }
  async remove(paths: readonly string[]) {
    for (const p of paths) await rm(this.resolve(p), { force: true });
  }
  async list(prefix: string) {
    const dir = prefix.replace(/\/$/, "");
    try {
      const names = await readdir(this.resolve(dir), { withFileTypes: true });
      const out: { path: string; createdAt: string | null }[] = [];
      for (const n of names) {
        if (!n.isFile()) continue;
        const info = await stat(this.resolve(`${dir}/${n.name}`));
        out.push({ path: `${dir}/${n.name}`, createdAt: info.birthtime.toISOString() });
      }
      return out;
    } catch {
      return [];
    }
  }
  async exists(p: string) {
    try {
      await stat(this.resolve(p));
      return true;
    } catch {
      return false;
    }
  }
}
