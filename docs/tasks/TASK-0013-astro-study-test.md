# TASK-0013: The Astro Study test (blind self-recognition quiz)

## Status
Authorized by the architect, 2026-10-26. Phase 1 (solo test) implemented 2026-10-26; phase 2 (group
game) to follow. Before first use: the migration, two variables and the fake charts (DEPLOY.md).

## Purpose
Measure, at scale, whether people recognise their own chart when they don't know which description is
theirs: how accurate AGS readings are, and Western astrology with them. Each question shows three short
statements about one area of life; one is written from the participant's chart, two from fake charts.
Every test adds to a dataset the architect owns, keeps and publishes from.

## Decisions (architect, 2026-10-26)
- Free for participants. FreeAstroAPI and Claude costs are the architect's.
- The participant chooses the length: short (5 questions), medium (10) or long (20).
- Statements describe dynamics (what combinations do), never placements: no sign, planet, house, aspect,
  angle or point is ever named, so knowing one's chart gives no advantage.
- One option per question comes from the participant's chart. The two others come from fake charts made
  in advance, never from real participants: 30 of them, no more.
- The score is plain: questions recognised out of questions answered, beside chance (one in three).
- Participants' charts go into the architect's library. Each participant sees only their own, through
  the existing readee link (`/r/[token]`, password: birth date as DDMMYYYY). The architect sees everything.
- Everyone gets the full chart: after the test, every reading of the chart is queued automatically; the
  readee page already shows them and offers the PDF.
- At most 50 new tests per day (Paris day).
- Solo test first, group game second.
- The test is taken on the Astro Study site (`astrostudy.co.uk/test/`, `/fr/test/`), linked from its
  menu as "Take the test"; AGS is its back end. The site's page calls AGS's public study routes, which
  answer only pages from the site and its preview (CORS). AGS has no test pages of its own.
- News: an unticked box, "Send me news from The Astro Study", stored with its date. An opt-out box is
  not valid consent under the GDPR, and the existing-customer exception doesn't cover a free test.
  Every news email carries an unsubscribe link.

## Phase 1 — the solo test

### Flow
1. The test page on the Astro Study site (public, no account, EN/FR): name or nickname, email, birth
   date, birth time or "unknown", birthplace (the site's own place search; AGS finds the timezone from
   the coordinates, as the chart wizard does), test length; 18 or over (checked from the birth date on
   the day); consent to take part in the study (required); news from The Astro Study (optional,
   unticked).
2. `POST /api/study/start`: daily limit → chart created in the architect's library (owner:
   `STUDY_OWNER_USER_ID`), calculated by the existing FreeAstroAPI provider, marked as a study chart →
   quiz built (below) → session returned.
3. The same page, with the test's id in its address (`?s=`): one question at a time, A/B/C in random
   order; each answer saved as it's given, so a reload resumes where it stopped.
4. Result: "You recognised yourself in 7 of 10 (70%). Chance alone: 33%.", the areas recognised, the
   private link and its password rule, and a line saying the full reading is being written there, with
   its PDF.
5. The existing background jobs then write every reading of the chart (default style, the test's
   language), one at a time, as they do today.

### Building a quiz
- Areas: the reading domains (`src/interpretation/domains.ts`) except `summary`, so 10. Short: 5 areas
  drawn at random; medium: all 10; long: all 10, twice (the two strongest distinct combinations).
- Evidence per area: the same grammar matches and knowledge the readings use for that domain, strongest
  first. Birth time unknown: only matches that need no houses or angles.
