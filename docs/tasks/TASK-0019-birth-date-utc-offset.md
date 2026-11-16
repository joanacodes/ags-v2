# TASK-0019 — The UTC offset of the birth, not of the day the chart is made

A chart's stored "UTC offset" label must be the offset in force at the birth. Until now it was the offset
in force on the day the chart was created.

## Status

Authorized by the owner (the architect), 16 November 2026, in these words:

- On checking a chart's birth time: "Yeah, make sure it's the right time. I don't know whatever has to be
  done, but it's close to Paris. In Bourg-la-Reine."
- On writing this task, fixing the bug and correcting the other affected chart: "Sure".

## What was found

A chart for a birth on 2 January 1997 at 17:15 in Bourg-la-Reine (`Europe/Paris`) showed "UTC +2:00".
Paris was on UTC +1 that winter.

- **The calculation was right.** Every planet, point and angle matched an independent calculation for 16:15
  UT to the minute. The provider receives the zone name (`tz_str`), and the forecast's `birthMoment` reads the
  zone's history before it ever looks at the label.
- **Only the label was wrong.** `utcOffsetLabel(timezone)` in `src/lib/geo.ts` formats the offset for
  `new Date()`. The chart was made in October, during summer time, and that offset was stored with it.
- **Three of the twelve charts in the database** had a label that did not match their birth (two of the
  owner's and one other): all winter births in Paris, created during summer time.

## Decisions

1. **The stored label is the offset at the birth.** `birthUtcOffsetLabel(timezone, date, time?)` in
   `src/lib/geo.ts` reads it from the zone's own history through `Intl`. A birth without a time is read at
   noon. An unreadable zone or date returns `null`, and the caller keeps the label it already had.
2. **It is set in one place.** `newChartFromDraft` in `src/server/charts-store.ts`. Every way of creating a
   chart goes through it: the wizard, bulk import, the Study test and the Study's fake charts.
3. **The place search is unchanged.** While a place is being picked there is no birth date yet, so the search
   still shows today's offset. The chart then stores the birth's.
4. **Calculation is unchanged.** The provider and the forecast already work from the zone name.
5. **No new dependency, no schema change.** `utcOffsetLabel` keeps its signature, its format and its
   "UTC +0:00" fallback.

## Data corrected

16 November 2026, in the database, label only (`chart_payload.birth.utcOffset`). No position, aspect or
house was touched. The three charts above now read "UTC +1:00", which matches their births.

## Validation

- `npm run typecheck`: passes.
- `npx next lint` on the changed files: no warnings or errors.
- `npm test`: 281 of 282 pass, including the 8 new tests in `src/lib/__tests__/geo-offset.test.ts`. The one
  failure is "a missed slot is not posted late, and a half-posted piece is set aside"
  (`src/studio/outbox/__tests__/publish.test.ts`). It fails the same way without this change, so it is outside
  this task.

## Going live

Cloudflare deploys `main` (see DEPLOY.md). This change waits on the working branch until the owner says to
merge it.

## Files

Created: `docs/tasks/TASK-0019-birth-date-utc-offset.md`, `src/lib/__tests__/geo-offset.test.ts`.
Modified: `src/lib/geo.ts`, `src/server/charts-store.ts`.
