"use client";

/**
 * Bulk import: drop photos or spreadsheets of birth data, let the AI read
 * them, check and correct every row, then create the charts and write all
 * the charts one person at a time. Readings are written afterwards from each
 * chart's page ("Generate all categories").
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileImage, Loader2, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { confirmDialog } from "@/components/common/confirm-dialog";
import { HOUSE_SYSTEMS } from "@/components/wizard/schema";
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModelId } from "@/interpretation/ai-models";
import type { ExtractedPerson } from "@/bulk/extracted";
import { aiFetch } from "@/lib/ai-fetch";
import { completeMatch, searchPlaces, type GeoMatch } from "@/lib/geo";
import { getReadingLanguage } from "@/lib/reading-prefs";
import { requestWakeLock } from "@/hooks/use-generate-all";
import { ChartService } from "@/services/chart-service";
import { chartKeys } from "@/hooks/use-charts";
import { cn } from "@/lib/utils";
import type { HouseSystem } from "@/types";

type RowStatus =
  | { kind: "draft" }
  | { kind: "working"; step: string }
  | { kind: "done"; chartId: string; warning?: string }
  | { kind: "error"; message: string; chartId?: string };

interface Row extends ExtractedPerson {
  id: string;
  source: string;
  unknownTime: boolean;
  placeQuery: string;
  place: GeoMatch | null;
  status: RowStatus;
}

interface FileJob {
  id: string;
  name: string;
  state: "waiting" | "reading" | "done" | "error";
  message?: string;
}

const MAX_SIDE = 1568;
/** Files read together in one AI request (so data spread over pictures is combined). */
const BATCH_FILES = 20;
const BATCH_CHARS = 20_000_000;

type FilePayload =
  | { kind: "text"; fileName: string; text: string }
  | { kind: "image"; fileName: string; mediaType: "image/jpeg"; data: string };

/** Phones often name every picked photo "image.jpg": make names unique. */
function uniqueNames(files: readonly File[], taken: readonly string[]): string[] {
  const used = new Set(taken);
  return files.map((file) => {
    let name = file.name || "photo.jpg";
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
      let n = 2;
      while (used.has(`${base} (${n})${ext}`)) n += 1;
      name = `${base} (${n})${ext}`;
    }
    used.add(name);
    return name;
  });
}

let rowCounter = 0;
function newRow(person: Partial<ExtractedPerson>, source: string): Row {
  rowCounter += 1;
  return {
    id: `row-${Date.now()}-${rowCounter}`,
    firstName: person.firstName ?? "",
    lastName: person.lastName ?? "",
    birthDate: person.birthDate ?? "",
    birthTime: person.birthTime ?? "",
    birthPlace: person.birthPlace ?? "",
    notes: person.notes ?? "",
    sources: person.sources ?? [],
    source: person.sources !== undefined && person.sources.length > 0 ? person.sources.join(", ") : source,
    unknownTime: (person.birthTime ?? "") === "" && (person.birthDate ?? "") !== "",
    placeQuery: person.birthPlace ?? "",
    place: null,
    status: { kind: "draft" },
  };
}

/** Downscale a photo to what the AI needs (≤ 1568 px), as base64 JPEG. */
async function imageToJpegBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image format can't be opened in this browser."));
      image.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Could not prepare the image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isTextFile(file: File): boolean {
  return /\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith("text/");
}

function rowProblems(row: Row): string[] {
  const problems: string[] = [];
  if (row.firstName.trim() === "") problems.push("first name");
  if (row.lastName.trim() === "") problems.push("last name");
  if (row.birthDate === "") problems.push("birth date");
  if (!row.unknownTime && row.birthTime === "") problems.push("birth time (or tick unknown)");
  if (row.place === null) problems.push("birth place (pick a match)");
  else if (row.place.timezone === "") problems.push("timezone of the place");
  return problems;
}

