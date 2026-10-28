import { HttpError, route } from "@/studio/server/api";

export const dynamic = "force-dynamic";

/** A media file through a short-lived signed address: Storage is private, links never last. */
export const GET = route<{ id: string }>(async ({ ctx, params, url }) => {
  const m = (await ctx.store.media({ ids: [params.id], limit: 1 }))[0];
  if (!m) throw new HttpError(404, "no such file");
  const signed = await ctx.storage.signedUrl(m.path, 600);
  const download = url.searchParams.get("download") === "1";
  const target = download ? `${signed}${signed.includes("?") ? "&" : "?"}download=${encodeURIComponent(m.path.split("/").pop() ?? "file")}` : signed;
  return Response.redirect(target.startsWith("http") ? target : new URL(target, url.origin).toString(), 302);
});
