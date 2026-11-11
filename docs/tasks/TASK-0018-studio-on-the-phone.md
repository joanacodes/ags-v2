# TASK-0018 — The Studio on the phone, and on `main`

The owner uses the Studio from a phone: every screen fits, the Studio can sit on the home screen like an
app, and it is live, which means on `main` (Cloudflare deploys `main`; see DEPLOY.md).

## Status

Authorized by the owner (the architect), 11 November 2026, in these words:

- "Can you make the studio available on my phone ? Responsive and pushed to the main branch. I'll have to
  know where to click to"
- On running the email migration first, then merging: "Go".

## What was checked

Every Studio screen at a phone's width (390 px) in the local demo (`STUDIO_DEMO=1`, `STUDIO_DEV_OWNER=1`,
`STUDIO_LOCAL_DIR`): Today, Map, Library, Files, Email (both brands), Video, Settings, and AGS's two doors at
`/`. None scrolls sideways; the Studio's bottom menu (seven tabs) and its sticky header were already there
from TASK-0014.

## Decisions

1. **The Video studio opens from the menu.** Opened without a piece, it failed with "script: Invalid input;
   lines: Invalid input": its blank spec had an empty script, which `videoSpecSchema` never allows. The blank
   studio now starts from the kit's first English hook (`videoState`, test `views/__tests__/video.test.ts`).
2. **The health strip in two columns on a phone.** Above Today and the Map, its eight figures scrolled
   sideways with the last ones out of sight; on a phone they now sit in two columns, and from `md` up in one
   row as before (`HealthStrip`).
3. **On the home screen like an app.** `public/studio/manifest.webmanifest` (name "The Studio", short name
   "Studio", start `/studio/today`, standalone, the Studio's paper colours) and its icons in
   `public/studio/icons/` (the header's glowing sun on paper: 192, 512, a maskable 512, and Apple's 180).
   The Studio's layout links them and sets Apple's web-app tags. The manifest's scope is the whole site, so
   signing in (`/auth/sign-in`) stays inside the app. Static files are already public (`isPublicPath`), so
   the phone can fetch the icon before signing in.
4. **Safe areas.** `viewport-fit=cover`, so the bottom menu's existing `env(safe-area-inset-bottom)` padding
   clears the phone's home bar; the header gets the top inset the same way.
5. **Merging to `main`** brings everything on the Studio's branch since TASK-0013 (the test's back end, the
   Studio, the forecast, ADR-0012, files and doors, email). Its database prerequisites, by DEPLOY.md's rule
   (migrations before the merge): 0007 to 0010 are in the database already; 0011 (email) must run before
   the merge or the Email tab answers with an error until it does.

## Where the owner clicks

On the phone, in Safari: AGS's address (the Cloudflare one, see DEPLOY.md) → sign in → **Open Studio** →
Share → **Add to Home Screen**. From then on the **Studio** icon opens Today, full screen.

## Files

Created: `docs/tasks/TASK-0018-studio-on-the-phone.md`, `public/studio/manifest.webmanifest`,
`public/studio/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png`,
`src/studio/views/__tests__/video.test.ts`.
Modified: `src/app/studio/layout.tsx`, `src/components/studio/shell.tsx`, `src/components/studio/health.tsx`,
`src/studio/views/video.ts`.
