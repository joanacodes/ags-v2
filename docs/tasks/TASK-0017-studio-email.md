# TASK-0017 — The Studio's own email: designer, workflows, contacts (slice 1 built)

The Studio sends the brands' emails itself, through Resend: a designer for the emails and a builder for the
workflows, both customisable, with AI writing inside the workflows. One space per brand.

## Status

Decided by the owner (the architect) on 7 November 2026, in these words:

> "The studio is a marketing hub, so I want you to know that we will make our own email workflow and designer
> in there and use resend api keys. Worflows automated with ai and customisable + customisable designs + drag
> and drop + workflow settings customisable as well."

and, the same day, to build it now:

> "If you can actually already code the email marketing interface, that could be good. One per brand."

**Slice 1 is built** (7 November 2026): the interface, one space per brand, under *Email* in the Studio's menu.
Nothing is sent to contacts yet. The only email that leaves is a test to the owner. Switching a workflow on
comes with the sending engine, slice 2 below. The owner's checklist carries the whole as "The Studio's own
email".

Before it works on the live Studio:

1. Run `supabase/migrations/202611070011_studio_email.sql` in AGS's Supabase project, by hand like the
   earlier migrations. It can be run again safely.
2. Add the Resend key in Settings → Keys (`RESEND_API_KEY`, already used for reminders).
3. In each brand's email settings, give a sender address on a domain verified in Resend, and the postal
   address for the footer.

## What the owner asked for

- Email workflows inside the Studio, automated with AI and customisable.
- An email designer: customisable designs, drag and drop.
- Customisable workflow settings.
- Sending through Resend's API.

## Decisions

The four questions this file left open were answered in building, as below. The owner can change any of them.

- **The two brands never mix.** The Astro Study's space is `/studio/email/astrostudy`. Maison Tarot's is
  `/studio/email/maison-tarot`. Every row carries its brand, and every read, save and delete checks it: a
  design asked for under the other brand is "not found".
  - A workflow can only send its own brand's designs.
  - Contacts are kept per brand. The same address can be in both lists, each with its own consent.
  - The picture picker shows only the brand's own basket in Files.
  - The test trigger (someone finishes the blind test) is The Astro Study's only.
  - Maison Tarot's AI drafts get none of The Astro Study's kit, rules or links.
  - Each brand's example address and footer words are its own.
- **Designs are blocks, stored as JSON.** There are eight blocks: title, text, picture, button, picture
  and text, quote, line and space.
  - Text takes `**bold**`, `*italic*`, `[words](https://…)`, and `{{first_name}}` or
    `{{first_name|fallback}}`.
  - There are three starters: blank, newsletter and announcement.
  - Blocks are added by a tap or by dragging from the palette onto the email. They are moved with the ⠿
    handle, or ↑ ↓ on a phone.
  - The look is set once per brand, in the brand's settings: colours, fonts, logo, footer and the AI's voice.
    Every design follows it.
  - The renderer writes email-safe HTML (tables, inline styles, 600 px) and a plain-text version.
  - The footer is always added and can't be removed. It holds the sender, the postal address, why the
    reader gets the email, and the unsubscribe link.
- **A workflow is a trigger and steps.**
  - Triggers: someone signs up (from chosen sources), gets a tag, finishes the test, or a date.
  - Steps: send an email (a design, or the AI writes it from a brief), wait (hours or days), only if (they
    opened or clicked the last email, or have or lack a tag), and add or remove a tag.
  - Its settings:
    - the language: each person's own, or English or French
    - who it reaches: tags to include and tags to leave out
    - the sending window: Paris time and days
    - at most so many emails per person and week (3 to start)
    - the AI's tone and length
    - the owner's approval: every AI email, or the first only
  - Workflows are saved as drafts or paused. "On" is refused until sending exists.
- **Contacts with consent.** Nobody is added without the words of how they agreed, kept with the date.
  - People are added one by one, or as a list pasted from a spreadsheet (CSV, up to 10,000 lines). Bad lines
    are reported, and addresses already in the list are left as they are.
  - The statuses are: waiting for confirmation, subscribed, unsubscribed, address bounced and marked as spam.
  - The screen can unsubscribe someone, never subscribe them back. The list exports as CSV.
- **"Write it for me".** It writes the email from a sentence, in the brand's voice.
  - The model is set in Settings → Models ("Write an email"), capped at $1 a week. The cost is logged as a run.
  - For The Astro Study it also follows the kit, the standing rules and the definition library (ADR-0011).
  - Links come only from the brand's list: the kit's links, and links in the sentence or already in the
    email. Any other link is emptied.
  - Pictures are left for the owner to choose.
  - Nothing is saved until the owner saves, and *Undo* puts the email back as it was.
- **Tests.** *Send me a test* sends the email as it is on screen, through Resend. It goes to the brand's test
  address, or else the owner's, from the brand's sender, with the subject "[Test] …".
- **The sending domain is a setting.** Each brand's sender address is set in its email settings, on a domain
  verified in Resend: astrostudy.co.uk (DNS on Cloudflare) for The Astro Study, and Maison Tarot's own.

## AGS compliance (AGENTS.md)

- **Governing documents read:** `AGENTS.md`, `AGS_MASTER_SPEC.md`, ADR-0001 to ADR-0012 (there is no
  `docs/architecture/` directory), TASK-0014, TASK-0016 and this file.
