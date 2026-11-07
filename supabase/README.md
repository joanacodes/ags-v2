# Supabase setup (TASK-0006)

One-time setup on your existing Supabase project:

1. Dashboard -> SQL Editor -> paste and run `reset-legacy.sql`
   (removes tables from earlier AGS experiments — review first).
2. Paste and run `migrations/202608040001_ags_v2_core.sql`.
3. `.env.local` needs (Settings -> API):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The app relies on user sessions + RLS. The secret key is only used by the
background reading timer on Cloudflare (`SUPABASE_SECRET_KEY`, see DEPLOY.md).

Without these variables the app runs in mock mode exactly as before;
with them, sign-in appears in the sidebar and wizard-created charts are
saved privately per user.

## Editable AI prompts

Run `migrations/202610120005_prompt_overrides.sql` once (SQL Editor). Until
it runs, Settings → AI prompts shows the defaults but cannot save edits, and
every AI call uses the defaults.

## Background readings

Run `migrations/202610130006_generation_jobs.sql` once (SQL Editor), and add
the `SUPABASE_SECRET_KEY` GitHub secret (DEPLOY.md). Until both are done,
"Generate all categories" writes the readings from the browser page.

## The Astro Study test

Run `migrations/202610260007_study.sql` once (SQL Editor). It adds the test's tables (sessions,
questions, fake charts and their statements, all readable by their owner only, written by the server),
a service-only function that makes a participant's readee link, and lets a chart's last name be empty
(a nickname is one word). DEPLOY.md lists the variables the test needs.
