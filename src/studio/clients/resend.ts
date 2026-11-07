/** Email through Resend, for reminders and the kill switch: one message to the owner, plain and short. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

/** One email of a brand's own (TASK-0017): its sender, its HTML and text, a reply-to when set. */
export interface BrandEmail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly replyTo?: string | null;
}

export async function sendBrandEmail(key: string, message: BrandEmail, fetchImpl: typeof fetch = fetch): Promise<{ id: string | null }> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return { id: typeof data?.id === "string" ? data.id : null };
}

export function resendFromEnv(fetchImpl: typeof fetch = fetch): SendEmail | null {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.STUDIO_EMAIL_FROM ?? "").trim();
  if (!key || !from) return null;
  return async (m) => {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}