export default function BulkImportPage() {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileJob[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [model, setModel] = useState<AiModelId>(DEFAULT_AI_MODEL);
  const [houseSystem, setHouseSystem] = useState<HouseSystem>("Placidus");
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  // Leaving mid-run would stop the queue: ask first.
  useEffect(() => {
    if (!running && !reading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running, reading]);

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  /** Pre-select the best place match for freshly extracted rows. */
  const autoLocate = async (newRows: Row[]) => {
    for (const row of newRows) {
      if (row.placeQuery.trim().length < 2) continue;
      const [first] = await searchPlaces(row.placeQuery);
      if (first === undefined) continue;
      const complete = await completeMatch(first);
      updateRow(row.id, { place: complete, placeQuery: complete.place });
    }
  };

  const addFiles = async (list: FileList | File[]) => {
    const picked = Array.from(list);
    if (picked.length === 0) return;
    const names = uniqueNames(picked, files.map((f) => f.name));
    const jobs: FileJob[] = picked.map((_, i) => ({
      id: `file-${Date.now()}-${i}`,
      name: names[i],
      state: "waiting",
    }));
    const setJob = (ids: readonly string[], patch: Partial<FileJob>) =>
      setFiles((current) => current.map((f) => (ids.includes(f.id) ? { ...f, ...patch } : f)));
    setFiles((current) => [...current, ...jobs]);
    setReading(true);

    // Prepare every file first (downscale photos), then send them together.
    const prepared: { job: FileJob; payload: FilePayload }[] = [];
    for (const [i, file] of picked.entries()) {
      const job = jobs[i];
      try {
        const payload: FilePayload = isTextFile(file)
          ? { kind: "text", fileName: job.name, text: await file.text() }
          : { kind: "image", fileName: job.name, mediaType: "image/jpeg", data: await imageToJpegBase64(file) };
        prepared.push({ job, payload });
      } catch (error) {
        setJob([job.id], { state: "error", message: error instanceof Error ? error.message : "Could not open this file." });
      }
    }

    const batches: (typeof prepared)[] = [];
    let size = 0;
    for (const item of prepared) {
      const itemSize = item.payload.kind === "image" ? item.payload.data.length : item.payload.text.length;
      const last = batches[batches.length - 1];
      if (last === undefined || last.length >= BATCH_FILES || size + itemSize > BATCH_CHARS) {
        batches.push([item]);
        size = itemSize;
      } else {
        last.push(item);
        size += itemSize;
      }
    }

    for (const batch of batches) {
      const ids = batch.map((b) => b.job.id);
      setJob(ids, { state: "reading" });
      try {
        const response = await aiFetch("/api/bulk/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: batch.map((b) => b.payload) }),
        });
        const data = (await response.json()) as { people?: ExtractedPerson[]; error?: { message?: string } };
        if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status})`);
        const fallbackSource = batch.length === 1 ? batch[0].job.name : `${batch.length} files`;
        const found = (data.people ?? []).map((person) => newRow(person, fallbackSource));
        setRows((current) => [...current, ...found]);
        for (const { job } of batch) {
          const count = found.filter((row) => row.sources.includes(job.name)).length;
          setJob([job.id], {
            state: "done",
            message:
              count > 0
                ? `${count} person${count > 1 ? "s" : ""}`
                : found.length > 0 && found.every((row) => row.sources.length === 0)
                  ? "Read"
                  : "No birth data found",
          });
        }
        void autoLocate(found);
      } catch (error) {
        setJob(ids, { state: "error", message: error instanceof Error ? error.message : "Could not read these files." });
      }
    }
    setReading(false);
  };

  const ready = rows.filter((row) => row.status.kind === "draft" && rowProblems(row).length === 0);
  const blocked = rows.filter((row) => row.status.kind === "draft" && rowProblems(row).length > 0);

  const runAll = async () => {
    const ok = await confirmDialog({
      title: `Create ${ready.length} chart${ready.length > 1 ? "s" : ""}?`,
      message:
        "Only the birth charts are calculated now (a few seconds each). Then open each chart and tap \"Generate all categories\" to write its readings." +
        (blocked.length > 0 ? `\n\n${blocked.length} row${blocked.length > 1 ? "s" : ""} with missing data will be skipped.` : ""),
      confirmLabel: "Start",
      cancelLabel: "Not yet",
    });
    if (!ok) return;
    setRunning(true);
    const wakeLock = await requestWakeLock();
    const language = getReadingLanguage();
    for (const row of ready) {
      const place = row.place as GeoMatch;
      updateRow(row.id, { status: { kind: "working", step: "Creating the chart…" } });
      let chartId: string | undefined;
      try {
        const created = await ChartService.createChart({
          personal: { firstName: row.firstName.trim(), lastName: row.lastName.trim(), notes: row.notes || undefined },
          dateTime: { birthDate: row.birthDate, birthTime: row.unknownTime ? "" : row.birthTime, unknownTime: row.unknownTime },
          location: {
            birthPlace: place.place,
            country: place.country,
            timezone: place.timezone,
            latitude: place.latitude,
            longitude: place.longitude,
            utcOffset: place.utcOffset || undefined,
          },
          configuration: { houseSystem, aiModel: model, language },
        });
        chartId = created.chart.id;
        if (created.chart.planets.length === 0) {
          throw new Error("The chart could not be calculated (astrology service). Open it to retry.");
        }
        updateRow(row.id, {
          status: { kind: "done", chartId, warning: created.persisted ? undefined : created.storageError },
        });
      } catch (error) {
        updateRow(row.id, {
          status: { kind: "error", chartId, message: error instanceof Error ? error.message : "Failed." },
        });
      }
    }
    void wakeLock?.release().catch(() => undefined);
    setRunning(false);
    void queryClient.invalidateQueries({ queryKey: chartKeys.all });
  };

  const doneCount = rows.filter((r) => r.status.kind === "done").length;

  return (
    <AppShell>
      <PageHeader
        crumbs={[{ label: "Birth Charts", href: "/charts" }, { label: "Bulk import", accent: true }]}
        title="Bulk import"
      />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* 1. Drop files */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">1. Drop photos or spreadsheets</h2>
            <p className="pt-1 text-xs leading-relaxed text-ink-muted">
              Screenshots of messages, photos of notes or forms, or CSV files. Drop them all at
              once: the AI reads them together, so a person whose details are spread over several
              screenshots comes back as one entry. You check everything before anything is created.
            </p>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void addFiles(event.dataTransfer.files);
              }}
              className={cn(
                "mt-4 flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors",
                dragging ? "border-accent bg-accent-soft/40" : "border-line",
              )}
            >
              <Upload size={20} className="text-accent-hover" />
              <p className="text-sm text-ink-secondary">Drop files here</p>
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={running}>
                <FileImage size={13} />
                Choose files
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,.csv,.tsv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files !== null) void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center gap-2">
                    {file.state === "reading" || file.state === "waiting" ? (
                      <Loader2 size={12} className={cn("text-ink-faint", file.state === "reading" && "animate-spin")} />
                    ) : file.state === "done" ? (
                      <Check size={12} className="text-success" />
                    ) : (
                      <AlertTriangle size={12} className="text-danger" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-ink-secondary">{file.name}</span>
                    <span className={cn("shrink-0", file.state === "error" ? "text-danger" : "text-ink-faint")}>
                      {file.state === "waiting" ? "Waiting" : file.state === "reading" ? "Reading…" : file.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 2. Review */}
          {rows.length > 0 && (
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">2. Check and correct</h2>
                <span className="text-xs text-ink-muted">
                  {ready.length} ready · {blocked.length} to complete
                  {doneCount > 0 ? ` · ${doneCount} done` : ""}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {rows.map((row) => (
                  <RowEditor
                    key={row.id}
                    row={row}
                    locked={running || row.status.kind !== "draft"}
                    onChange={(patch) => updateRow(row.id, patch)}
                    onRemove={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                disabled={running}
                onClick={() => setRows((current) => [...current, newRow({}, "Added by hand")])}
              >
                <Plus size={12} />
                Add a person
              </Button>
            </Card>
          )}

          {/* 3. Run */}
          {rows.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">3. Create the charts</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="bulk-model">AI model</Label>
                  <Select id="bulk-model" value={model} onChange={(e) => setModel(e.target.value as AiModelId)} disabled={running}>
                    {AI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bulk-houses">House system</Label>
                  <Select
                    id="bulk-houses"
                    value={houseSystem}
                    onChange={(e) => setHouseSystem(e.target.value as HouseSystem)}
                    disabled={running}
                  >
                    {HOUSE_SYSTEMS.map((hs) => (
                      <option key={hs} value={hs}>
                        {hs}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <p className="pt-3 text-xs leading-relaxed text-ink-muted">
                Only the birth charts are calculated here, a few seconds each. The AI model is saved
                with each chart for later. Then open each chart and tap “Generate all categories” to
                write its readings.
              </p>
              <Button
                variant="primary"
                className="mt-3 w-full sm:w-auto"
                disabled={running || reading || ready.length === 0}
                onClick={() => void runAll()}
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {running
                  ? "Creating the charts…"
                  : `Validate and create ${ready.length} chart${ready.length === 1 ? "" : "s"}`}
              </Button>
            </Card>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function RowEditor({
  row,
  locked,
  onChange,
  onRemove,
}: {
  row: Row;
  locked: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const problems = row.status.kind === "draft" ? rowProblems(row) : [];
  const id = row.id;
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        row.status.kind === "done"
          ? "border-success/40 bg-success-soft/30"
          : row.status.kind === "error"
            ? "border-danger/40"
            : problems.length > 0
              ? "border-warning/50"
              : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="min-w-0 truncate text-[11px] text-ink-faint">From {row.source}</span>
        <StatusChip status={row.status} problems={problems} />
        {!locked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this person"
            className="rounded-md p-1 text-ink-faint transition-colors hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <fieldset disabled={locked} className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-first`}>First name</Label>
          <Input id={`${id}-first`} value={row.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-last`}>Last name</Label>
          <Input id={`${id}-last`} value={row.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-date`}>Birth date</Label>
          <Input id={`${id}-date`} type="date" value={row.birthDate} onChange={(e) => onChange({ birthDate: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-time`}>Birth time</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-time`}
              type="time"
              value={row.unknownTime ? "" : row.birthTime}
              disabled={row.unknownTime}
              onChange={(e) => onChange({ birthTime: e.target.value })}
              className="flex-1"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={row.unknownTime}
                onChange={(e) => onChange({ unknownTime: e.target.checked })}
              />
              Unknown
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <PlaceField row={row} onChange={onChange} />
        </div>
      </fieldset>
      {row.notes !== "" && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft/60 px-2 py-1.5 text-[11px] text-ink">
          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-warning" />
          {row.notes}
        </p>
      )}
    </div>
  );
}

function StatusChip({ status, problems }: { status: RowStatus; problems: string[] }) {
  if (status.kind === "working") {
    return (
      <span className="flex flex-1 items-center justify-end gap-1.5 text-[11px] text-accent-hover">
        <Loader2 size={11} className="animate-spin" />
        {status.step}
      </span>
    );
  }
  if (status.kind === "done") {
    return (
      <span className="flex flex-1 items-center justify-end gap-2 text-[11px] text-success">
        <Check size={11} />
        Done
        <Link href={`/charts/${status.chartId}`} className="underline underline-offset-2">
          Open
        </Link>
        {status.warning !== undefined && <span className="text-warning">({status.warning})</span>}
      </span>
    );
  }
  if (status.kind === "error") {
    return (
      <span className="flex flex-1 items-center justify-end gap-2 text-right text-[11px] text-danger">
        {status.message}
        {status.chartId !== undefined && (
          <Link href={`/charts/${status.chartId}`} className="underline underline-offset-2">
            Open
          </Link>
        )}
      </span>
    );
  }
  return (
    <span className={cn("flex-1 text-right text-[11px]", problems.length > 0 ? "text-warning" : "text-success")}>
      {problems.length > 0 ? `Missing: ${problems.join(", ")}` : "Ready"}
    </span>
  );
}

function PlaceField({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const [suggestions, setSuggestions] = useState<GeoMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const query = row.placeQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPlaces(query).then((results) => {
        setSuggestions(results);
        setSearching(false);
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [row.placeQuery, editing]);

  const choose = async (match: GeoMatch) => {
    setSuggestions([]);
    setEditing(false);
    setSearching(true);
    const complete = await completeMatch(match);
    setSearching(false);
    onChange({ place: complete, placeQuery: complete.place });
  };

  return (
    <div className="relative">
      <Label htmlFor={`${row.id}-place`}>Birth place</Label>
      <div className="relative">
        <Input
          id={`${row.id}-place`}
          value={row.placeQuery}
          placeholder="City, address, Plus Code or coordinates"
          autoComplete="off"
          onChange={(e) => {
            setEditing(true);
            onChange({ placeQuery: e.target.value, place: null });
          }}
        />
        {searching && (
          <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-faint" />
        )}
        {!searching && row.place !== null && (
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
            <MapPin size={10} />
            {row.place.timezone || "no timezone"}
          </span>
        )}
      </div>
      {row.birthPlace !== "" && row.place === null && !editing && (
        <p className="pt-1 text-[11px] text-ink-faint">
          Written as “{row.birthPlace}”. Edit the field to search and pick a match.
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-raised shadow-pop">
          {suggestions.map((match) => (
            <li key={`${match.latitude}-${match.longitude}`}>
              <button
                type="button"
                onClick={() => void choose(match)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-ink-secondary hover:bg-surface-overlay"
              >
                <span className="min-w-0 truncate">{match.place}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                  {match.latitude.toFixed(2)}, {match.longitude.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
