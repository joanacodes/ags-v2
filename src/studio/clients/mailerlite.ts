/**
 * MailerLite, read only: the open and click rates of the campaigns sent in a week (or, when none went
 * out, of the automations so far: the test's sequence). The opt-in itself is AGS's, not the Studio's.
 */
export interface EmailRates {
  readonly sent: number;
  readonly open_rate: number;
  readonly click_rate: number;
  readonly source: "campaigns" | "automations";
}

interface Stats {
  readonly sent?: number;
  readonly opens_count?: number;
  readonly unique_opens_count?: number;
  readonly clicks_count?: number;
  readonly unique_clicks_count?: number;
}

const API = "https://connect.mailerlite.com/api";

async function get<T>(key: string, path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`MailerLite answered ${res.status} for ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

function rates(stats: readonly Stats[], source: EmailRates["source"]): EmailRates | null {
  const sent = stats.reduce((n, s) => n + (s.sent ?? 0), 0);
  if (sent === 0) return null;
  const opens = stats.reduce((n, s) => n + (s.unique_opens_count ?? s.opens_count ?? 0), 0);
  const clicks = stats.reduce((n, s) => n + (s.unique_clicks_count ?? s.clicks_count ?? 0), 0);
  return { sent, open_rate: opens / sent, click_rate: clicks / sent, source };
}

export async function emailRates(key: string, from: Date, to: Date, fetchImpl: typeof fetch = fetch): Promise<EmailRates | null> {
  const campaigns = await get<{ data?: { finished_at?: string | null; scheduled_for?: string | null; stats?: Stats }[] }>(key, "/campaigns?filter[status]=sent&limit=50", fetchImpl);
  const inWeek = (campaigns.data ?? []).filter((c) => {
    const at = Date.parse(c.finished_at ?? c.scheduled_for ?? "");
    return at >= from.getTime() && at < to.getTime();
  });
  const fromCampaigns = rates(inWeek.map((c) => c.stats ?? {}), "campaigns");
  if (fromCampaigns) return fromCampaigns;
  const automations = await get<{ data?: { enabled?: boolean; stats?: Stats }[] }>(key, "/automations?filter[enabled]=true&limit=25", fetchImpl);
  return rates((automations.data ?? []).map((a) => a.stats ?? {}), "automations");
}