- One Claude call (default model) writes every statement of the quiz from the composed sentences only,
  under the rules of TASK-0005 (no meaning that isn't in them). Each statement: second person, 18 to 30
  words, plain words, no astrology terms, no prediction, nothing on health, death, pregnancy, legal or
  money advice. The prompt is a new key in Settings → AI prompts, editable like the others.
- Every statement is checked before use: no term from the knowledge vocabulary (EN and FR names of
  planets, signs, houses, aspects, angles, points), and within the length. A failing statement is
  rewritten once; if it fails again, that question is replaced by another area or match.
- Wrong options: two per question, from the decoy pool, same area, same language, length within 25% of
  the true statement, whose key match for that area differs from the participant's. Chosen at random;
  the order of A/B/C is random; the right position is stored.

### The decoy pool
- An owner-only action on the Study page makes fake charts: plausible random birth data (dates
  1950–2007, any time, places from a list of world cities), calculated with FreeAstroAPI, then written
  with the same prompt and model as real tests, for every area, in English and French.
- Fake charts are stored apart from the library and never appear in it.
- The pool is 30 fake charts, the architect's number. Each gets a statement for every area and anchor
  it has material for (about 30), so about 900 per language: a question's wrong answers then come from
  statements about the same part of the chart as the right one, and two of them about different
  placements where possible. Within one quiz no decoy appears twice; when no decoy meets the length
  rule, the closest in length is used rather than none.
- Preparing is one step per request (a fake chart, or one language of its statements): the Study page
  repeats the step until the pool is ready, a few minutes, with the page open.

### Data (new migration)
- `study_sessions`: owner, chart, readee link token, name, email, language, length, birth time known,
  consent time, started, finished, recognised, answered, source of the visit.
- `study_items`: session, position, area, match, the three options (text, origin, decoy), right answer,
  answer given, time.
- `study_decoys`: language, area, statement, match, fake chart, model, prompt version.
- `study_fake_charts`: birth data and calculated chart.
- `charts.last_name` becomes optional (a nickname is one word).
- RLS: the owner reads everything; participants write only through the server routes, with the secret
  key, never directly.
- A service-only SQL function creates the readee link for a study chart (the existing
  `create_share_link` needs a signed-in owner).

### The owner's side
- Study page: number of tests, average recognition beside 33%, by area, by length, by birth time known
  or not; every session with its chart; CSV export for publishing.
- The library shows study charts with their mark, so they can be filtered.

### Limits and safety
- 50 new tests per Paris day; past that, "Today's tests are full, come back tomorrow." A test takes its
  place (status `building`) before anything is spent and the day is counted after, so starts arriving
  together can't slip past the limit; a refused or failed test gives its place back.
- One test per email per day (a build the server stopped half-way stops counting after five minutes); a
  hidden honeypot field; Cloudflare Turnstile once keys exist.
- Under 18 on the day: stopped with a message, nothing stored.
- Deletion on request removes the chart, its readings, sessions and link.

### Environment
- New: `STUDY_OWNER_USER_ID` (the architect's Supabase user id), on Vercel and Cloudflare. Optional:
  `STUDY_SITE_ORIGINS`, the pages allowed to call the test routes, when the default list (the site,
  its www address, its GitHub Pages preview) isn't right.
- Existing: `ANTHROPIC_API_KEY`, `FREE_ASTRO_API_KEY`, `SUPABASE_SECRET_KEY`, the background timer.

### Files
- New: `supabase/migrations/202610260007_study.sql`; `src/study/quiz.ts` (pure logic: plan, anchors,
  statement checks, wrong answers, options, score, the Paris day, age, fake birth details),
  `src/study/areas.json`, `src/study/banned-terms.json`, `src/study/cities.json`,
  `src/study/__tests__/quiz.test.ts`; `src/interpretation/study-statements.ts`
  (material per anchor, the AI call) with its test; `src/server/study-store.ts` (tables),
  `src/server/study-flow.ts` (start, answer, close, fake charts, overview, CSV, deletion);
  `src/app/study/page.tsx`; routes under
  `src/app/api/study/`: `start`, `[session]` (GET, owner DELETE), `[session]/answer`, `overview`,
  `decoys`, `export`.
- In the Astro Study site's repository: the test page (`content/{en,fr}/test.md`, its layout and
  partial, `assets/js/study.js`), the menu entry, the privacy section, `[params.study] api`.
- Modified: `src/lib/navigation.ts` (Study),
  `src/interpretation/prompts.ts` (`study.statements`), `src/types/index.ts` (`Chart.origin`),
  `src/server/charts-store.ts` (`newChartFromDraft` shared with the fake charts; `createChart` takes
  an origin), `tsconfig.test.json` (the study tests), `.github/workflows/deploy-cloudflare.yml`
  (`STUDY_OWNER_USER_ID`), `DEPLOY.md`, `supabase/README.md`.
- Deviation from the plan: the readings are queued by the study store directly rather than through
  `GenerationJobs.enqueue`, which needs a signed-in user and the cron secret on the host the request
  reaches; the jobs themselves are the same rows, written by the same Cloudflare timer.

### Validation
`npm test`: 98 passing, 21 of them new (quiz plan per length and without a birth time, no repeated
anchor, same seed same quiz, anchor keys, banned terms in EN and FR without catching ordinary French
words, wrong answers never sharing the participant's placement or repeating, closest-length fallback,
options, score, the Paris day across the October clock change, age on the day, fake birth details,
material per anchor, reading the model's answer, the prompt). `tsc --noEmit`, `next lint` and
`next build` clean. The routes answer the site's pages (CORS) and refuse others' cookies. Not run here: a live test against Supabase, FreeAstroAPI and Claude (no keys in
this environment).

## Phase 2 — the group game (outline)
- A host opens a room (code and QR); players join on their own phones with the same intake; the host
  starts.
- Each round, every player answers their own question at the same time; the round ends with who
  recognised themselves; a ranking at the end.
- With three players or more, wrong options can be the other players' statements for the same area
  ("you or Léa?"); otherwise they come from the pool.
- Sync through Supabase Realtime (already in the Supabase client, no new dependency).
- Each player gets their own readee link; results join the study, marked as group.

## Open questions
None at authorization. The two raised in the proposal are answered under Decisions.
