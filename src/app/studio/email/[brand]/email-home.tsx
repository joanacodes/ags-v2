"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { ago, CopyButton, Empty, ErrorNote, Loading, Sheet, Tabs, useAction } from "@/components/studio/ui";
import {
  BRAND_LABELS,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUSES,
  FONT_KEYS,
  FONT_STACKS,
  newWorkflow,
  starterDesign,
  STARTER_LABELS,
  STARTERS,
  type Brand,
  type BrandSettings,
  type ContactStatus,
  type Starter,
} from "@/studio/email/model";
import { renderEmail } from "@/studio/email/render";
import type { ContactView, DesignView, EmailOverview, WorkflowView } from "@/studio/email/views";
import type { Language } from "@/studio/types";
import { BrandSwitch, EmailFrame, EmailThumb, PicturePicker } from "../email-ui";

const TABS = [
  { id: "designs", label: "Designs" },
  { id: "workflows", label: "Workflows" },
  { id: "contacts", label: "Contacts" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STATUS_CHIP: Readonly<Record<string, string>> = { draft: "bg-ink/5 text-ink-2", paused: "bg-gold-soft text-[#8a5a12]", on: "bg-moss-soft text-moss" };

export function EmailHome({ brand }: { brand: Brand }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "designs") as Tab;
  const { data, error, loading, reload } = useApi<EmailOverview>(`/api/studio/email/${brand}`);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Email</h1>
          <p className="mt-1 text-sm text-ink-3">Each brand has its own designs, workflows and contacts. Nothing is shared between them.</p>
        </div>
      </div>
      <div className="mt-4">
        <BrandSwitch brand={brand} tab={tab} />
      </div>
      {data && !data.sending.ready && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-gold-soft/60 p-4 text-sm text-[#6b4710]">
          <p className="font-medium">Before {BRAND_LABELS[brand]} can send</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.sending.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5">
        <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === "designs" ? data?.designs.length : t.id === "workflows" ? data?.workflows.length : t.id === "contacts" ? (data?.contacts.subscribed ?? 0) + (data?.contacts.pending ?? 0) : undefined }))} active={tab} onChange={(id) => router.replace(`${pathname}?tab=${id}`, { scroll: false })} />
      </div>
      {loading && !data && <Loading label="Opening the email space" />}
      {error && (
        <div className="mt-4">
          <ErrorNote error={error} retry={() => void reload()} />
        </div>
      )}
      {data && tab === "designs" && <DesignsTab overview={data} />}
      {data && tab === "workflows" && <WorkflowsTab overview={data} />}
      {data && tab === "contacts" && <ContactsTab overview={data} onChange={() => void reload()} />}
      {data && tab === "settings" && <SettingsTab overview={data} onSaved={() => void reload()} />}
    </div>
  );
}

/* ---------------------------------------------------------------- designs */

