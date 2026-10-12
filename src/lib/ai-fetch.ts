/**
 * fetch() for AI generation routes. When the chosen model declines
 * (422 AI_REFUSED), ask the astrologer before retrying with Anthropic's
 * substitute model; "Don't continue" stops with a clear error.
 */
import { confirmDialog } from "@/components/common/confirm-dialog";
import { ALLOW_FALLBACK_HEADER } from "@/interpretation/ai-models";

export async function aiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 422) return first;
  const body = (await first.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
  if (body?.error?.code !== "AI_REFUSED") return first;

  const ok = await confirmDialog({
    title: "The AI model declined this text",
    message:
      "The model chosen for this chart refused to write it. Its safety filter sometimes flags harmless astrology content by mistake.\n\n" +
      "Continue with a substitute model picked by Anthropic? The text may read slightly differently.",
    confirmLabel: "OK",
    cancelLabel: "Don't continue",
  });
  if (!ok) throw new Error("Generation stopped: the AI model declined and you chose not to continue.");

  const headers = new Headers(init.headers);
  headers.set(ALLOW_FALLBACK_HEADER, "1");
  return fetch(url, { ...init, headers });
}
