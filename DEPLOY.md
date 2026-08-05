# Deploying AGS to Cloudflare (Workers)

The app builds for Cloudflare via the OpenNext adapter (pinned to 1.0.0 —
the last line supporting Next 14). Verified: `npm run cf:build` completes.

## One-time setup
```bash
npm install
npx wrangler login                       # opens the browser, log into Cloudflare

# Server-side secrets (never in git):
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put FREE_ASTRO_API_KEY
```
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
build-time values: keep them in `.env.local`; they are inlined during
`cf:build` on your machine (they are public by design — RLS protects data).

## Deploy
```bash
npm run cf:deploy
```
The URL is printed at the end: `https://ags.<your-account>.workers.dev`.

## After the first deploy
Supabase → Authentication → URL Configuration:
- Site URL: your workers.dev URL
- Additional redirect URLs: `https://…workers.dev/auth/callback`
Without this, email confirmation links keep pointing at localhost.

## Local Cloudflare preview (optional)
```bash
npm run cf:preview
```

## Plan B
Vercel deploys Next 14 with zero configuration (`vercel` CLI or GitHub
import) if Workers ever misbehaves — same env variables, dashboard-side.
