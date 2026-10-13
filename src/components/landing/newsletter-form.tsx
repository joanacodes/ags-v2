"use client";

/**
 * "Keep me posted" sign-up while AGS is in private beta. Sent straight to
 * the inbox through FormSubmit: no account, nothing stored here. Asks for
 * explicit consent and says plainly what people will (and won't) receive.
 */
import { useId, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ENDPOINT = "https://formsubmit.co/ajax/hello@maisontarot.com";

type Status = "idle" | "sending" | "done" | "error";

export function NewsletterForm({
  source,
  withName = false,
  className,
}: {
  /** Where the sign-up happened, shown in the email ("Landing page"…). */
  source: string;
  /** Also ask for a first name. */
  withName?: boolean;
  className?: string;
}) {
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [firstName, setFirstName] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    // Bots fill the hidden field; people never see it.
    if (text("_honey") !== "") {
      setStatus("done");
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ...(withName ? { "First name": text("firstName") } : {}),
          email: text("email"),
          Consent: "Yes: accepts to receive news (important news and new tester spots only)",
          "Signed up from": source,
          _subject: `AGS beta: new subscriber (${source})`,
          _template: "table",
        }),
      });
      const result = (await response.json().catch(() => null)) as { success?: unknown } | null;
      const ok = response.ok && (result?.success === true || result?.success === "true");
      setStatus(ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div role="status" className={cn("flex items-start gap-3 text-left", className)}>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <Check size={14} />
        </span>
        <p className="text-sm leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Thank you{firstName.trim() !== "" ? `, ${firstName.trim()}` : ""}!</span>{" "}
          You&apos;re on the list. I&apos;ll only write for important news and when new tester spots open.
        </p>
      </div>
    );
  }

  const sending = status === "sending";
  return (
    <form onSubmit={submit} className={cn("space-y-3 text-left", className)} aria-busy={sending}>
      {withName && (
        <div>
          <Label htmlFor={`${id}-name`}>First name</Label>
          <Input
            id={`${id}-name`}
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={80}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
      )}
      <div className={cn(!withName && "flex gap-2")}>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-email`} className={withName ? undefined : "sr-only"}>
            Email
          </Label>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={200}
            placeholder={withName ? undefined : "you@example.com"}
          />
        </div>
        {/* Wide screens: the button sits next to the email. */}
        {!withName && <SubmitButton sending={sending} className="hidden h-10 sm:inline-flex" />}
      </div>
      <label htmlFor={`${id}-consent`} className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-secondary">
        <input
          id={`${id}-consent`}
          name="consent"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
        />
        <span>I accept to receive news.</span>
      </label>
      <p className="text-xs leading-relaxed text-ink-muted">
        No spam, promise: only important news and calls for new testers. Reply to any email to stop them.
      </p>
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input type="text" name="_honey" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <SubmitButton sending={sending} className={withName ? "w-full" : "w-full sm:hidden"} />
      {status === "error" && (
        <p role="alert" className="text-xs text-danger">
          That didn&apos;t go through. Please try again in a moment.
        </p>
      )}
    </form>
  );
}

function SubmitButton({ sending, className }: { sending: boolean; className?: string }) {
  return (
    <Button type="submit" variant="primary" size="lg" disabled={sending} className={className}>
      {sending && <Loader2 size={15} className="animate-spin" />}
      {sending ? "Sending…" : "Keep me posted"}
    </Button>
  );
}
