# TASK-0014 — The Studio

The Studio is The Astro Study's content agency run by AI agents: it writes a week of social content every
Sunday, renders pictures and videos by itself, publishes what the owner approved to each platform through
that platform's own API (or through Postly), drafts replies to comments, reads the numbers every Friday,
reminds the owner of what needs attention, and shows all of it as a map of nodes the owner can open and
tune.

Governing documents, in order: the build prompt (*Build prompt — The Astro Study studio*, 28 Oct 2026),
*The Astro Study — launch plan, November 2026*, *The Astro Study content studio — build plan*. Where they
differ, the build prompt wins; where this file differs from the build prompt, this file says why below.

## Status

Authorized by the architect, 2026-10-28: the Studio, first built in `joanacodes/content-creator`, moves into
AGS at `/studio` and shares what AGS already has (decisions 35–43). Built and tested here; not yet run
against the live Supabase project (its migrations are run by hand, as AGS's are).

| Slice | What | State |
| --- | --- | --- |
| 1. Words | migration, kit, cards, strategist, writers, gate, Library, approvals, Today | built, tested |
| 2. Video | engine, templates, render worker, Video studio | built; real renders checked locally |
| 3. Outbox | connections, nine platform clients (dry run first), publish worker, slots | built; dry runs tested against recorded answers |
| 4. Map and settings | Map, drawers, Settings, kill switch, community agent, Replies | built, checked in a browser |
| 5. Numbers and reminders | metrics, analyst, scorecards, reminders, sky table, calendar | built, tested |
| 6. After launch | TikTok client behind its switch; article route; Search Console; push | TikTok client built (by hand by default); the rest not built |

Live posting stays off (`STUDIO_LIVE` unset) until the owner turns it on after the first week of dry runs.

## Decisions taken while building, and every deviation from the documents

1. **In AGS, at `/studio`.** First built in its own repository (`joanacodes/content-creator`) at the owner's
   request, then moved into AGS on 28 October 2026 when the owner chose one app with one set of keys. It
   uses the AGS Supabase project, as the build prompt decided ("one database for tests, orders and
   content"), so the analyst and the strategist read `study_sessions` directly. Its migrations (0008, 0009)
   are run by hand in the Supabase SQL Editor, as AGS's are. The owner signs in with AGS's sign-in.
2. **Screens under `/studio`.** `/studio/today`, `/studio/map`, `/studio/library`, `/studio/video`,
   `/studio/settings`; `/studio` opens Today, the phone's daily screen. AGS's middleware sends a signed-out
   visitor to its sign-in and back.
3. **One scheduler, in the database's clock.** The GitHub workflows carry no `schedule:`; they run only by
   `workflow_dispatch`. A tick every 15 minutes (Supabase `pg_cron` → `POST /api/studio/cron/tick`, with the
   clock's own secret as its bearer, decision 44) reads every
   node's schedule from `studio_settings` (a cron expression in Paris time), decides what is due, and
   dispatches the workflow through GitHub's API. Why: the owner changes schedules from Settings without a
   deploy (non-negotiable 10); Paris time and the clock change are handled in code, not by guessing UTC;
   and a runner starts only when something is due, not every quarter of an hour. GitHub dispatches only
   workflows present on the default branch, so the workers run once this is merged to `main`.
4. **Reminders and the tick run on Vercel**, not in an Action: they are database reads and an email.
5. **The official Anthropic TypeScript SDK** (`@anthropic-ai/sdk`) makes every model call. The build
   prompt said to reuse AGS's fetch helpers to avoid a new dependency in AGS; the Studio was built apart
   with the SDK and keeps it inside AGS (authorized with the move): typed errors, retries on 429/529,
   Message Batches and the Models API. It sends API version `2026-10-21`. AGS's own calls are unchanged.
6. **Structured output instead of forced tool use.** Claude Opus 5.5 and Sonnet 5.5 return a 400 on
   `tool_choice` `any`/`tool`. Every agent returns JSON through `output_config.format` (a JSON schema
   built from the agent's zod schema), and the code validates it again with zod (ADR-0009's rule); one
   retry with the errors named, then a failed run.
7. **`create_reminder` is a field, not a tool.** Each agent's output has an optional `reminders` list with
   the tool's exact shape; the code turns each into a `studio_reminders` row, refused past five a day per
   agent. Same effect without a tool loop (which would need `auto` tool choice and a second request).
8. **Effort instead of temperature.** These models don't take sampling parameters (Opus 5.5 refuses
   `temperature`; Sonnet 5.5 and Haiku 5.5 refuse non-default values; API version `2026-10-21` refuses
   them on every model). Each agent's tuning knob is `effort` (`low` … `max`), editable per node; the
   defaults follow the build prompt's intent: the strategist `high`, the writers `medium`, the community
   classifier `low`, the reply drafts `low`, the analyst `high`.
9. **Refusal fallbacks on.** Direct Opus and Sonnet calls send `fallbacks: "default"` (beta
   `server-side-fallback-2026-07-01`): a refusal by the safety filter is re-run on Anthropic's
   substitute model inside the same call, and the run logs which model answered. Not on batches (the API
   rejects it there) nor on Haiku (no fallback exists); the setting is per node.
10. **Owner-only reads through one function.** RLS is on for every table; the only policies are `select`
    for `studio_is_owner()`, which checks `auth.uid()` against the one row of `studio_owner`. Every write
    goes through the server or a worker with the secret key, as in AGS. The app also checks the signed-in
    user against `STUDY_OWNER_USER_ID` (AGS's architect id, the one the test uses) before any page or route
    does anything.
11. **Templates are static files.** `public/studio/templates/*.html`: the same file is framed by the
    Video studio's live preview (served by Next) and opened by Chromium on the runner (from disk). Their
    metadata (formats, text limits, duration rules) is in `src/studio/templates/registry.ts`, which the
    gate reads.
12. **Real frosted glass on video.** A video template keeps its glass panel in one place for the whole
    video and reports its rectangle; the composer blurs that part of the moving meadow under it, so the
    glass is live, as on the site.
13. **The analyst does no arithmetic.** Every figure on the scorecard and every keep-or-kill verdict is
    computed in code from the tables; the model writes the verdicts' wording, the ten suggestions and the
    three lines for the owner, and is told the figures are final. "No rounding up" holds by construction.
14. **Sources beyond the Study data.** The strategist reads the page titles and descriptions of the
    Astro Study site (encyclopaedia and blog) and, when the owner turns it on, of the Maison Tarot site
    (library and blog), from their repositories: ideas from "the week's encyclopaedia pages", and the
    French audience's own topics. Maison Tarot is off by default ("occasionally"). See decision 40.
15. **Cards have a language or two.** A card is `en`, `fr` or `both`; a `both` card is written by both
    writers separately, never translated. Which platforms each language goes to is in the kit: English
    first on video and on every network; French on Threads and Facebook, cross-posted to Bluesky and
    Mastodon, and on French Pinterest boards (the launch plan's decision 2). Instagram, TikTok and
    YouTube stay English so each feed keeps one language.
16. **Approval modes.** `confirm` (weeks 1–2): a piece approved on Sunday also needs *Confirm* on Today
    before its slot. `direct`: the Sunday approval is enough. Both are the owner's tap.
17. **Web push not built.** Reminders go in-app and by email (Resend); the `push` channel and its table
    exist so push can be added without a migration.
18. **Banned terms are the test's own.** The gate reads AGS's `src/study/banned-terms.json` where it lives
    (it was a copy while the repositories were separate). Settings shows it read-only; the kit's extras sit
    beside it.
19. **Models table.** `src/studio/models.json` holds ids, context windows, maximum outputs and prices per
    million tokens (input, output, cache write at 5 minutes and 1 hour, cache read, batch), as listed by
    Anthropic on 6 October 2026 (the date is in the file); the Models page shows and edits them, and the
    model list is refreshed daily from the Models API.

20. **The draft-only guard sits under every client, not beside it.** The build prompt asked for
    `prepare(piece)` and `send(prepared)` per client. Instead every network call goes through one `Http`
    (`src/studio/outbox/http.ts`): reads pass, and any write throws `DryRunStop` (recording the exact
    request) unless the client was made live, which only `mayWrite` decides: `STUDIO_LIVE=true`, an owner
    id set, and `approved_by` equal to it. Sign-ins and TikTok's read-only POSTs have their own calls that
    refuse any other address. A client can't write by mistake because it has no other way to the network;
    the test proves it for every client's publish and reply.
21. **A dry run is a full run up to the first write.** The piece becomes `posted` with a `dry-run:` id and
    the request in the audit log (as the build prompt says); comments and metrics skip `dry-run:` ids.
22. **Pictures are JPEG.** Instagram's API takes only JPEG; Bluesky refuses pictures over 1 MB. The media
    gate checks the size per network.
23. **Each writer books its own spend.** The writers run inside the strategist's run but on their own run
    rows, so the strategist's cap reads only the strategist and each writer's cap its own writer.
24. **Posting modes per platform.** Each platform posts through its API, through Postly (decision 39), by
    hand on Today, or (TikTok) to the owner's TikTok inbox. X starts off (its API is paid per post); TikTok
    starts by hand: TikTok's guidelines refuse audits for tools that post to their maker's own accounts,
    and an unaudited app can only post privately. Any platform can be switched to by hand from Settings
    while its connection isn't ready.
25. **Slots are kept, not chased.** A slot missed by more than three hours is not posted late: the piece
    fails with the reason and waits for a new slot. A piece left `queued` for an hour by a run that died
    mid-call fails with no automatic retry, so nothing can go out twice.
26. **The kill switch kills the queue, not the week.** Queued pieces are killed; approved pieces stay
    approved, so a restart doesn't mean approving the week again; the pause stops every worker and the
    outbox; the workflows are disabled and running ones cancelled when `GITHUB_STUDIO_TOKEN` is set
    (Settings → Keys).
27. **Reminders worked out by the tick.** The Sunday approval at 19:00 and 21:00, the replies at 18:30,
    tokens 7 days and 1 day before expiry, caps at 80%, calendar dates 2 days before and that morning, sky
    events the evening before (off), and a `tick-stalled` kind of our own when the clock stopped. Each is
    written once per occasion (a dedupe key). The calendar feed's address carries a token the owner can
    replace.
28. **The sky table: a scan, refined, and checked.** One FreeAstroAPI chart a day for 120 days (cached in
    Storage, so a day is asked once), events found between days, then one chart at the estimated moment
    and a Newton step on the body's speed: within minutes for ingresses and lunations. A date the launch
    plan typed in is confirmed (the scan becomes its second source), never doubled. Eclipses come from
    NASA's catalogue and are written only when the scan finds their new or full moon.
29. **The gate's two astrology checks.** AGS's list of astrology words applies to the test's statements
    only (the test must stay blind); hooks get a jargon check instead (no term a newcomer wouldn't know).
30. **The analyst's figures stand alone.** Capped or without a key, the scorecard is still saved with the
    code's figures and verdicts; only its words wait for the model.
31. **Prices are editable.** The owner's corrections are stored in `studio_settings` (`prices`) and used
    for every cost from the next run.
32. **Routes under `/api/studio/`.** Beside AGS's own routes; the OAuth callbacks are
    `/api/studio/oauth/{connection}/callback` on AGS's address.
33. **A local demo.** With no Supabase and `STUDIO_DEMO=1`, the app runs on an in-memory store filled by
    the real agents with a stand-in model (`src/studio/claude/fake-transport.ts`), so every screen can be
    seen on a laptop. It refuses to run in production.
34. **Not built.** Web push; Search Console; the article route (site pieces are posted by hand); video on
    Bluesky, X and Pinterest (the kit gives those networks text and pictures only).

### Moving into AGS (28 October 2026)

35. **AGS's keys are the Studio's.** Supabase, `ANTHROPIC_API_KEY`, `FREE_ASTRO_API_KEY` and
    `STUDY_OWNER_USER_ID` come from AGS's environment on Vercel and Cloudflare, and from
    AGS's Actions secrets for the workers (`studio-run`, `studio-render`). Nothing new is set there; only
    `STUDIO_LIVE` (Vercel and an Actions variable) when the owner goes live.
36. **Settings → Keys.** Every other key (the networks' apps, Postly, ElevenLabs, Resend and the sender
    address, Stripe, MailerLite, the GitHub token) is pasted once in the Studio and kept in Vault
    (`studio:key-…`, read by `studio_keys()`, service role only). The server and the workers load them into
    their environment at most once a minute (`src/studio/keys.ts`), so the rest of the code reads
    `process.env` unchanged. A key set there wins over the environment; removing it gives the
    environment's value back; the state is held once per process because Next bundles a copy of the module
    per route. A secret never comes back to a browser; "Check it works" makes one read per service. Vault
    out of reach leaves the screens up and says why on the page.
37. **Its look compiled apart.** Two Tailwind configs in one Next build leak into each other (AGS lost its
    preflight to the Studio's in the first try), so `npm run studio:css`, run before every dev and build
    (Vercel's and OpenNext's both run `npm run build`), compiles `src/app/studio/studio.tailwind.css` with
    `tailwind.studio.config.ts` into `studio.generated.css` (ignored by git). Every rule is scoped under
    `.studio`, so AGS's pages never see it and AGS's dark theme never reaches the Studio's paper; the sheets
    portaled to the body carry the scope with them.
38. **zod 3.25 for both.** AGS's code keeps `zod` (the v3 API); the Studio imports `zod/v4`, which zod 3.25
    ships. One package, no change to AGS's validation.
39. **Postly, chosen per network.** The owner's Postly account posts with one key to Instagram, Facebook,
    Threads, TikTok, YouTube, Pinterest, Bluesky and X; its own apps passed the reviews that hold an app of
    the owner's own private (TikTok, YouTube) or in trial (Pinterest). The client uploads each file from its
    signed address, then creates the post on the channel picked in Settings → Connections, with each
    network's settings (TikTok public with the AI label when the voice is cloned; YouTube's title, tags and
    thumbnail; the pin's link). The draft-only guard is the same `Http`. Postly answers "enqueued": each
    publish run reads its activity and turns a failed delivery into a failed piece with Postly's reason,
    and one still waiting after 12 hours into a piece set aside. Comments and numbers come from a network's
    own connection when there is one; Postly's own post analytics aren't read (their fields aren't
    documented).
40. **The site job needs no token.** Both site repositories are public: one call to GitHub's API lists the
    files (with the workflow's automatic `GITHUB_TOKEN`), and each page comes from
    `raw.githubusercontent.com`, outside the API's hourly limit. `STUDIO_SOURCES_TOKEN` is for a private
    repository only.
41. **The Video studio frames its templates.** `X-Frame-Options: SAMEORIGIN` for `/studio/templates/*`;
    `DENY` everywhere else, as before.
42. **One checks workflow.** `.github/workflows/checks.yml` runs AGS's typecheck, lint, tests and build on
    every pull request and push to `main`, so a Studio change that breaks AGS's build is caught there.
44. **The clock keeps its own secret.** AGS's `CRON_SECRET` can't serve: the Cloudflare deploy makes a new
    one each time and Vercel may have none. The owner starts the clock from Settings → Schedules → The
    clock: the Studio makes a 32-byte secret, `studio_tick_setup` (now callable by the service role) stores
    it in Vault with the Studio's own address, and the tick route reads it back with `studio_tick_secret()`
    and compares in constant time. A restart makes a new secret; a Vercel cron can still stand in with
    `CRON_SECRET` when one is set. No secret is ever typed or copied.
43. **AGS's numbering.** The migrations are 0008 and 0009 in AGS's sequence (after the test's 0007); the
    Studio's tables are all `studio_*`; it imports nothing from AGS's engine (ADR-0010), only AGS's Supabase
    settings and its sign-out action.

## AGS compliance (AGENTS.md)

- **Governing documents read:** `AGENTS.md`, `AGS_MASTER_SPEC.md`, ADR-0001 to ADR-0010 (there is no
  `docs/architecture/` directory), TASK-0013, and this file.
- **Created:** `src/studio/**` (the engine and its server code), `src/app/studio/**`, `src/app/api/studio/**`,
  `src/components/studio/**`, `public/studio/**`, `supabase/migrations/202610280008_studio.sql`,
  `202610280009_studio_tick.sql`, `.github/workflows/studio-run.yml`, `studio-render.yml`, `checks.yml`,
  `tailwind.studio.config.ts`, `scripts/studio-smoke-render.ts`, `scripts/studio-smoke-screen.ts`, this file.
- **Modified:** `package.json` and `package-lock.json` (the packages below, the `studio:*`, `predev` and
  `prebuild` scripts), `next.config.mjs` (the templates' frame header; Playwright kept out of functions),
  `tsconfig.json` and `tsconfig.test.json` (the Studio's tests), `.gitignore`.
- **Excluded:** the engine (grammar, knowledge, interpretation, normalization), AGS's existing pages and
  routes, its migrations, its middleware and its sign-in.
- **No ADR changed:** the Studio is an app section beside the engine; it neither imports from the engine nor
  writes meaning into TypeScript.

## Open questions

- **Brand on the Map, and the look in the kit.** The kit drives every agent and the gate, but the Map
  doesn't draw those links, and colours and fonts are fixed in the templates' CSS. Both are planned with the
  owner's own templates (the owner's designs arrive first).
- **Postly's numbers.** Its post analytics (Instagram, Facebook, Pinterest) could fill Friday's numbers for
  pieces it posted; to be read once a real answer shows its fields.

## New dependencies, and why

New to AGS with the move (authorized with it); the rest is AGS's own toolchain.

| Package | Why |
| --- | --- |
| `zod` 3.23 → 3.25 | `zod/v4` for the Studio, AGS's code unchanged (decision 38) |
| `@anthropic-ai/sdk` | Model calls (decision 5) |
| `@xyflow/react` | The Map: pan, zoom, minimap, edges, keyboard; the one UI library the build prompt allows |
| `yaml` | The brand kit is YAML the owner edits; no dependency of its own |
| `playwright` (dev) | Frames and pictures on the runner; the same version as the site's image tool |
| `tsx` (dev) | Runs the TypeScript workers on the runner without a build step |

## Validation

In AGS, 28 October 2026:

- `npm test`: 215 tests, AGS's 115 and the Studio's 100 (the 85 below; Keys: loading, fallback, a secret
  never shown, the checks; Postly: the guard, the requests per network, async uploads, deliveries
  confirmed, failed and set aside; the site job reading outside the API's limit).
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run cf:build` (OpenNext): clean. The Cloudflare
  bundle is 2.31 MB gzipped (1.88 MB on `main` before the test and the Studio; the free plan's limit is 3 MB).
- Both migrations run twice on Postgres 16 with Supabase's schemas stubbed; the keys check proven to fail
  when a signed-in user can read the keys.
- The screens on the local demo inside AGS (`/studio`), and AGS's own dashboard unchanged beside them.

In content-creator, before the move:

- `npm test`: 85 tests (kit, drift between the rows and the migration, time and cron, settings, every gate
  check, a full fake Sunday, community and analyst, timelines, renders, every outbox client's dry publish
  and reply, the publish worker's rules, reminders, the tick, the sky scan against a sky with known
  answers, the sites' addresses).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: clean.
- Both migrations run on Postgres 16 with Supabase's schemas stubbed, twice each (they are re-runnable),
  and each check block proven to fail when its function is weakened.
- Real renders (Chromium + ffmpeg) of a meadow-text video, a test-three-cards video, a screen recording, a
  carousel, a pin and a still, all through the media gate.
- The screens on the local demo, phone and laptop, with eighteen owner actions run end to end (approve,
  confirm, a bad edit stopped by the gate, a reply sent dry, Test in dry run, the kill switch and restart,
  the calendar feed, exports, the audit log).
