/** ffmpeg and ffprobe, run as child processes with their errors kept. */
import { spawn } from "node:child_process";

export interface ProcResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function run(cmd: string, args: readonly string[], options: { timeoutMs?: number } = {}): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
    });
    const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs) : null;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function ffmpeg(args: readonly string[], timeoutMs = 15 * 60_000): Promise<ProcResult> {
  const result = await run(process.env.STUDIO_FFMPEG || "ffmpeg", ["-hide_banner", "-y", ...args], { timeoutMs });
  if (result.code !== 0) throw new Error(`ffmpeg failed (${result.code}): ${result.stderr.split("\n").slice(-12).join("\n")}`);
  return result;
}

export interface Probe {
  readonly duration: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly hasAudio: boolean;
  readonly hasVideo: boolean;
  readonly size: number;
}

export async function probe(file: string): Promise<Probe> {
  const result = await run(process.env.STUDIO_FFPROBE || "ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  if (result.code !== 0) throw new Error(`ffprobe can't read ${file}: ${result.stderr.slice(-400)}`);
  const data = JSON.parse(result.stdout) as { format?: { duration?: string; size?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
  const video = data.streams?.find((s) => s.codec_type === "video");
  return {
    duration: Number(data.format?.duration ?? 0),
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: !!data.streams?.some((s) => s.codec_type === "audio"),
    hasVideo: !!video,
    size: Number(data.format?.size ?? 0),
  };
}

/** Integrated loudness (LUFS) of a file's audio, measured by ffmpeg's EBU R128 filter. */
export async function loudness(file: string): Promise<number | null> {
  const result = await run(process.env.STUDIO_FFMPEG || "ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]);
  const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/.exec(result.stderr);
  if (!m || m[1] === "-inf") return null;
  return Number(m[1]);
}
