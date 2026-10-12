"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Globe2,
  Info,
  Loader2,
  MapPin,
  Save,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressPanel } from "@/components/layout/progress-panel";
import { WizardStepper } from "@/components/wizard/wizard-stepper";
import {
  chartWizardSchema,
  WIZARD_STEPS,
  type ChartWizardValues,
  HOUSE_SYSTEMS,
} from "@/components/wizard/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCreateChart } from "@/hooks/use-charts";
import { useChartDraft } from "@/hooks/use-chart-draft";
import { completeMatch, searchPlaces, type GeoMatch } from "@/lib/geo";
import {
  LANGUAGE_LABELS,
  getReadingLanguage,
  setReadingLanguage,
  type ReadingLanguage,
} from "@/lib/reading-prefs";

import { cn } from "@/lib/utils";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/interpretation/ai-models";

const DEFAULT_VALUES: ChartWizardValues = {
  firstName: "",
  lastName: "",
  gender: "",
  notes: "",
  birthDate: "",
  birthTime: "",
  unknownTime: false,
  birthPlace: "",
  country: "",
  timezone: "",
  houseSystem: "Placidus",
  aiModel: DEFAULT_AI_MODEL,
};

export default function NewChartPage() {
  const router = useRouter();
  const createChart = useCreateChart();
  const { draft, hydrated, saveDraft, clearDraft } = useChartDraft();

  const [step, setStep] = useState(0);
  const [saveNotice, setSaveNotice] = useState<{ chartId: string; message: string } | null>(null);
  const [draftFlash, setDraftFlash] = useState(false);
  const [restored, setRestored] = useState(false);

  const form = useForm<ChartWizardValues>({
    resolver: zodResolver(chartWizardSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  // Restore a locally saved draft once storage has been read.
  useEffect(() => {
    if (!hydrated || !draft || restored) return;
    form.reset({
      ...DEFAULT_VALUES,
      ...draft.personal,
      ...draft.dateTime,
      ...draft.location,
      ...draft.configuration,
    });
    setStep(Math.min(draft.step, WIZARD_STEPS.length - 1));
    setRestored(true);
  }, [hydrated, draft, restored, form]);

  const toDraftShape = () => {
    const v = form.getValues();
    return {
      personal: {
        firstName: v.firstName,
        lastName: v.lastName,
        gender: v.gender,
        notes: v.notes,
      },
      dateTime: {
        birthDate: v.birthDate,
        birthTime: v.birthTime,
        unknownTime: v.unknownTime,
      },
      location: {
        birthPlace: v.birthPlace,
        country: v.country,
        timezone: v.timezone,
        latitude: v.latitude,
        longitude: v.longitude,
        utcOffset: v.utcOffset,
      },
      configuration: { houseSystem: v.houseSystem, aiModel: v.aiModel },
      step,
    };
  };

  const handleSaveDraft = () => {
    saveDraft(toDraftShape());
    setDraftFlash(true);
    window.setTimeout(() => setDraftFlash(false), 2200);
  };

  const goNext = async () => {
    const fields = WIZARD_STEPS[step].fields as unknown as (keyof ChartWizardValues)[];
    const valid = await form.trigger(fields, { shouldFocus: true });
    if (!valid) return;
    if (step < WIZARD_STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    // Final step: validate everything, then hand off to the service layer.
    const allValid = await form.trigger();
    if (!allValid) return;
    const shape = toDraftShape();
    createChart.mutate(
      {
        personal: shape.personal,
        dateTime: shape.dateTime,
        location: shape.location,
        configuration: shape.configuration,
      },
      {
        onSuccess: (result) => {
          const chosen = form.getValues("readingLanguage");
          if (typeof chosen === "string" && chosen.length > 0) {
            setReadingLanguage(chosen as ReadingLanguage);
          }
          clearDraft();
          if (result.persisted) {
            router.push(`/charts/${result.chart.id}`);
          } else {
            // NEVER silently lose a chart: explain where it lives and why.
            setSaveNotice({
              chartId: result.chart.id,
              message:
                result.storageError ??
                "The chart was kept in this session only and will disappear when the server restarts.",
            });
          }
        },
      },
    );
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const progressItems = WIZARD_STEPS.map((s, index) => ({
    label: s.label,
    state:
      index < step ? ("complete" as const) : index === step ? ("active" as const) : ("pending" as const),
  }));
  const overall = Math.round((step / WIZARD_STEPS.length) * 100);

  return (
    <AppShell
      sidebarPanel={
        <ProgressPanel
          title="Chart Setup"
          items={progressItems}
          overall={overall}
          overallLabel="Setup progress"
        />
      }
    >
      <PageHeader
        crumbs={[
          { label: "Workspace" },
          { label: "Birth Charts", href: "/charts" },
          { label: "New Chart", accent: true },
        ]}
        title="Create Birth Chart"
        actions={
          <Button variant="secondary" size="sm" onClick={handleSaveDraft}>
            {draftFlash ? <Check size={14} className="text-success" /> : <Save size={14} />}
            {draftFlash ? "Draft saved" : "Save as Draft"}
          </Button>
        }
      />

      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            {saveNotice !== null && (
              <Card className="border-warning/40 bg-warning-soft/60 p-5">
                <p className="text-xs font-semibold text-ink">
                  Chart created — but NOT saved to your account
                </p>
                <p className="pt-1 text-xs leading-relaxed text-ink-secondary">
                  {saveNotice.message}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => router.push(`/charts/${saveNotice.chartId}`)}>
                    Open it anyway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSaveNotice(null)}>
                    Dismiss
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-5">
              <WizardStepper currentStep={step} />
            </Card>

            <FormProvider {...form}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void goNext();
                }}
                noValidate
              >
                <Card className="p-6">
                  {step === 0 && <PersonalStep />}
                  {step === 1 && <DateTimeStep />}
                  {step === 2 && <LocationStep />}
                  {step === 3 && <ConfigurationStep />}

                  <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={goBack}
                      disabled={step === 0 || createChart.isPending}
                    >
                      <ArrowLeft size={14} />
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-faint">
                        Step {step + 1} of {WIZARD_STEPS.length}
                      </span>
                      <Button type="submit" disabled={createChart.isPending}>
                        {createChart.isPending ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Generating chart…
                          </>
                        ) : step === WIZARD_STEPS.length - 1 ? (
                          <>
                            <Sparkles size={14} />
                            Generate Chart
                          </>
                        ) : (
                          <>
                            Continue
                            <ArrowRight size={14} />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              </form>

              <SummaryRailMobile />
            </FormProvider>
          </div>

          <FormProvider {...form}>
            <SummaryRail />
          </FormProvider>
        </div>
      </main>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="pt-1 text-xs text-danger">
      {message}
    </p>
  );
}

function StepHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
        {icon}
      </span>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="pt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

function PersonalStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ChartWizardValues>();
  return (
    <fieldset>
      <StepHeading
        icon={<Sparkles size={16} />}
        title="Personal details"
        description="Who is this chart for? Names appear on readings and reports."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" placeholder="e.g. Clara" autoComplete="off" {...register("firstName")} />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div>
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" placeholder="e.g. Mercer" autoComplete="off" {...register("lastName")} />
          <FieldError message={errors.lastName?.message} />
        </div>
        <div>
          <Label htmlFor="gender">Gender (optional)</Label>
          <Select id="gender" {...register("gender")}>
            <option value="">Prefer not to say</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Other">Other</option>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            rows={3}
            placeholder="Context for this chart — client details, session focus…"
            {...register("notes")}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </div>
    </fieldset>
  );
}

function DateTimeStep() {
  const {
    register,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ChartWizardValues>();
  const unknownTime = watch("unknownTime");

  return (
    <fieldset>
      <StepHeading
        icon={<CalendarDays size={16} />}
        title="Birth date & time"
        description="Exact time enables house placements and the Ascendant."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="birthDate">Birth date</Label>
          <Input id="birthDate" type="date" {...register("birthDate")} />
          <FieldError message={errors.birthDate?.message} />
        </div>
        <div>
          <Label htmlFor="birthTime">Birth time (local)</Label>
          <div className="relative">
            <Input
              id="birthTime"
              type="time"
              disabled={unknownTime}
              className={cn(unknownTime && "opacity-50")}
              {...register("birthTime")}
            />
            <Clock3
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
          </div>
          <FieldError message={errors.birthTime?.message} />
        </div>
      </div>

      <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <p className="text-xs font-medium text-ink">Birth time unknown</p>
          <p className="pt-0.5 text-xs text-ink-muted">
            We&rsquo;ll cast a noon chart. House placements and the Ascendant will be
            marked approximate.
          </p>
        </div>
        <Switch
          checked={unknownTime}
          aria-label="Birth time unknown"
          onCheckedChange={(checked) => {
            setValue("unknownTime", checked, { shouldValidate: false });
            if (checked) {
              setValue("birthTime", "");
              clearErrors("birthTime");
            }
          }}
        />
      </div>
    </fieldset>
  );
}

function LocationStep() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ChartWizardValues>();
  const birthPlace = watch("birthPlace");
  const latitude = watch("latitude");
  const longitude = watch("longitude");
  const utcOffset = watch("utcOffset");

  const [suggestions, setSuggestions] = useState<GeoMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GeoMatch | null>(null);

  // Debounced live search against the geocoding service.
  useEffect(() => {
    const query = (birthPlace ?? "").trim();
    if (query.length < 2 || (selected !== null && selected.place === query)) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPlaces(query).then((results) => {
        setSuggestions(results);
        setSearching(false);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [birthPlace, selected]);

  const choose = async (picked: GeoMatch) => {
    setSuggestions([]);
    let match = picked;
    if (picked.needsDetails === true) {
      setSearching(true);
      match = await completeMatch(picked);
      setSearching(false);
    }
    setSelected(match);
    setValue("birthPlace", match.place, { shouldValidate: true });
    setValue("country", match.country, { shouldValidate: true });
    // An empty timezone (lookup failed) is left for the astrologer to type.
    if (match.timezone !== "") setValue("timezone", match.timezone, { shouldValidate: true });
    setValue("latitude", match.latitude);
    setValue("longitude", match.longitude);
    setValue("utcOffset", match.utcOffset !== "" ? match.utcOffset : undefined);
  };

  const located = selected !== null && selected.place === (birthPlace ?? "").trim();

  return (
    <fieldset>
      <StepHeading
        icon={<MapPin size={16} />}
        title="Birth location"
        description="Search a city or a full address, or paste a Google Plus Code or coordinates. Coordinates and timezone are filled automatically."
      />
      <div>
        <Label htmlFor="birthPlace">Birth place</Label>
        <div className="relative">
          <Input
            id="birthPlace"
            placeholder="City, address, Plus Code (8J3Q3XM4+PV) or 48.85, 2.35"
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="birthplace-suggestions"
            onKeyDown={(event) => {
              if (event.key === "Escape") setSuggestions([]);
            }}
            {...register("birthPlace", {
              onChange: () => {
                if (selected !== null) setSelected(null);
              },
            })}
          />
          {searching && (
            <Loader2
              size={13}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-faint"
            />
          )}
          {!searching && located && (
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
              <Check size={10} />
              Located
            </span>
          )}
          {suggestions.length > 0 && (
            <ul
              id="birthplace-suggestions"
              role="listbox"
              className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-raised shadow-pop"
            >
              {suggestions.map((match) => (
                <li key={`${match.latitude}-${match.longitude}`} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => void choose(match)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs text-ink-secondary transition-colors hover:bg-surface-overlay"
                  >
                    <span className="min-w-0 truncate">{match.place}</span>
                    {match.source !== undefined && match.source !== "city" && (
                      <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
                        {match.source === "address" ? "Address" : "Coordinates"}
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                      {Math.abs(match.latitude).toFixed(2)}° / {Math.abs(match.longitude).toFixed(2)}°
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FieldError message={errors.birthPlace?.message} />
        {!located && (birthPlace ?? "").trim().length >= 2 && !searching && suggestions.length === 0 && (
          <p className="pt-1 text-xs text-ink-faint">
            No match yet. Try a nearby town, the full address, or paste the Plus Code
            from Google Maps (e.g. 8J3Q3XM4+PV) or coordinates (e.g. 48.8566, 2.3522).
          </p>
        )}
      </div>

      {located && selected !== null && (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          <GeoCell label="Latitude" value={`${Math.abs(selected.latitude).toFixed(4)}° ${selected.latitude >= 0 ? "N" : "S"}`} />
          <GeoCell label="Longitude" value={`${Math.abs(selected.longitude).toFixed(4)}° ${selected.longitude >= 0 ? "E" : "W"}`} />
          <GeoCell label="Elevation" value={`${selected.elevationMeters} m`} />
          <GeoCell label="UTC offset" value={selected.utcOffset !== "" ? selected.utcOffset : "Enter timezone below"} />
        </div>
      )}
      {!located && latitude !== undefined && longitude !== undefined && (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          <GeoCell label="Latitude" value={`${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`} />
          <GeoCell label="Longitude" value={`${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`} />
          <GeoCell label="UTC offset" value={utcOffset ?? "—"} />
        </div>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" placeholder="Filled from the search" {...register("country")} />
          <FieldError message={errors.country?.message} />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            placeholder="e.g. Europe/Paris"
            {...register("timezone")}
          />
          <FieldError message={errors.timezone?.message} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="readingLanguage">Reading language</Label>
          <Select
            id="readingLanguage"
            defaultValue={getReadingLanguage()}
            {...register("readingLanguage")}
          >
            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          <p className="pt-1 text-xs text-ink-faint">
            All readings and reports for this chart will be written in this language.
          </p>
        </div>
      </div>
    </fieldset>
  );
}

function GeoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="pt-1 font-mono text-xs text-ink">{value}</p>
    </div>
  );
}

const HOUSE_SYSTEM_NOTES: Record<string, string> = {
  Placidus: "Time-based quadrant system. The most widely used default in modern practice.",
  "Whole Sign": "Each house spans one full sign. The oldest system, favoured in traditional work.",
  Koch: "Birthplace-focused quadrant system, popular in central Europe.",
  Equal: "Twelve equal 30° houses from the Ascendant. Robust at high latitudes.",
};

function ConfigurationStep() {
  const { register, watch } = useFormContext<ChartWizardValues>();
  const values = watch();

  return (
    <fieldset>
      <StepHeading
        icon={<Globe2 size={16} />}
        title="Configuration"
        description="Calculation settings for this chart. You can change them later."
      />
      <div className="max-w-sm">
        <Label htmlFor="houseSystem">House system</Label>
        <Select id="houseSystem" {...register("houseSystem")}>
          {HOUSE_SYSTEMS.map((hs) => (
            <option key={hs} value={hs}>
              {hs}
            </option>
          ))}
        </Select>
        <p className="pt-2 text-xs text-ink-muted">
          {HOUSE_SYSTEM_NOTES[values.houseSystem] ?? ""}
        </p>
      </div>

      <div className="mt-6 max-w-sm">
        <Label htmlFor="aiModel">AI model</Label>
        <Select id="aiModel" {...register("aiModel")}>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
        <p className="pt-2 text-xs text-ink-muted">
          {AI_MODELS.find((m) => m.id === values.aiModel)?.note ?? ""} Writes every
          reading and interpretation for this chart.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <p className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Review
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <SummaryRow label="Name" value={[values.firstName, values.lastName].filter(Boolean).join(" ") || "—"} />
          <SummaryRow label="Birth date" value={values.birthDate || "—"} />
          <SummaryRow
            label="Birth time"
            value={values.unknownTime ? "Unknown (noon chart)" : values.birthTime || "—"}
          />
          <SummaryRow label="Place" value={values.birthPlace || "—"} />
          <SummaryRow label="Timezone" value={values.timezone || "—"} />
          <SummaryRow label="House system" value={values.houseSystem} />
        </dl>
      </div>
    </fieldset>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="truncate text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

function SummaryRail() {
  return (
    <aside className="hidden min-w-0 space-y-4 lg:block">
      <LiveSummaryCard />
      <ChartPreviewCard />
      <PrecisionCard />
    </aside>
  );
}

function SummaryRailMobile() {
  return (
    <div className="space-y-4 lg:hidden">
      <LiveSummaryCard />
      <PrecisionCard />
    </div>
  );
}

function LiveSummaryCard() {
  const { watch } = useFormContext<ChartWizardValues>();
  const values = watch();
  const name = [values.firstName, values.lastName].filter(Boolean).join(" ");

  return (
    <Card className="p-4">
      <p className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Chart Summary
      </p>
      <dl className="space-y-2 text-xs">
        <SummaryRow label="Subject" value={name || "—"} />
        <SummaryRow label="Date" value={values.birthDate || "—"} />
        <SummaryRow
          label="Time"
          value={values.unknownTime ? "Unknown" : values.birthTime || "—"}
        />
        <SummaryRow label="Location" value={values.birthPlace || "—"} />
        <SummaryRow label="Houses" value={values.houseSystem} />
      </dl>
    </Card>
  );
}

function ChartPreviewCard() {
  return (
    <Card className="p-4">
      <p className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Chart Preview
      </p>
      <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface">
        <div className="px-6 text-center">
          <div className="mx-auto mb-3 h-16 w-16 rounded-full border-2 border-dashed border-line-strong" />
          <p className="text-xs text-ink-faint">
            The wheel is drawn once the chart is generated.
          </p>
        </div>
      </div>
    </Card>
  );
}

function PrecisionCard() {
  return (
    <Card className="border-accent/20 bg-accent-soft/40 p-4">
      <div className="flex gap-3">
        <Info size={15} className="mt-0.5 shrink-0 text-accent-hover" />
        <div>
          <p className="text-xs font-semibold text-ink">Precision matters</p>
          <p className="pt-1 text-xs leading-relaxed text-ink-muted">
            A four-minute difference in birth time can shift the Ascendant by a
            degree. If the time is uncertain, mark it unknown rather than
            guessing.
          </p>
        </div>
      </div>
    </Card>
  );
}
