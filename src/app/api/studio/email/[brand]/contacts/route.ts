import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { addContact, brandOf, exportContacts, importContacts, listContacts } from "@/studio/email/views";

export const dynamic = "force-dynamic";

/** A page of the brand's contacts (?status=, ?q=, ?offset=), or all of them as CSV (?format=csv). */
export const GET = route<{ brand: string }>(async ({ ctx, params, url }) => {
  const brand = brandOf(params.brand);
  const p = url.searchParams;
  if (p.get("format") === "csv") {
    return new Response(await exportContacts(ctx, brand), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${brand}-contacts.csv"`, "cache-control": "no-store" },
    });
  }
  return listContacts(ctx, brand, { status: p.get("status"), q: p.get("q"), offset: Number(p.get("offset") ?? 0) || 0 });
});

export const POST = route<{ brand: string }>(async ({ req, ctx, params }) => {
  const brand = brandOf(params.brand);
  const input = await body(req, z.object({ action: z.enum(["add", "import"]), contact: z.unknown() }));
  return input.action === "add" ? addContact(ctx, brand, input.contact) : importContacts(ctx, brand, input.contact);
});
