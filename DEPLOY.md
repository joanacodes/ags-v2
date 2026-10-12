# Deploying AGS (Vercel)

The app is hosted on Vercel, connected to this GitHub repository:

- every push to `main` (for example a merged pull request) deploys the live site;
- every pull request gets its own preview deployment, linked in the PR.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-side only. Powers readings and interpretations. |
| `FREE_ASTRO_API_KEY` | Server-side only. Chart calculation. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public by design (RLS protects the data). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public by design. |

Locally, put the same values in `.env.local`.

## Database changes

Migrations in `supabase/migrations/` are run by hand in the Supabase SQL
Editor, before merging the change that needs them (see `supabase/README.md`).

## Auth redirects

Supabase → Authentication → URL Configuration:
- Site URL: the Vercel production URL
- Additional redirect URLs: `https://<your-domain>/auth/callback`
