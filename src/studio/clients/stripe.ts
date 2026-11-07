/**
 * Stripe, read only: the day's Checkout Sessions (the site's payment links make one per order), with
 * the order reference the site sets as `client_reference_id`. Orders count in total: the reference
 * doesn't carry the post's `src` tag, since the site keeps no trace of where a visit came from. A
 * restricted key with "Checkout Sessions: read" is all it needs.
 */
import type { OrderRow } from "../store/rows";

interface StripeSession {
  readonly id: string;
  readonly created: number;
  readonly amount_total: number | null;
  readonly currency: string | null;
  readonly client_reference_id: string | null;
  readonly status: string | null;
  readonly payment_status?: string | null;
  readonly line_items?: { data?: { description?: string | null; price?: { product?: string | null } | null }[] };
}

export async function checkoutSessions(key: string, from: Date, to: Date, fetchImpl: typeof fetch = fetch): Promise<Omit<OrderRow, "fetched_at">[]> {
  const out: Omit<OrderRow, "fetched_at">[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: "100", "created[gte]": String(Math.floor(from.getTime() / 1000)), "created[lt]": String(Math.floor(to.getTime() / 1000)) });
    params.append("expand[]", "data.line_items");
    if (after) params.set("starting_after", after);
    const res = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions?${params.toString()}`, { headers: { Authorization: `Bearer ${key}` } });
    const body = (await res.json()) as { data?: StripeSession[]; has_more?: boolean; error?: { message?: string } };
    if (!res.ok) throw new Error(`Stripe answered ${res.status}: ${body.error?.message ?? "no reason given"}`);
    for (const s of body.data ?? []) {
      out.push({
        session_id: s.id,
        created: new Date(s.created * 1000).toISOString(),
        amount: s.amount_total ?? 0,
        currency: s.currency,
        client_reference_id: s.client_reference_id,
        product: s.line_items?.data?.[0]?.description ?? null,
        status: s.payment_status === "paid" ? "paid" : s.status,
      });
    }
    const last = body.data?.[body.data.length - 1];
    if (!body.has_more || !last) break;
    after = last.id;
  }
  return out;
}
