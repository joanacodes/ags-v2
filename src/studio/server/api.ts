/**
 * Every Studio route goes through `route`: the owner is checked first, the context is built, errors
 * come back as JSON with a status the screen can show. Bodies are parsed with zod, so a malformed
 * request is refused before it reaches the store.
 */
import { z } from "zod/v4";
import type { AgentContext } from "@/studio/agents/context";
import { ActionError } from "@/studio/views/actions";
import { contextFromEnv } from "./context";
import { requireOwner } from "./owner";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RouteArgs<P> {
  readonly req: Request;
  readonly params: P;
  readonly ctx: AgentContext;
  readonly ownerId: string;
  readonly url: URL;
}

export function route<P = Record<string, string>>(handler: (args: RouteArgs<P>) => Promise<unknown>) {
  return async (req: Request, context: { params: P }): Promise<Response> => {
    const owner = await requireOwner();
    if (owner instanceof Response) return owner;
    try {
      const ctx = await contextFromEnv("interactive");
      const out = await handler({ req, params: context.params, ctx, ownerId: owner.id, url: new URL(req.url) });
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true }, { headers: { "cache-control": "no-store" } });
    } catch (err) {
      if (err instanceof HttpError || err instanceof ActionError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof z.ZodError) return Response.json({ error: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
      console.error("[studio] route failed", err);
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "the body isn't JSON");
  }
  return schema.parse(raw);
}

export const ids = z.array(z.string().min(1).max(64)).min(1).max(1000);
