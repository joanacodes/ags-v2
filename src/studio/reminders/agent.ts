/**
 * Reminders an agent asks for (the build prompt's create_reminder tool). Five a day per agent at most:
 * past that, the agent is stopped from adding more and the run says so, because an agent that keeps
 * asking for the owner's attention is one that needs looking at.
 */
import type { StudioStore } from "../store/store";
import type { ReminderOut } from "../prompts/schemas";
import { fromParis, parisDate, weekStart } from "../time";

export const AGENT_REMINDERS_PER_DAY = 5;

/** "2026-11-16T09:00" in Paris time (or a full ISO instant) → an instant. Null when unreadable. */
export function parseParisDateTime(text: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?$/.exec(text.trim());
  if (!m) return null;
  if (m[3]) {
    const d = new Date(text.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return fromParis(m[1]!, m[2]!);
}

export async function createAgentReminders(
  store: StudioStore,
  agent: string,
  reminders: readonly ReminderOut[],
  now: Date,
  link?: { table: string; id: string },
): Promise<{ created: number; refused: string[] }> {
  const refused: string[] = [];
  if (reminders.length === 0) return { created: 0, refused };
  const today = parisDate(now);
  const already = (await store.reminders({ createdBy: agent, createdSince: weekStart(now).toISOString() })).filter((r) => parisDate(new Date(r.created_at)) === today).length;
  let created = 0;
  for (const r of reminders) {
    if (already + created >= AGENT_REMINDERS_PER_DAY) {
      refused.push(`${r.title}: ${agent} has already made ${AGENT_REMINDERS_PER_DAY} reminders today`);
      continue;
    }
    const due = parseParisDateTime(r.due_at) ?? now;
    const row = await store.insertReminder({
      kind: "agent",
      title: r.title,
      body: `${r.body}\n\nWhy: ${r.reason}`,
      due_at: (due.getTime() < now.getTime() ? now : due).toISOString(),
      channels: r.channels.length ? [...r.channels] : ["in_app"],
      created_by: agent,
      linked_table: link?.table ?? null,
      linked_id: link?.id ?? null,
    });
    if (row) created += 1;
  }
  return { created, refused };
}
