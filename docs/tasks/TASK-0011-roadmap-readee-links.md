# Roadmap note — Readee links (ratings & comments)  [NOT YET IMPLEMENTED]

Requirement from the architect (2026-08-05): a chart owner can share a
reading through a link; the readee (the person the chart describes) opens
it without an account, rates each reading/section, and leaves comments so
the reader can see what is exact or wrong.

Sketch for the implementing task:
- `share_links` table: id (unguessable token), chart_id, scope, created_by,
  expires_at; RLS: owner manages, token grants read via a server route.
- `reading_feedback` table: share_link_id, reading_slug, section_id?,
  rating (1-5), comment, created_at.
- Public route `/r/[token]` renders the reading read-only + feedback UI.
- Owner sees aggregated feedback on the reading page.
Section edit infrastructure (TASK-0010b) already covers the display side.
