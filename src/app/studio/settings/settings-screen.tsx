"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ConnectionsSection, KitSection, ModelsSection } from "./sections-a";
import { KeysSection } from "./keys-section";
import { AuditSection, ExportSection, KillSection, NotificationsSection, PromptsSection, RemindersSection, SchedulesSection, WeeklySection } from "./sections-b";

const SECTIONS = [
  { id: "kit", label: "Brand kit" },
  { id: "models", label: "Models" },
  { id: "connections", label: "Connections" },
  { id: "keys", label: "Keys" },
  { id: "schedules", label: "Schedules and slots" },
  { id: "prompts", label: "Prompts" },
  { id: "reminders", label: "Reminders" },
  { id: "notifications", label: "Notifications" },
  { id: "weekly", label: "Friday's numbers" },
  { id: "kill", label: "Kill switch" },
  { id: "audit", label: "Audit log" },
  { id: "export", label: "Export" },
] as const;

export function SettingsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const section = params.get("section") || "kit";
  const go = (id: string) => router.replace(`${pathname}?section=${id}`, { scroll: false });
  return (
    <div>
      <div className="mb-4">
        <p className="eyebrow">How the Studio runs</p>
        <h1 className="text-4xl">Settings</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="md:sticky md:top-20 md:self-start">
          <select className="field md:hidden" value={section} onChange={(e) => go(e.target.value)} aria-label="Section">
            {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <ul className="hidden space-y-0.5 md:block">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button onClick={() => go(s.id)} className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${s.id === section ? "bg-ink text-paper" : s.id === "kill" ? "text-rust hover:bg-rust-soft" : "text-ink-2 hover:bg-ink/5"}`}>{s.label}</button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          {section === "kit" && <KitSection />}
          {section === "models" && <ModelsSection />}
          {section === "connections" && <ConnectionsSection />}
          {section === "keys" && <KeysSection />}
          {section === "schedules" && <SchedulesSection />}
          {section === "prompts" && <PromptsSection agent={params.get("agent")} />}
          {section === "reminders" && <RemindersSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "weekly" && <WeeklySection />}
          {section === "kill" && <KillSection />}
          {section === "audit" && <AuditSection />}
          {section === "export" && <ExportSection />}
        </div>
      </div>
    </div>
  );
}
