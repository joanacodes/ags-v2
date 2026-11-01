# ADR-0011: The Studio Writes From the AGS Library, With Exact Sources and the System Named

**Status:** Accepted

## Context
The Studio's agents write posts, replies and plans about astrology. A post that defines a trine, a sign or a house
differently from the readings would make the brand say two things about the same placement, and a model left to its
memory fills gaps with common clichés (Scorpio "vengeful", the 8th house "of death", a trine "lucky") that the AGS
definition library explicitly rules out. The owner also asked that myths and other facts be cited exactly, and that
"modern astrology" never stand for astrology in general: tropical, sidereal and Vedic, Chinese and Hellenistic
astrologies all exist.

## Decision
- Meanings come from the AGS definition library (knowledge/vocabulary, built into src/data/knowledge-pack.json),
  read by src/studio/library/library.ts. The strategist gets the whole core library in its weekly system block; each
  writer gets the entries for what its card names; a reply draft gets the entries for what the comment names.
- The owner's standing rules (src/studio/library/rules.ts) follow every agent's prompt, added by code, so no edit of a
  prompt in Settings can drop them: meanings from the library; every myth, piece of history or other fact with an
  exact, real source (author, work, book, chapter or line); "modern tropical astrology", never "modern astrology".
- The gate enforces what a machine can check: "library" (a quality the library lists as not inherent to an entity
  the piece names, unless the piece denies it), "sources" (a myth or history without a "Sources:" line or a
  bracketed reference that reaches a book, chapter or line) and "terms" ("modern astrology" without "tropical").

## Consequences
A piece that breaks one of these stops at the gate with the reason, and the writer's one retry is told what to fix.
The "library" check reads English pieces; French pieces get the library's entries and the rules, and the "sources"
and "terms" checks, but no automatic check of meanings yet. New entities enter the Studio when they enter the
library, never as Studio text.

## Forbidden alternatives
- definitions written into Studio prompts or the brand kit, apart from the library
- a myth, date or quotation stated without its exact source
- "modern astrology" used for astrology in general
