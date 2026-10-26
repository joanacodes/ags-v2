"use client";

/**
 * The Astro Study test, first page (/test, public, no account; TASK-0013): who you are, when and where
 * you were born, how long a test. Sending it builds the chart and the questions, then opens the test.
 * ?lang=fr shows it in French (and writes the questions in French); ?src=threads records where the
 * visitor came from.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeMatch, searchPlaces, type GeoMatch } from "@/lib/geo";
import { STUDY_COPY, STUDY_PRIVACY_URL } from "@/study/copy";
import { STUDY_LENGTHS, type StudyLanguage, type StudyLength } from "@/study/quiz";

export default function StudyTestPage() {
  return (
    <Suspense fallback={null}>
      <StartTest />
    </Suspense>
  );
}

function StartTest() {
  const router = useRouter();
  const params = useSearchParams();
  const language: StudyLanguage = params.get("lang") === "fr" ? "fr" : "en";
  const source = params.get("src") ?? params.get("utm_source");
  const t = STUDY_COPY[language];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [noTime, setNoTime] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState<GeoMatch | null>(null);
  const [length, setLength] = useState<StudyLength>("medium");
  const [consent, setConsent] = useState(false);
  const [news, setNews] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = placeQuery.trim();
    if (query.length < 2 || (place !== null && place.place === query)) {
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
  }, [placeQuery, place]);

  const choose = async (picked: GeoMatch) => {
    setSuggestions([]);
    let match = picked;
    if (picked.needsDetails === true) {
      setSearching(true);
      match = await completeMatch(picked);
      setSearching(false);
    }
    setPlace(match);
    setPlaceQuery(match.place);
  };

  const located = place !== null && place.place === placeQuery.trim() && place.timezone !== "";
  const ready =
    name.trim() !== "" &&
    /\S+@\S+\.\S+/.test(email) &&
    /^\d{4}-\d{2}-\d{2}$/.test(birthDate) &&
    (noTime || /^\d{2}:\d{2}$/.test(birthTime)) &&
    located &&
    consent;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || place === null) {
      setError(t.fixFields);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/study/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          birthDate,
          birthTime: noTime ? null : birthTime,
          place: {
            label: place.place,
            country: place.country,
            timezone: place.timezone,
            latitude: place.latitude,
            longitude: place.longitude,
          },
          length,
          language,
          consent: true,
          news,
          source,
          website,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { sessionId?: string; error?: { code?: string } };
      if (!response.ok || typeof body.sessionId !== "string") {
        const code = body.error?.code ?? "default";
        setError(t.problems[code] ?? t.problems.default ?? null);
        setBusy(false);
        return;
      }
      router.push(`/test/${body.sessionId}`);
    } catch {
      setError(t.problems.default ?? null);
      setBusy(false);
    }
  };

  const otherLanguageHref = language === "fr" ? "/test" : "/test?lang=fr";

  return (
    <div className="min-h-screen bg-surface-sunken pb-16">
      <header className="mx-auto flex max-w-2xl items-center gap-2.5 px-5 py-5">
        <span className="font-serif text-lg text-ink">{t.brand}</span>
        <span className="flex-1" />
        <Link href={otherLanguageHref} className="text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          {t.otherLanguage}
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        <h1 className="pt-4 font-serif text-3xl text-ink sm:text-4xl">{t.title}</h1>
        {t.intro.map((line) => (
          <p key={line} className="pt-3 text-sm leading-relaxed text-ink-secondary">
            {line}
          </p>
        ))}

        <Card className="mt-6 p-5 sm:p-6">
          <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="name" hint={t.nameHint}>{t.name}</Label>
                <Input id="name" autoComplete="nickname" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="email" hint={t.emailHint}>{t.email}</Label>
                <Input id="email" type="email" autoComplete="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="birthDate">{t.birthDate}</Label>
                <Input id="birthDate" type="date" autoComplete="bday" min="1900-01-01" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="birthTime">{t.birthTime}</Label>
                <Input id="birthTime" type="time" value={birthTime} disabled={noTime} onChange={(e) => setBirthTime(e.target.value)} />
                <label className="mt-2 flex items-start gap-2 text-xs text-ink-secondary">
                  <input type="checkbox" className="mt-0.5" checked={noTime} onChange={(e) => setNoTime(e.target.checked)} />
                  <span>
                    {t.noTime}
                    {noTime && <span className="block text-ink-faint">{t.noTimeHint}</span>}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <Label htmlFor="place" hint={t.placeHint}>{t.place}</Label>
              <div className="relative">
                <Input
                  id="place"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={suggestions.length > 0}
                  aria-controls="place-suggestions"
                  value={placeQuery}
                  onChange={(e) => {
                    setPlaceQuery(e.target.value);
                    if (place !== null) setPlace(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSuggestions([]);
                  }}
                />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-faint" />}
                {!searching && located && (
                  <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
                    <Check size={10} />
                    {t.placeFound}
                  </span>
                )}
                {suggestions.length > 0 && (
                  <ul id="place-suggestions" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-raised shadow-pop">
                    {suggestions.map((match) => (
                      <li key={`${match.latitude}-${match.longitude}`} role="option" aria-selected={false}>
                        <button
                          type="button"
                          onClick={() => void choose(match)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs text-ink-secondary transition-colors hover:bg-surface-overlay"
                        >
                          <span className="min-w-0 truncate">{match.place}</span>
                          <span className="shrink-0 text-[10px] text-ink-faint">{match.country}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {!located && !searching && placeQuery.trim().length >= 2 && suggestions.length === 0 && (
                <p className="pt-1 text-xs text-ink-faint">{t.placeNone}</p>
              )}
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-ink-secondary">{t.length}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {STUDY_LENGTHS.map((option) => (
                  <label
                    key={option}
                    className={`cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                      length === option ? "border-accent bg-accent-soft/40" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <input type="radio" name="length" value={option} checked={length === option} onChange={() => setLength(option)} className="sr-only" />
                    <span className="block text-sm font-medium text-ink">{t.lengths[option].title}</span>
                    <span className="block text-xs text-ink-muted">{t.lengths[option].detail}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2.5">
              <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-secondary">
                <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                <span>
                  {t.consent}{" "}
                  <a href={STUDY_PRIVACY_URL[language]} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                    {t.privacy}
                  </a>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-secondary">
                <input type="checkbox" className="mt-0.5" checked={news} onChange={(e) => setNews(e.target.checked)} />
                <span>{t.news}</span>
              </label>
            </div>

            {/* Never seen by people: robots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            {error !== null && <p className="text-sm text-danger" role="alert">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : t.start}
              </Button>
              {busy && <p className="text-xs text-ink-muted">{t.preparing}</p>}
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
