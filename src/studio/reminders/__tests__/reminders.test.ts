/** Reminders: quiet hours, repeats across the clock change, email, the computed kinds, the calendar feed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import type { AgentContext } from "../../agents/context";
import type { EmailMessage } from "../../clients/resend";
import { deliverReminders, isQuiet, nextOccurrence } from "../deliver";
import { computeReminders } from "../computed";
import { parseIcs, remindersIcs } from "../ics";

function ctx(store: MemoryStore, now: Date, stored: Record<string, Record<string, unknown>> = {}): AgentContext {
  return { store, storage: new MemoryStorage(), transport: null, kit: defaultKit(), kitVersion: 1, settings: new StudioSettings({ reminders: { email: "owner@example.com" }, ...stored }), now, trigger: "tick", ownerId: "owner", dryRun: true };
}

test("quiet hours run over midnight", () => {
  assert.equal(isQuiet(new Date("2026-11-12T22:30:00Z"), "22:00", "07:00"), true, "23:30 Paris");
  assert.equal(isQuiet(new Date("2026-11-12T05:59:00Z"), "22:00", "07:00"), true, "06:59 Paris");
  assert.equal(isQuiet(new Date("2026-11-12T06:00:00Z"), "22:00", "07:00"), false, "07:00 Paris");
  assert.equal(isQuiet(new Date("2026-11-12T20:59:00Z"), "22:00", "07:00"), false, "21:59 Paris");
});

test("a daily 09:00 stays at 09:00 Paris across the clocks going back", () => {
  const next = nextOccurrence({ due_at: "2026-10-24T07:00:00.000Z", repeat: "daily" });
  assert.equal(next?.toISOString(), "2026-10-25T08:00:00.000Z");
  assert.equal(nextOccurrence({ due_at: "2026-11-13T08:00:00.000Z", repeat: "weekdays" })?.toISOString(), "2026-11-16T08:00:00.000Z", "Friday → Monday");
  assert.equal(nextOccurrence({ due_at: "2027-01-31T08:00:00.000Z", repeat: "monthly" })?.toISOString(), "2027-02-28T08:00:00.000Z", "the 31st → the last day of February");
  assert.equal(nextOccurrence({ due_at: "2026-11-13T08:00:00.000Z", repeat: "none" }), null);
});

test("delivery: email to the owner, sent once, the next one made, the night respected", async () => {
  const store = new MemoryStore();
  const mails: EmailMessage[] = [];
  const send = async (m: EmailMessage) => void mails.push(m);
  await store.insertReminder({ kind: "custom", title: "Record the voice", body: "Ten minutes", due_at: "2026-11-12T08:00:00.000Z", repeat: "daily", channels: ["in_app", "email"], dedupe_key: "c1" });
  await store.insertReminder({ kind: "agent", title: "Night thing", due_at: "2026-11-12T21:30:00.000Z", channels: ["in_app", "email"] });
  await store.insertReminder({ kind: "cap-near", title: "Cap", due_at: "2026-11-12T21:30:00.000Z", urgent: true, channels: ["in_app", "email"] });

  const morning = await deliverReminders(ctx(store, new Date("2026-11-12T08:05:00Z")), send);
  assert.equal(morning.sent, 1);
  assert.equal(mails[0]?.to, "owner@example.com");
  assert.equal(mails[0]?.subject, "Record the voice");
  const again = await deliverReminders(ctx(store, new Date("2026-11-12T08:20:00Z")), send);
  assert.equal(again.sent, 0, "never twice");
  const next = (await store.reminders({ statuses: ["scheduled"] })).find((r) => r.title === "Record the voice");
  assert.equal(next?.due_at, "2026-11-13T08:00:00.000Z");

  const night = await deliverReminders(ctx(store, new Date("2026-11-12T22:00:00Z")), send);
  assert.equal(night.deferred, 1, "the agent's waits for the morning");
  assert.equal(night.sent, 1, "the cap is urgent");
});

/** The memory store dates runs with the machine's clock; this week's spend is given directly instead. */
class SpendStore extends MemoryStore {
  override async spendSince(): Promise<number> {
    return 8.5;
  }
}

test("computed: Sunday's approval, the evening replies, a token's expiry, the cap, the calendar", async () => {
  const store = new SpendStore();
  const sunday = new Date("2026-11-15T18:05:00Z");
  await store.insertCards([{ week: "2026-W47", pillar: "test", language: "en", idea: "i", hook: "h", points: [], figures: [], cta: "test", formats: ["text"] }], "strategist");
  const [r] = await store.insertReplies([{ platform: "instagram", thread_ref: "c1", their_text: "hi", received_at: sunday.toISOString() }]);
  await store.updateReply(r!.id, { draft_reply: "Hello!", klass: "praise" }, "community");
  await store.upsertConnection({ platform: "threads", status: "connected", account_label: "@a", account_ref: "1", scopes: [], expires_at: "2026-11-20T00:00:00.000Z", vault_secret_id: null, meta: {} });
  await store.upsertCalendar([{ date: "2026-11-17", event: "A call", note: "Prepare", source: "owner", remind: true }]);

  const made = await computeReminders(ctx(store, sunday));
  const kinds = (await store.reminders({})).map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["approve-week", "calendar-event", "cap-near", "connection-expiring", "replies-due"]);
  assert.equal(made, 5);
  assert.equal(await computeReminders(ctx(store, new Date(sunday.getTime() + 15 * 60_000))), 0, "each occasion once");
  const at21 = await computeReminders(ctx(store, new Date("2026-11-15T20:01:00Z")));
  assert.equal(at21, 1, "21:00: the week is still waiting");
});

test("the calendar feed is valid and reads back", () => {
  const now = new Date("2026-11-12T08:00:00Z");
  const row = {
    id: "r1", kind: "custom" as const, title: "Call, with notes; and a \\ slash", body: "Line one\nLine two — and a long line that goes on and on to make the folding happen at seventy-five octets",
    due_at: "2026-11-13T09:00:00.000Z", timezone: "Europe/Paris", repeat: "none" as const, channels: ["in_app"], urgent: false, linked_table: null, linked_id: null,
    link: "/studio/today", created_by: "owner", status: "scheduled" as const, snoozed_until: null, sent_at: null, dedupe_key: null, updated_by: "owner", created_at: "", updated_at: "",
  };
  const ics = remindersIcs([row], "https://studio.example.com", now);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("SUMMARY:Call\\, with notes\; and a \\\\ slash"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `too long: ${line}`);
  assert.ok(ics.includes("DTSTART:20261113T090000Z"));
  const back = parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261127\r\nSUMMARY:Black Friday\\, the offer\r\nDESCRIPTION:Email at 08:00\r\nEND:VEVENT\r\nEND:VCALENDAR");
  assert.deepEqual(back, [{ date: "2026-11-27", event: "Black Friday, the offer", note: "Email at 08:00" }]);
});