function DesignsTab({ overview }: { overview: EmailOverview }) {
  const { brand, settings } = overview;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [starter, setStarter] = useState<Starter>("newsletter");
  const { busy, run } = useAction();
  const thumbs = useMemo(() => new Map(overview.designs.map((d) => [d.id, renderEmail(d.content, brand, settings, { unsubscribeUrl: "#", preview: true }).html])), [overview, brand, settings]);

  async function create() {
    const content = starterDesign(starter, language, name.trim() || (language === "fr" ? "Sans titre" : "Untitled"));
    const saved = await run("create", () => api<DesignView>(`/api/studio/email/${brand}/designs`, { method: "POST", body: content }));
    if (saved) router.push(`/studio/email/${brand}/designs/${saved.id}`);
  }

  return (
    <section className="mt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3">Emails built from blocks, in {BRAND_LABELS[brand]}&apos;s look.</p>
        <button className="btn btn-accent btn-sm shrink-0" onClick={() => setOpen(true)}>
          + New design
        </button>
      </div>
      {overview.designs.length === 0 ? (
        <Empty>No design yet. Start one: a newsletter, an announcement, or a blank page.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {overview.designs.map((d) => (
            <Link key={d.id} href={`/studio/email/${brand}/designs/${d.id}`} className="group block">
              <EmailThumb html={thumbs.get(d.id) ?? ""} title={d.content.name} />
              <span className="mt-2 block truncate text-sm font-medium group-hover:text-accent">{d.content.name}</span>
              <span className="block truncate text-xs text-ink-3">
                {d.content.language.toUpperCase()} · {d.content.subject || "no subject yet"} · {ago(d.updated_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="New design" wide>
        <label className="label" htmlFor="new-design-name">
          Name
        </label>
        <input id="new-design-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="November newsletter" maxLength={80} />
        <p className="label mt-4">Language</p>
        <div className="flex gap-2">
          {(["en", "fr"] as const).map((l) => (
            <button key={l} className={`btn btn-sm ${language === l ? "btn-primary" : ""}`} onClick={() => setLanguage(l)} aria-pressed={language === l}>
              {l === "en" ? "English" : "Français"}
            </button>
          ))}
        </div>
        <p className="label mt-4">Start from</p>
        <div className="grid grid-cols-3 gap-3">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => setStarter(s)} aria-pressed={starter === s} className={`rounded-2xl border-2 p-1.5 text-left ${starter === s ? "border-accent" : "border-transparent"}`}>
              <EmailThumb html={renderEmail(starterDesign(s, language, ""), brand, settings, { unsubscribeUrl: "#", preview: true }).html} title={STARTER_LABELS[s]} />
              <span className="mt-1 block text-center text-xs font-medium">{STARTER_LABELS[s]}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-accent mt-5 w-full" disabled={busy !== null} onClick={() => void create()}>
          {busy ? "Creating…" : "Create and open"}
        </button>
      </Sheet>
    </section>
  );
}

/* -------------------------------------------------------------- workflows */

function WorkflowsTab({ overview }: { overview: EmailOverview }) {
  const { brand } = overview;
  const router = useRouter();
  const { busy, run } = useAction();
  async function create() {
    const saved = await run("create", () => api<WorkflowView>(`/api/studio/email/${brand}/workflows`, { method: "POST", body: { content: newWorkflow(brand === "astrostudy" ? "After the test" : "Welcome", brand), status: "draft" } }));
    if (saved) router.push(`/studio/email/${brand}/workflows/${saved.id}`);
  }
  return (
    <section className="mt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3">What is sent when, and to whom. The AI can write the emails; you approve them.</p>
        <button className="btn btn-accent btn-sm shrink-0" disabled={busy !== null} onClick={() => void create()}>
          + New workflow
        </button>
      </div>
      {overview.workflows.length === 0 ? (
        <Empty>No workflow yet. A welcome series is a good first one.</Empty>
      ) : (
        <ul className="space-y-2">
          {overview.workflows.map((w) => (
            <li key={w.id}>
              <Link href={`/studio/email/${brand}/workflows/${w.id}`} className="panel flex items-center gap-4 p-4 hover:border-line-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-lg text-accent-ink" aria-hidden="true">
                  ↯
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {w.trigger} · {w.steps} {w.steps === 1 ? "step" : "steps"} · {ago(w.updated_at)}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[w.status] ?? ""}`}>{w.status === "on" ? "On" : w.status === "paused" ? "Paused" : "Draft"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- contacts */

function ContactsTab({ overview, onChange }: { overview: EmailOverview; onChange: () => void }) {
  const { brand } = overview;
  const [status, setStatus] = useState<ContactStatus | "">("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState<"add" | "import" | null>(null);
  const url = `/api/studio/email/${brand}/contacts?${new URLSearchParams({ ...(status ? { status } : {}), ...(query ? { q: query } : {}), offset: String(offset) }).toString()}`;
  const { data, error, loading, reload } = useApi<{ rows: ContactView[]; total: number }>(url);
  const { busy, run } = useAction();
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setOffset(0), [status, query]);
  const refresh = () => {
    void reload();
    onChange();
  };

  return (
    <section className="mt-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <button className={`btn btn-sm shrink-0 ${status === "" ? "btn-primary" : ""}`} onClick={() => setStatus("")}>
          All
        </button>
        {CONTACT_STATUSES.map((s) => (
          <button key={s} className={`btn btn-sm shrink-0 ${status === s ? "btn-primary" : ""}`} onClick={() => setStatus(s)}>
            {CONTACT_STATUS_LABELS[s]} <span className={status === s ? "text-paper/70" : "text-ink-3"}>{overview.contacts[s]}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="search" className="field sm:max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an address or a name" aria-label="Search the contacts" />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button className="btn btn-sm" onClick={() => setAdding("add")}>
            + Add someone
          </button>
          <button className="btn btn-sm" onClick={() => setAdding("import")}>
            Import a list
          </button>
          <a className="btn btn-sm" href={`/api/studio/email/${brand}/contacts?format=csv`}>
            Export CSV
          </a>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorNote error={error} retry={() => void reload()} />
        </div>
      )}
      {loading && !data && <Loading />}
      {data && data.rows.length === 0 && (
        <div className="mt-4">
          <Empty>{query || status ? "Nobody matches." : "No contact yet. People will join from your forms; you can also add someone who agreed, or import a list."}</Empty>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
          {data.rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.email}</p>
                <p className="truncate text-xs text-ink-3">
                  {[c.name, c.language.toUpperCase(), c.tags.length ? c.tags.map((t) => `#${t}`).join(" ") : null, c.source].filter(Boolean).join(" · ")}
                </p>
                <p className="truncate text-[11px] text-ink-3" title={c.consent_text}>
                  Agreed {ago(c.consent_at)}: {c.consent_text}
                </p>
              </div>
              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-2">{CONTACT_STATUS_LABELS[c.status]}</span>
              <div className="flex gap-1">
                {c.status !== "unsubscribed" && (
                  <button className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => void run(`u-${c.id}`, () => api(`/api/studio/email/${brand}/contacts/${c.id}`, { method: "PATCH", body: { status: "unsubscribed" } }), "Unsubscribed").then(refresh)}>
                    Unsubscribe
                  </button>
                )}
                <button
                  className="btn btn-quiet btn-sm text-rust"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Delete ${c.email} and their consent record?`)) void run(`d-${c.id}`, () => api(`/api/studio/email/${brand}/contacts/${c.id}`, { method: "DELETE" }), "Deleted").then(refresh);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > offset + data.rows.length && (
        <button className="btn mt-3 w-full" onClick={() => setOffset((o) => o + 100)}>
          Next {Math.min(100, data.total - offset - data.rows.length)} of {data.total - offset - data.rows.length} more
        </button>
      )}
      {data && offset > 0 && (
        <button className="btn btn-quiet mt-2 w-full" onClick={() => setOffset((o) => Math.max(0, o - 100))}>
          Previous page
        </button>
      )}
      <AddContacts brand={brand} mode={adding} onClose={() => setAdding(null)} onDone={refresh} />
    </section>
  );
}

function AddContacts({ brand, mode, onClose, onDone }: { brand: Brand; mode: "add" | "import" | null; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [tags, setTags] = useState("");
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState("");
  const [status, setStatus] = useState<"subscribed" | "pending">("subscribed");
  const [report, setReport] = useState<string | null>(null);
  const { busy, run } = useAction();
  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
  async function submit() {
    if (mode === "add") {
      const ok = await run("add", () => api(`/api/studio/email/${brand}/contacts`, { method: "POST", body: { action: "add", contact: { email, name, language, tags: tagList, source, consent_text: consent, status } } }), "Added");
      if (ok) {
        setEmail("");
        setName("");
        onDone();
        onClose();
      }
    } else {
      const r = await run("import", () => api<{ added: number; skipped: number; problems: string[]; problemCount: number }>(`/api/studio/email/${brand}/contacts`, { method: "POST", body: { action: "import", contact: { csv, language, source, consent_text: consent, status, tags: tagList } } }));
      if (r) {
        setReport(`${r.added} added, ${r.skipped} already there${r.problemCount ? `, ${r.problemCount} lines skipped: ${r.problems.slice(0, 3).join("; ")}` : ""}.`);
        onDone();
      }
    }
  }
  return (
    <Sheet open={mode !== null} onClose={onClose} title={mode === "add" ? "Add someone" : "Import a list"} wide>
      {mode === "add" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="c-email">
              Email address
            </label>
            <input id="c-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="c-name">
              Name
            </label>
            <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="c-lang">
              Language
            </label>
            <select id="c-lang" className="field" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </div>
      ) : (
        <>
          <label className="label" htmlFor="c-csv">
            Addresses
          </label>
          <textarea id="c-csv" className="field min-h-[160px] font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"One per line, or a CSV:\nemail, name, language (en or fr), tags separated by |\nana@example.com, Ana, fr, test|calls"} />
          <div className="mt-3">
            <label className="label" htmlFor="c-lang2">
              Language when a line has none
            </label>
            <select id="c-lang2" className="field" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-tags">
            Tags
          </label>
          <input id="c-tags" className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="test, calls" />
        </div>
        <div>
          <label className="label" htmlFor="c-source">
            Where they come from
          </label>
          <input id="c-source" className="field" value={source} onChange={(e) => setSource(e.target.value)} placeholder="the market, the calls form…" />
        </div>
      </div>
      <div className="mt-3">
        <label className="label" htmlFor="c-consent">
          How they agreed to receive these emails
        </label>
        <textarea id="c-consent" className="field" value={consent} onChange={(e) => setConsent(e.target.value)} placeholder="e.g. Signed up on the calls form on 12 October; or: asked me in person to be told about the show" maxLength={500} />
        <p className="mt-1 text-xs text-ink-3">Kept with each contact. Only people who agreed may be added.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={`btn btn-sm ${status === "subscribed" ? "btn-primary" : ""}`} onClick={() => setStatus("subscribed")} aria-pressed={status === "subscribed"}>
          They already agreed
        </button>
        <button className={`btn btn-sm ${status === "pending" ? "btn-primary" : ""}`} onClick={() => setStatus("pending")} aria-pressed={status === "pending"}>
          Ask them to confirm first
        </button>
      </div>
      {status === "pending" && <p className="mt-1 text-xs text-ink-3">They wait as “waiting for confirmation”; the confirmation email comes with sending, in the next step.</p>}
      {report && <p className="mt-3 rounded-xl bg-moss-soft p-3 text-sm text-moss">{report}</p>}
      <button className="btn btn-accent mt-4 w-full" disabled={busy !== null || consent.trim().length < 3 || (mode === "add" ? !email.trim() : !csv.trim())} onClick={() => void submit()}>
        {busy ? "Saving…" : mode === "add" ? "Add" : "Import"}
      </button>
    </Sheet>
  );
}

/* --------------------------------------------------------------- settings */

const COLOR_LABELS: Readonly<Record<keyof BrandSettings["colors"], string>> = { page: "Page", card: "Email", text: "Text", muted: "Quiet text", accent: "Accent", button_text: "Button text" };
/** Each brand's own example, so neither screen shows the other's address. */
const SENDER_EXAMPLE: Readonly<Record<Brand, string>> = { astrostudy: "hello@astrostudy.co.uk", "maison-tarot": "hello@maisontarot.com" };

function SettingsTab({ overview, onSaved }: { overview: EmailOverview; onSaved: () => void }) {
  const { brand } = overview;
  const [s, setS] = useState<BrandSettings>(overview.settings);
  const [picking, setPicking] = useState(false);
  const { busy, run } = useAction();
  const set = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const sample = useMemo(() => renderEmail(starterDesign("announcement", "en", "Sample"), brand, s, { unsubscribeUrl: "#", preview: true }).html, [brand, s]);
  const field = (k: "sender_name" | "sender_email" | "reply_to" | "test_email" | "footer_address" | "logo_url", label: string, hint: string, type = "text") => (
    <div>
      <label className="label" htmlFor={`s-${k}`}>
        {label}
      </label>
      <input id={`s-${k}`} type={type} className="field" value={s[k]} onChange={(e) => set(k, e.target.value)} />
      <p className="mt-1 text-xs text-ink-3">{hint}</p>
    </div>
  );
  return (
    <section className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <div className="panel space-y-4 p-5">
          <p className="eyebrow">Who sends</p>
          {field("sender_name", "Sender name", "What people see in their inbox.")}
          {field("sender_email", "Sender address", `On a domain verified in Resend, e.g. ${SENDER_EXAMPLE[brand]}.`, "email")}
          {field("reply_to", "Replies go to", "Optional: where answers land.", "email")}
          {field("test_email", "Tests go to", `Optional: “Send me a test” goes here${overview.sending.testTo ? ` (now: ${overview.sending.testTo})` : ""}.`, "email")}
        </div>
        <div className="panel space-y-4 p-5">
          <p className="eyebrow">Footer</p>
          {field("footer_address", "Postal address", "Shown in every email's footer.")}
          {(["en", "fr"] as const).map((l) => (
            <div key={l}>
              <label className="label" htmlFor={`s-note-${l}`}>
                Why they receive it ({l === "en" ? "English" : "French"})
              </label>
              <input id={`s-note-${l}`} className="field" value={s.footer_note[l]} onChange={(e) => set("footer_note", { ...s.footer_note, [l]: e.target.value })} />
            </div>
          ))}
          <p className="text-xs text-ink-3">The unsubscribe link is always added; it can&apos;t be removed.</p>
        </div>
        <div className="panel space-y-4 p-5">
          <p className="eyebrow">The look</p>
          <div>
            {field("logo_url", "Logo", "A picture address (https), or pick one from this brand's files. Empty: the brand's name in small capitals.")}
            <button className="btn btn-sm mt-2" onClick={() => setPicking(true)}>
              Pick from Files
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.keys(COLOR_LABELS) as (keyof BrandSettings["colors"])[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="color" value={s.colors[k]} onChange={(e) => set("colors", { ...s.colors, [k]: e.target.value })} className="h-9 w-9 shrink-0 cursor-pointer rounded-full border border-line-2 bg-transparent p-0" />
                <span>
                  {COLOR_LABELS[k]}
                  <span className="block font-mono text-[10px] text-ink-3">{s.colors[k]}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["heading", "body"] as const).map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`s-font-${k}`}>
                  {k === "heading" ? "Titles" : "Text"}
                </label>
                <select id={`s-font-${k}`} className="field" value={s.fonts[k]} onChange={(e) => set("fonts", { ...s.fonts, [k]: e.target.value as BrandSettings["fonts"]["heading"] })}>
                  {FONT_KEYS.map((f) => (
                    <option key={f} value={f}>
                      {FONT_STACKS[f].label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="panel space-y-2 p-5">
          <label className="eyebrow block" htmlFor="s-voice">
            The voice the AI writes in
          </label>
          <textarea id="s-voice" className="field min-h-[110px]" value={s.voice} onChange={(e) => set("voice", e.target.value)} maxLength={3000} />
          {brand === "astrostudy" && <p className="text-xs text-ink-3">The Astro Study&apos;s AI also follows its brand kit, your standing rules and the definition library, as the posts do.</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-accent" disabled={busy !== null} onClick={() => void run("save", () => api(`/api/studio/email/${brand}`, { method: "PUT", body: s }), "Saved").then((r) => r && onSaved())}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button className="btn btn-quiet" onClick={() => setS(overview.settings)}>
            Undo changes
          </button>
        </div>
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="eyebrow mb-2">How it looks</p>
        <EmailFrame html={sample} width={380} height={560} title="A sample email in these settings" />
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-3">
          Merge tag for the reader&apos;s first name: <code className="rounded bg-ink/5 px-1">{"{{first_name}}"}</code>
          <CopyButton text="{{first_name}}" label="Copy" />
        </div>
      </div>
      <PicturePicker
        brand={brand}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(url) => {
          set("logo_url", url);
          setPicking(false);
        }}
      />
    </section>
  );
}
