/**
 * GitHub Actions as the Studio's engine room: the tick dispatches a workflow for each worker that is
 * due (workflow_dispatch only, so nothing runs on GitHub's own clock), the kill switch disables the
 * workflows and cancels what is running, and the Map reads the recent runs.
 */
import type { WorkerId } from "../nodes";

export interface GitHubEnv {
  readonly token: string;
  readonly repo: string;
  readonly ref: string;
}

/** Two workflows: the render needs Chromium and ffmpeg; everything else needs only Node. */
export const WORKFLOWS = ["studio-run.yml", "studio-render.yml"] as const;
export const workflowOf = (worker: WorkerId) => (worker === "render" ? "studio-render.yml" : "studio-run.yml");

export function githubFromEnv(ref = "main"): GitHubEnv | null {
  const token = (process.env.GITHUB_STUDIO_TOKEN ?? "").trim();
  if (!token) return null;
  return { token, repo: (process.env.STUDIO_GITHUB_REPO ?? "joanacodes/ags-v2").trim(), ref };
}

const headers = (env: GitHubEnv) => ({ Authorization: `Bearer ${env.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "the-astro-study-studio" });

async function call(env: GitHubEnv, method: string, path: string, body: unknown, fetchImpl: typeof fetch): Promise<Response> {
  const res = await fetchImpl(`https://api.github.com/repos/${env.repo}${path}`, { method, headers: { ...headers(env), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok && res.status !== 204) throw new Error(`GitHub answered ${res.status} to ${method} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function dispatchWorker(env: GitHubEnv, worker: WorkerId, inputs: { postIds?: readonly string[]; trigger?: string } = {}, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(env, "POST", `/actions/workflows/${workflowOf(worker)}/dispatches`, { ref: env.ref, inputs: { worker, post_ids: (inputs.postIds ?? []).join(","), trigger: inputs.trigger ?? "dispatch" } }, fetchImpl);
}

export async function setWorkflowsEnabled(env: GitHubEnv, enabled: boolean, fetchImpl: typeof fetch = fetch): Promise<void> {
  for (const file of WORKFLOWS) await call(env, "PUT", `/actions/workflows/${file}/${enabled ? "enable" : "disable"}`, null, fetchImpl);
}

export interface ActionRun {
  readonly id: number;
  readonly workflow: string;
  readonly title: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly created_at: string;
  readonly url: string;
}

export async function recentRuns(env: GitHubEnv, perPage = 20, fetchImpl: typeof fetch = fetch): Promise<ActionRun[]> {
  const res = await call(env, "GET", `/actions/runs?per_page=${perPage}&event=workflow_dispatch`, null, fetchImpl);
  const data = (await res.json()) as { workflow_runs?: { id: number; path?: string; display_title?: string; name?: string; status: string; conclusion: string | null; created_at: string; html_url: string }[] };
  return (data.workflow_runs ?? [])
    .filter((r) => WORKFLOWS.some((w) => (r.path ?? "").endsWith(w)))
    .map((r) => ({ id: r.id, workflow: (r.path ?? "").split("/").pop() ?? "", title: r.display_title ?? r.name ?? "", status: r.status, conclusion: r.conclusion, created_at: r.created_at, url: r.html_url }));
}

/** The kill switch: everything queued or running is cancelled. */
export async function cancelRunning(env: GitHubEnv, fetchImpl: typeof fetch = fetch): Promise<number> {
  let n = 0;
  for (const status of ["in_progress", "queued"]) {
    const res = await call(env, "GET", `/actions/runs?status=${status}&per_page=50`, null, fetchImpl);
    const data = (await res.json()) as { workflow_runs?: { id: number; path?: string }[] };
    for (const r of data.workflow_runs ?? []) {
      if (!WORKFLOWS.some((w) => (r.path ?? "").endsWith(w))) continue;
      await call(env, "POST", `/actions/runs/${r.id}/cancel`, null, fetchImpl).catch(() => undefined);
      n += 1;
    }
  }
  return n;
}
