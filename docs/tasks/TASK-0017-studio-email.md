# TASK-0017 — The Studio's own email: workflows and designer (planned, not built)

The Studio sends the brands' emails itself, through Resend: a designer for the emails and a builder for the
workflows, both customisable, with AI writing inside the workflows.

## Status

Decided by the owner (the architect) on 7 November 2026, in these words:

> "The studio is a marketing hub, so I want you to know that we will make our own email workflow and designer
> in there and use resend api keys. Worflows automated with ai and customisable + customisable designs + drag
> and drop + workflow settings customisable as well."

Planned; nothing is built yet. It is recorded here so that every session working on the Studio builds toward
it. The owner's checklist carries it as "The Studio's own email".

## What the owner asked for

- Email workflows inside the Studio, automated with AI and customisable.
- An email designer: customisable designs, drag and drop.
- Customisable workflow settings.
- Sending through Resend's API (`RESEND_API_KEY`, already one of Settings → Keys, used today for reminders).

## What follows from it

- No outside email tool. The checklist's "Choose the email service" is answered: Resend. MailerLite
  (`MAILERLITE_API_KEY`, read for Friday's numbers) is no longer needed once the Studio counts its own sends.
- Subscribers and their consent live in AGS's Supabase: double opt-in, source tags, one-click unsubscribe,
  bounces and complaints from Resend's webhooks, French and English.
- AI drafts go through the Studio's agents, the definition library (ADR-0011) and the gate; nothing is sent
  without the owner's approval.

## To settle with the owner before building

- The designer's blocks and how designs are stored.
- The workflows' triggers and steps.
- The sending domain (astrostudy.co.uk, its DNS on Cloudflare).
- How Maison Tarot's emails stay apart from The Astro Study's.