- **Created:**
  - `src/studio/email/model.ts`: the brands, settings, blocks, workflows and contacts, with their checks.
  - `src/studio/email/render.ts`: a design as an email (HTML and text), with the footer always in.
  - `src/studio/email/draft.ts`: *Write it for me*.
  - `src/studio/email/views.ts`: what the screens read and do, each brand kept to its own rows.
  - `src/studio/email/__tests__/email.test.ts`, `src/studio/email/__tests__/views.test.ts`: the tests.
  - `supabase/migrations/202611070011_studio_email.sql`: four tables, owner-only.
  - The routes, all behind the Studio's owner check: `src/app/api/studio/email/[brand]/route.ts` and,
    under it, `designs/route.ts`, `designs/[id]/route.ts`, `test/route.ts`, `draft/route.ts`,
    `workflows/route.ts`, `workflows/[id]/route.ts`, `contacts/route.ts` and `contacts/[id]/route.ts`.
  - The screens:
    - `src/app/studio/email/page.tsx`: opens The Astro Study's space.
    - `src/app/studio/email/email-ui.tsx`: shared pieces (the brand switch, previews, blocks, drag and drop,
      the picture picker).
    - `src/app/studio/email/[brand]/page.tsx` and `email-home.tsx`: designs, workflows, contacts and
      settings.
    - `src/app/studio/email/[brand]/designs/[id]/page.tsx` and `designer.tsx`: the designer.
    - `src/app/studio/email/[brand]/workflows/[id]/page.tsx` and `workflow-builder.tsx`: the workflow
      builder.
  - This file.
- **Modified:**
  - `src/studio/store/rows.ts`, `store.ts`, `memory.ts` and `src/studio/server/studio-store.ts`: the four
    tables in the store.
  - `src/studio/models.ts` and `src/studio/caps.ts`: the "Write an email" model use and its cap.
  - `src/studio/clients/resend.ts`: an email with a sender, HTML and text.
  - `src/studio/claude/fake-transport.ts`: the fake model answers as the email writer, for the tests and the
    demo.
  - `src/components/studio/shell.tsx`: *Email* in the menu.
- **Excluded:** the engine, AGS's pages outside the Studio, its middleware and sign-in, the earlier
  migrations, the Studio's agents and workers, and both brands' repositories.
- **No new dependency, no ADR changed.** Storage follows the Studio's pattern. The rows' checks are compared
  with the migration by the existing drift test. Supabase lets only the owner in. The memory store serves the
  tests and the demo. This is Studio code only, importing nothing from the engine (ADR-0010). No astrology
  meaning is written in TypeScript (ADR-0001, 0002): an email's words are the owner's, or the AI's under the
  library.

## Not built (slice 2 and later)

- **Sending to contacts.** This is the engine that runs the workflows: a worker on a schedule, the sending
  window, the weekly limit, and the AI emails waiting for approval in Today. Until it exists, *Switch on*
  stays off.
- **The confirmation and unsubscribe pages.** These are double opt-in, and one-click unsubscribe with the
  `List-Unsubscribe` headers: public pages with signed links.
- **Resend's webhooks.** Opens, clicks, bounces and spam complaints, which "only if opened" and two of the
  statuses need.
- **The forms that feed contacts.** These are the sites' sign-up forms and the test's news box, each with
  its source.
- **Pictures hosted for email.** Today a picture's address is its `raw.githubusercontent.com` address, which
  works only while the repository is public. A copy in the Studio's own storage would be safer.
- **One Resend key per brand.** There is one key for now, and a sender address per brand.
- **Friday's numbers from the Studio's own sends**, in place of MailerLite.

## Validation

7 November 2026, on the Studio's branch:

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 273 tests pass. 15 of them are the email's:
  - brand settings falling back field by field
  - the starters passing their own checks
  - contacts needing an address and consent
  - CSV lists with bad lines reported
  - only safe links and pictures going out
  - formatting escaped first
  - first names with a fallback and no stray space
  - the same email bytes each time, the footer always there
  - previews showing what is missing
  - each brand kept from the other's designs, workflows and contacts
  - workflows never switched on
  - consent kept, and unsubscribing only
  - a test going to the owner only, from the brand's sender
  - a draft's cost on a run, nothing saved
  - the AI's links kept to the brand's list

  The drift test also covers the four new tables.
- `npm run build`: clean. `/studio/email/[brand]` is 6.18 kB, the designer 5.97 kB, the workflow builder 4.71 kB.
- `npm run cf:build` (OpenNext): clean. The worker is 2,445 KiB gzipped (wrangler's dry run; the free plan's
  limit is 3 MB).
- The local demo (`STUDIO_DEMO=1`, `STUDIO_DEV_OWNER=1`, `STUDIO_FAKE_MODEL=1`) was checked in Chromium on a
  laptop and a phone:
  - a design made from a starter
  - blocks added by tap and by drag, and moved by the handle
  - a picture picked from Files (the eight Aries, told apart by their folder)
  - the phone and computer previews, and saving
  - *Write it for me*, then *Undo*
  - *Send me a test* with no key, which says so
  - a workflow saved as a draft
  - contacts added, imported (the bad line reported) and unsubscribed
  - settings saved, with the sample redrawn
  - Maison Tarot's space, empty and its own

  There were no page errors, and no sideways scroll on a phone.
- **Not run:** the migration on Supabase (the owner runs it), and a real send through Resend (there is no key
  on this machine).
