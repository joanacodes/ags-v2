# ADR-0012: No Birth Time, No Reading

**Status:** Accepted (the owner, 2026-11-01 for the forecast, 2026-11-02 for every reading)

## Context
Without the birth time, the Ascendant, the Midheaven and the houses are unknown, and on the day the Moon changes sign,
so is its sign. AGS used to read such charts anyway, leaving the houses out and saying so; the Astro Study site
offered a "I don't know my exact time" box. The owner's rule: "There's always a birth time. Or no reading."

## Decision
- One test of a birth time, `hasBirthTime` (src/lib/birth-time.ts): the chart says the time is known and gives it.
- Nothing is read from a chart without one. The two reading generators refuse it before any AI is asked
  (`generateDomainReading`, `generateSynastryReading`: status `no_birth_time`), so the background jobs do too; the
  routes that start readings answer 422 NO_BIRTH_TIME (a topic reading, every reading at once, the AI
  interpretation, a synastry when either chart lacks the time); the forecast refuses it (TASK-0015).
- The pages say it before anything is tried: the chart page and the readings page show the rule instead of the
  button that writes every reading; the synastry page does the same for its reading; the forecast page too.
- A chart without a time can still be created and kept: the time may be found later.
- The site's order form requires the time (both times for a synastry), and its pages say so (astrostudy repository).

## Not covered
- The Astro Study test still runs without a time, with fewer kinds of question: it is a test, not a reading. To be
  confirmed by the owner.
- The deterministic interpretation page (the library's sentences per placement) still opens: it is the material of a
  reading, used to check the engine, not a reading given to someone.

## Later
A birth-data finder, once the forecast is finished (the owner, 2026-11-02): questions that establish the real date,
place and time of birth for someone who does not have them.
