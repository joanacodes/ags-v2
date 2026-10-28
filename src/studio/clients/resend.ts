/** Email through Resend, for reminders and the kill switch: one message to the owner, plain and short. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

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
