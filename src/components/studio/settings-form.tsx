"use client";
import { useMemo, useState } from "react";
import { Toggle } from "./ui";

/** Choices for the settings that take one of a few values; everything else is drawn from its type. */
const CHOICES: Record<string, readonly (string | null)[]> = {
  model: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
  effort: ["low", "medium", "high", "xhigh", "max"],
  scheduling_mode: ["confirm", "direct"],
  retry: ["none", "once"],
  mode: [null, "api", "by_hand", "inbox"],
  voice_model: ["eleven_multilingual_v2", "eleven_turbo_v2_5"],
  default_template: ["meadow-text", "test-three-cards", "placement-callout", "figure-card", "sky-this-week"],
  background: ["meadow-loop-tall"],
};
const HELP: Record<string, string> = {
  schedule: "Cron in Paris time: minute hour day month weekday",
  sky_schedule: "Cron in Paris time",
  slots: "Times of day, Paris, separated by commas (e.g. 09:00, 13:00)",
  weekly_cap_usd: "Dollars a week, for every model use together",
  paused: "The kill switch's state: use Settings → Kill switch",
};
const LABEL = (k: string) => k.replace(/_/g, " ").replace(/\busd\b/, "($)").replace(/^./, (c) => c.toUpperCase());

type Value = unknown;

function Field({ name, value, onChange, path }: { name: string; value: Value; onChange: (v: Value) => void; path: string }) {
  const choices = CHOICES[name];
  if (choices) {
    return (
      <label className="block py-1 text-sm">
        <span className="label">{LABEL(name)}</span>
        <select className="field" value={value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
          {choices.map((c) => (
            <option key={String(c)} value={c ?? ""}>
              {c ?? "the platform's default"}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (typeof value === "boolean") return <Toggle label={LABEL(name)} checked={value} onChange={onChange} />;
  if (typeof value === "number")
    return (
      <label className="block py-1 text-sm">
        <span className="label">{LABEL(name)}</span>
        <input className="field" type="number" step="any" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      </label>
    );
  if (Array.isArray(value) || (value === null && (name === "slots" || name === "platforms")))
    return (
      <label className="block py-1 text-sm">
        <span className="label">{LABEL(name)}</span>
        <input className="field" value={(value as unknown[] | null)?.join(", ") ?? ""} placeholder="(default)" onChange={(e) => onChange(e.target.value.trim() === "" ? null : e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
        {HELP[name] && <span className="mt-1 block text-xs text-ink-3">{HELP[name]}</span>}
      </label>
    );
  if (value && typeof value === "object")
    return (
      <fieldset className="my-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-[.12em] text-ink-2">{LABEL(name)}</legend>
        {Object.entries(value as Record<string, Value>).map(([k, v]) => (
          <Field key={k} name={k} path={`${path}.${k}`} value={v} onChange={(nv) => onChange({ ...(value as Record<string, Value>), [k]: nv })} />
        ))}
      </fieldset>
    );
  return (
    <label className="block py-1 text-sm">
      <span className="label">{LABEL(name)}</span>
      <input className="field" value={value === null || value === undefined ? "" : String(value)} placeholder="(none)" onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
      {HELP[name] && <span className="mt-1 block text-xs text-ink-3">{HELP[name]}</span>}
    </label>
  );
}

/** A node's settings as a form; only what the owner changed is sent, and the server validates the whole. */
export function SettingsForm({ values, onSave, busy, hide = [] }: { values: Record<string, Value>; onSave: (changed: Record<string, Value>) => void; busy?: boolean; hide?: readonly string[] }) {
  const [draft, setDraft] = useState<Record<string, Value>>(values);
  const changed = useMemo(() => Object.fromEntries(Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(values[k]))), [draft, values]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(changed);
      }}
    >
      {Object.entries(draft)
        .filter(([k]) => !hide.includes(k))
        .map(([k, v]) => (
          <Field key={k} name={k} path={k} value={v} onChange={(nv) => setDraft((d) => ({ ...d, [k]: nv }))} />
        ))}
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" disabled={busy || Object.keys(changed).length === 0}>
          {busy ? "Saving…" : `Save${Object.keys(changed).length ? ` (${Object.keys(changed).length})` : ""}`}
        </button>
        <button type="button" className="btn btn-quiet" disabled={Object.keys(changed).length === 0} onClick={() => setDraft(values)}>
          Undo
        </button>
      </div>
    </form>
  );
}
