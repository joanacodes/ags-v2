"use client";
import { useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { ErrorNote, Loading, paris, useAction } from "@/components/studio/ui";

interface KeyLine {
  env: string;
  label: string;
  group: string;
  secret: boolean;
  where: string;
  optional: boolean;
  state: "studio" | "environment" | "missing";
  setAt: string | null;
  shown: string | null;
  checkable: boolean;
}
interface KeysData {
  groups: { id: string; label: string; blurb: string }[];
  keys: KeyLine[];
  shared: { env: string; label: string; set: boolean }[];
  loadError: string | null;
}

/**
 * Every key the Studio needs, pasted once here: it goes to Supabase Vault and is never shown again. Nothing
 * to add on Vercel or in GitHub beyond what AGS already has.
 */
export function KeysSection() {
  const { data, error, loading, reload } = useApi<KeysData>("/api/studio/keys");
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  return (
    <div>
      <h2 className="text-2xl">Keys</h2>
      <p className="mt-1 text-sm text-ink-2">Paste each key once. It is kept in Supabase Vault, used by the Studio and its background jobs, and never shown again: a secret only says when it was set. Leave out what you don&rsquo;t use.</p>
      {data.loadError && <p className="mt-3 rounded-xl bg-rust-soft p-3 text-sm text-rust">The keys kept in Vault can&rsquo;t be read: {data.loadError}. Has the Studio&rsquo;s migration (0008) been run?</p>}
      <div className="panel mt-4 p-4">
        <p className="label">Shared with AGS</p>
        <ul className="space-y-1 text-sm">
          {data.shared.map((s) => (
            <li key={s.env} className="flex flex-wrap items-center justify-between gap-2">
              <span>{s.label}</span>
              <span className={`chip ${s.set ? "border-moss/40 text-moss" : "border-rust/40 text-rust"}`}>{s.set ? "set in AGS" : "missing in AGS"}</span>
            </li>
          ))}
        </ul>
      </div>
      {data.groups.map((g) => {
        const keys = data.keys.filter((k) => k.group === g.id);
        if (!keys.length) return null;
        return (
          <section key={g.id} className="mt-6">
            <h3 className="text-xl">{g.label}</h3>
            <p className="mt-0.5 text-sm text-ink-2">{g.blurb}</p>
            <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {keys.map((k) => (
                <KeyRow key={k.env} line={k} onChange={reload} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function KeyRow({ line, onChange }: { line: KeyLine; onChange: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; detail: string } | null>(null);
  const { busy, run } = useAction();
  const state =
    line.state === "studio"
      ? { text: `set ${paris(line.setAt, "date")}`, tone: "border-moss/40 text-moss" }
      : line.state === "environment"
        ? { text: "set in the environment", tone: "border-moss/40 text-moss" }
        : { text: line.optional ? "optional" : "not set", tone: line.optional ? "" : "border-gold/50 text-[#8a5a12]" };
  const save = () =>
    run(
      "save",
      async () => {
        await api("/api/studio/keys", { method: "PUT", body: { env: line.env, value } });
        setValue("");
        setCheck(null);
        await onChange();
      },
      "Saved",
    );
  return (
    <li className="panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{line.label}</p>
          <p className="mt-0.5 text-xs text-ink-3">{line.where}</p>
        </div>
        <span className={`chip shrink-0 ${state.tone}`}>{state.text}</span>
      </div>
      {line.shown && <p className="mt-2 break-all font-mono text-xs text-ink-2">{line.shown}</p>}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void save();
        }}
      >
        <input
          className="field"
          type={line.secret ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={line.state === "missing" ? "Paste it here" : "Paste a new one to replace it"}
          aria-label={line.label}
        />
        <button className="btn btn-primary btn-sm shrink-0" disabled={!!busy || !value.trim()}>
          Save
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {line.checkable && line.state !== "missing" && (
          <button className="btn btn-sm" disabled={!!busy} onClick={() => run("check", () => api<{ ok: boolean; detail: string }>("/api/studio/keys/check", { body: { env: line.env } }).then((r) => (setCheck(r), r)))}>
            Check it works
          </button>
        )}
        {line.state === "studio" && (
          <button className="btn btn-quiet btn-sm text-rust" disabled={!!busy} onClick={() => confirm(`Remove ${line.label} from the Studio?`) && run("remove", () => api(`/api/studio/keys?env=${line.env}`, { method: "DELETE" }).then(onChange), "Removed")}>
            Remove
          </button>
        )}
        {check && <span className={`text-xs ${check.ok ? "text-moss" : "text-rust"}`}>{check.detail}</span>}
      </div>
    </li>
  );
}
