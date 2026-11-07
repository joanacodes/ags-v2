"use client";
/**
 * The workflow builder: a trigger, then steps from top to bottom (send an email, wait, keep only some
 * people, tag them), and the settings that govern all of it. Steps are added between any two, moved by
 * dragging their ⠿ handle, and removed. A workflow is saved as a draft: switching it on comes with
 * sending to contacts, the next step of the Studio's email.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { ErrorNote, Loading, useAction } from "@/components/studio/ui";
import {
  BRAND_LABELS,
  newStep,
  STEP_LABELS,
  TRIGGER_LABELS,
  workflowProblems,
  type Brand,
  type Step,
  type StepType,
  type Trigger,
  type TriggerType,
  type WorkflowContent,
  type WorkflowSettings,
} from "@/studio/email/model";
import type { EmailOverview, WorkflowView } from "@/studio/email/views";
import { moved, useSortable } from "../../../email-ui";

const STEP_GLYPH: Readonly<Record<StepType, string>> = { send: "✉", wait: "◷", filter: "⊃", tag: "#" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WorkflowBuilder({ brand, id }: { brand: Brand; id: string }) {
  const overview = useApi<EmailOverview>(`/api/studio/email/${brand}`);
  const workflow = useApi<WorkflowView>(`/api/studio/email/${brand}/workflows/${id}`);
  if (overview.error || workflow.error) return <ErrorNote error={overview.error ?? workflow.error ?? ""} retry={() => void (overview.error ? overview.reload() : workflow.reload())} />;
  if (!overview.data || !workflow.data) return <Loading label="Opening the workflow" />;
  return <Builder key={workflow.data.id} brand={brand} overview={overview.data} initial={workflow.data} />;
}

const tagsText = (tags: readonly string[]) => tags.join(", ");
const tagsOf = (text: string) => text.split(",").map((t) => t.trim()).filter(Boolean);

function Builder({ brand, overview, initial }: { brand: Brand; overview: EmailOverview; initial: WorkflowView }) {
  const router = useRouter();
  const { busy, run } = useAction();
  const [content, setContent] = useState<WorkflowContent>(initial.content);
  const [saved, setSaved] = useState(JSON.stringify(initial.content));
  const [adding, setAdding] = useState<number | null>(null);
  const dirty = JSON.stringify(content) !== saved;
  const designIds = useMemo(() => new Set(overview.designs.map((d) => d.id)), [overview]);
  const problems = workflowProblems(content, designIds);
  const steps = content.steps;
  const setSteps = (next: Step[]) => setContent((c) => ({ ...c, steps: next }));
  const sortable = useSortable(steps.length, (from, to) => setSteps(moved(steps, from, to)));
  const setSettings = (patch: Partial<WorkflowSettings>) => setContent((c) => ({ ...c, settings: { ...c.settings, ...patch } }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const insert = (at: number, type: StepType) => {
    const next = [...steps];
    next.splice(at, 0, newStep(type));
    setSteps(next);
    setAdding(null);
  };
  const update = (s: Step) => setSteps(steps.map((x) => (x.id === s.id ? s : x)));

  async function save() {
    const r = await run("save", () => api<WorkflowView>(`/api/studio/email/${brand}/workflows/${initial.id}`, { method: "PUT", body: { content, status: initial.status === "on" ? "paused" : initial.status } }), "Saved");
    if (r) {
      setContent(r.content);
      setSaved(JSON.stringify(r.content));
    }
  }

  const AddHere = ({ at }: { at: number }) => (
    <div className="relative flex flex-col items-center py-1">
      <span className="h-4 w-px bg-line-2" aria-hidden="true" />
      {adding === at ? (
        <div className="flex flex-wrap justify-center gap-1 rounded-2xl border border-line bg-card p-2 shadow-soft">
          {(Object.keys(STEP_LABELS) as StepType[]).map((t) => (
            <button key={t} className="btn btn-sm" onClick={() => insert(at, t)}>
              {STEP_GLYPH[t]} {STEP_LABELS[t].label}
            </button>
          ))}
          <button className="btn btn-quiet btn-sm" onClick={() => setAdding(null)} aria-label="Close">
            ✕
          </button>
        </div>
      ) : (
        <button className="flex h-7 w-7 items-center justify-center rounded-full border border-line-2 bg-card text-ink-2 hover:border-accent hover:text-accent" onClick={() => setAdding(at)} aria-label="Add a step here">
          +
        </button>
      )}
      <span className="h-4 w-px bg-line-2" aria-hidden="true" />
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/studio/email/${brand}?tab=workflows`} className="btn btn-quiet btn-sm">
          ← {BRAND_LABELS[brand]}
        </Link>
        <input className="field max-w-[280px] flex-1 font-serif text-lg" value={content.name} onChange={(e) => setContent({ ...content, name: e.target.value })} aria-label="Workflow name" maxLength={80} />
        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink-2">{initial.status === "paused" ? "Paused" : "Draft"}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-sm" disabled title="Comes with sending to your contacts, the next step">
            Switch on
          </button>
          <button className="btn btn-accent btn-sm" disabled={busy !== null || !dirty} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-3">Drafts only for now: switching a workflow on comes with sending to your contacts, the next step.</p>

      {problems.length > 0 && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-gold-soft/60 p-4 text-sm text-[#6b4710]">
          <p className="font-medium">Before it could run</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((p, i) => (
              <li key={`${p}-${i}`}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="mx-auto w-full max-w-xl">
          <TriggerCard brand={brand} trigger={content.trigger} onChange={(trigger) => setContent({ ...content, trigger })} />
          <AddHere at={0} />
          {steps.map((s, i) => {
            const d = sortable.drag;
            return (
              <div key={s.id} ref={sortable.register(i)} className={d?.from === i ? "opacity-40" : ""}>
                {d && d.to === i && d.to < d.from && <span className="mb-2 block h-1 rounded-full bg-accent" aria-hidden="true" />}
                <div className="panel p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink" aria-hidden="true">
                      {STEP_GLYPH[s.type]}
                    </span>
                    <span className="flex-1 text-sm font-medium">{STEP_LABELS[s.type].label}</span>
                    <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5" aria-label={`Drag to move: ${STEP_LABELS[s.type].label}`} {...sortable.handle(i)}>
                      ⠿
                    </button>
                    <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5 disabled:opacity-30" disabled={i === 0} onClick={() => setSteps(moved(steps, i, i - 1))} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5 disabled:opacity-30" disabled={i === steps.length - 1} onClick={() => setSteps(moved(steps, i, i + 1))} aria-label="Move down">
                      ↓
                    </button>
                    <button type="button" className="rounded-full px-2 py-1 text-xs text-rust hover:bg-rust-soft" onClick={() => setSteps(steps.filter((x) => x.id !== s.id))} aria-label="Remove this step">
                      ✕
                    </button>
                  </div>
                  <StepFields brand={brand} step={s} designs={overview.designs} onChange={update} />
                </div>
                {d && d.to === i && d.to > d.from && <span className="mt-2 block h-1 rounded-full bg-accent" aria-hidden="true" />}
                <AddHere at={i + 1} />
              </div>
            );
          })}
          <p className="text-center text-xs uppercase tracking-[.16em] text-ink-3">End</p>
        </div>

        <SettingsCard settings={content.settings} onChange={setSettings} />
      </div>

      <div className="mt-8 border-t border-line pt-4">
        <button
          className="btn btn-danger btn-sm"
          disabled={busy !== null}
          onClick={() => {
            if (window.confirm("Delete this workflow?")) void run("delete", () => api(`/api/studio/email/${brand}/workflows/${initial.id}`, { method: "DELETE" }), "Deleted").then((r) => r && router.push(`/studio/email/${brand}?tab=workflows`));
          }}
        >
          Delete the workflow
        </button>
      </div>
    </div>
  );
}

function TriggerCard({ brand, trigger, onChange }: { brand: Brand; trigger: Trigger; onChange: (t: Trigger) => void }) {
  const types = (Object.keys(TRIGGER_LABELS) as TriggerType[]).filter((t) => t !== "test-finished" || brand === "astrostudy");
  const change = (type: TriggerType) => {
    const next: Trigger = type === "signup" ? { type, sources: [] } : type === "tag" ? { type, tag: "" } : type === "once" ? { type, at: new Date(Date.now() + 86400_000).toISOString().slice(0, 16) } : { type: "test-finished" };
    onChange(next);
  };
  return (
    <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft/40 p-4">
      <p className="eyebrow">It starts when</p>
      <select className="field mt-2" value={trigger.type} onChange={(e) => change(e.target.value as TriggerType)} aria-label="It starts when">
        {types.map((t) => (
          <option key={t} value={t}>
            {TRIGGER_LABELS[t]}
          </option>
        ))}
      </select>
      {trigger.type === "signup" && (
        <div className="mt-3">
          <label className="label" htmlFor="t-sources">
            From these forms only (empty: any)
          </label>
          <input id="t-sources" className="field" value={tagsText(trigger.sources)} onChange={(e) => onChange({ ...trigger, sources: tagsOf(e.target.value) })} placeholder="test, calls, case-file" />
        </div>
      )}
      {trigger.type === "tag" && (
        <div className="mt-3">
          <label className="label" htmlFor="t-tag">
            The tag
          </label>
          <input id="t-tag" className="field" value={trigger.tag} onChange={(e) => onChange({ ...trigger, tag: e.target.value })} placeholder="ticket-buyer" />
        </div>
      )}
      {trigger.type === "test-finished" && <p className="mt-2 text-sm text-ink-2">Someone finishes The Astro Study&apos;s blind test and ticked the box for news.</p>}
      {trigger.type === "once" && (
        <div className="mt-3">
          <label className="label" htmlFor="t-at">
            Date and time (Paris)
          </label>
          <input id="t-at" type="datetime-local" className="field" value={trigger.at} onChange={(e) => onChange({ ...trigger, at: e.target.value })} />
          <p className="mt-1 text-xs text-ink-3">A newsletter: everyone the audience covers, once.</p>
        </div>
      )}
    </div>
  );
}

function StepFields({ brand, step, designs, onChange }: { brand: Brand; step: Step; designs: EmailOverview["designs"]; onChange: (s: Step) => void }) {
  switch (step.type) {
    case "send":
      return (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor={`s-${step.id}-design`}>
              {step.ai ? "Layout to write into (optional)" : "The design"}
            </label>
            <select id={`s-${step.id}-design`} className="field" value={step.design_id ?? ""} onChange={(e) => onChange({ ...step, design_id: e.target.value || null })}>
              <option value="">{step.ai ? "None: the AI chooses the blocks" : "Choose a design…"}</option>
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.content.name} ({d.content.language.toUpperCase()})
                </option>
              ))}
            </select>
            {step.design_id && (
              <Link href={`/studio/email/${brand}/designs/${step.design_id}`} className="mt-1 inline-block text-xs text-accent underline">
                Open the design
              </Link>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={step.ai} onChange={(e) => onChange({ ...step, ai: e.target.checked })} />
            Let the AI write it (you approve it before it goes)
          </label>
          {step.ai && (
            <div>
              <label className="label" htmlFor={`s-${step.id}-brief`}>
                What should it say?
              </label>
              <textarea id={`s-${step.id}-brief`} className="field" rows={3} value={step.brief} onChange={(e) => onChange({ ...step, brief: e.target.value })} maxLength={2000} placeholder="e.g. Thank them for the test, explain what their score means, invite them to the next live." />
            </div>
          )}
        </div>
      );
    case "wait":
      return (
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={365} className="field w-24" value={step.amount} onChange={(e) => onChange({ ...step, amount: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} aria-label="How long" />
          <select className="field w-32" value={step.unit} onChange={(e) => onChange({ ...step, unit: e.target.value as "hours" | "days" })} aria-label="Unit">
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      );
    case "filter":
      return (
        <div className="space-y-2">
          <select className="field" value={step.rule} onChange={(e) => onChange({ ...step, rule: e.target.value as typeof step.rule })} aria-label="Keep only the people who">
            <option value="opened-last">Opened the last email</option>
            <option value="clicked-last">Clicked in the last email</option>
            <option value="has-tag">Have the tag…</option>
            <option value="lacks-tag">Don&apos;t have the tag…</option>
          </select>
          {(step.rule === "has-tag" || step.rule === "lacks-tag") && <input className="field" value={step.tag} onChange={(e) => onChange({ ...step, tag: e.target.value })} placeholder="the tag" aria-label="The tag" />}
          <p className="text-xs text-ink-3">The others leave the workflow here.</p>
        </div>
      );
    case "tag":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <select className="field w-32" value={step.action} onChange={(e) => onChange({ ...step, action: e.target.value as "add" | "remove" })} aria-label="Add or remove">
            <option value="add">Add</option>
            <option value="remove">Remove</option>
          </select>
          <input className="field flex-1" value={step.tag} onChange={(e) => onChange({ ...step, tag: e.target.value })} placeholder="the tag" aria-label="The tag" />
        </div>
      );
  }
}

function SettingsCard({ settings, onChange }: { settings: WorkflowSettings; onChange: (patch: Partial<WorkflowSettings>) => void }) {
  const toggleDay = (d: number) => {
    const days = settings.window.days.includes(d) ? settings.window.days.filter((x) => x !== d) : [...settings.window.days, d].sort();
    if (days.length) onChange({ window: { ...settings.window, days } });
  };
  return (
    <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
      <div className="panel space-y-4 p-4">
        <p className="eyebrow">Who and when</p>
        <div>
          <label className="label" htmlFor="w-lang">
            Language
          </label>
          <select id="w-lang" className="field" value={settings.language} onChange={(e) => onChange({ language: e.target.value as WorkflowSettings["language"] })}>
            <option value="contact">Each person in their own</option>
            <option value="en">English for everyone</option>
            <option value="fr">French for everyone</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="w-any">
            Only people with one of these tags
          </label>
          <input id="w-any" className="field" value={tagsText(settings.audience.tags_any)} onChange={(e) => onChange({ audience: { ...settings.audience, tags_any: tagsOf(e.target.value) } })} placeholder="empty: everyone subscribed" />
        </div>
        <div>
          <label className="label" htmlFor="w-none">
            Never people with these tags
          </label>
          <input id="w-none" className="field" value={tagsText(settings.audience.tags_none)} onChange={(e) => onChange({ audience: { ...settings.audience, tags_none: tagsOf(e.target.value) } })} placeholder="e.g. press" />
        </div>
        <div>
          <p className="label">Send between (Paris time)</p>
          <div className="flex items-center gap-2">
            <input type="time" className="field" value={settings.window.from} onChange={(e) => onChange({ window: { ...settings.window, from: e.target.value } })} aria-label="From" />
            <span className="text-ink-3">and</span>
            <input type="time" className="field" value={settings.window.to} onChange={(e) => onChange({ window: { ...settings.window, to: e.target.value } })} aria-label="To" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {DAYS.map((label, i) => (
              <button key={label} type="button" aria-pressed={settings.window.days.includes(i + 1)} onClick={() => toggleDay(i + 1)} className={`rounded-full px-2.5 py-1 text-xs ${settings.window.days.includes(i + 1) ? "bg-ink text-paper" : "bg-ink/5 text-ink-3"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="w-max">
            At most, per person and week
          </label>
          <input id="w-max" type="number" min={1} max={14} className="field w-24" value={settings.max_per_week} onChange={(e) => onChange({ max_per_week: Math.max(1, Math.min(14, Number(e.target.value) || 1)) })} />
        </div>
      </div>
      <div className="panel space-y-4 p-4">
        <p className="eyebrow">The AI&apos;s emails</p>
        <div>
          <label className="label" htmlFor="w-tone">
            Tone for this workflow
          </label>
          <input id="w-tone" className="field" value={settings.ai.tone} onChange={(e) => onChange({ ai: { ...settings.ai, tone: e.target.value } })} placeholder="e.g. warm and brief, like a note from Joana" maxLength={300} />
        </div>
        <div>
          <p className="label">Length</p>
          <div className="flex gap-1">
            {(["short", "medium", "long"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={settings.ai.length === l} onClick={() => onChange({ ai: { ...settings.ai, length: l } })} className={`btn btn-sm ${settings.ai.length === l ? "btn-primary" : ""}`}>
                {l === "short" ? "Short" : l === "medium" ? "Medium" : "Long"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">Your approval</p>
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="approval" checked={settings.ai.approval === "every"} onChange={() => onChange({ ai: { ...settings.ai, approval: "every" } })} />
              Approve every email the AI writes
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="approval" checked={settings.ai.approval === "first"} onChange={() => onChange({ ai: { ...settings.ai, approval: "first" } })} />
              Approve the first one; then it sends on its own
            </label>
          </div>
        </div>
      </div>
    </aside>
  );
}
