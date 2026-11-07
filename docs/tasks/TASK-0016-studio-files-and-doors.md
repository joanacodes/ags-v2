# TASK-0016 — The Studio's files (two baskets) and AGS's two doors

The owner opens AGS's main page and chooses a door: **Open AGS** (birth charts, synastry, readings) or
**Open Studio**. In the Studio, **Files** opens two baskets: the pictures and files of The Astro Study's
repository and of Maison Tarot's, each shown with the repository it comes from, to view, copy and download
in the format asked for.

## Status

Authorized by the owner (the architect), 7 November 2026, in these words:

- "The creative studio is IN ags. Its just a total other page. Like for example, if I open the main page, ags
  shows me "Open Studio" and "Open AGS" (synastry and birthchart readings)"
- "If I click on "open images/files" or whatever, it fetches from both repos, shows me the media and from what
  repo it is, then I do whatever i want with the file. […] It's like the studio has two baskets to fetch things
  from."
- "lets save the pictures in github, and fetch the visual on ags from the ags github repository. I can view, ask
  to modify + download in formats I want png/jpg/svg/pdf(depending on whats asked."
- "Don't move anything from now I want each repo to have its. Respective content. The studio just fetches and
  copies them."
- "I want to make sure that Astro Study and Maison Tarot do not mix at all."

Built and tested locally on the Studio's branch; nothing here needs the Studio's migrations, so Files works
before they are run.

## Decisions

1. **The doors are AGS's main page, for the owner.** `/` shows the owner (STUDY_OWNER_USER_ID, checked on the
   server by the Studio's `viewer()`) two doors: *Open AGS* → `/dashboard`, *Open Studio* → `/studio`. Signed
   out, `/` is the landing page as before; its *Sign in* now returns to `/`. Anyone else signed in goes to
   `/dashboard`, where signing in already took them. AGS's sidebar brand and the Studio's header both lead
   back to `/`.
2. **Two baskets, read only, straight from GitHub.** *The Astro Study* is `joanacodes/astrostudy` (`main`).
   *Maison Tarot* is `joanacodes/maison-tarot` (`main`), plus its work copy `claude/astrostudy-website-tdhyzt`,
   where the 22 Major Arcana designs are and `main` doesn't have them yet; on a path both have, `main` wins,
   so the work copy only adds what `main` lacks. Nothing is copied into AGS, its database or Storage, and the
   Studio never writes to either repository: each keeps its own content.
3. **The baskets never mix.** Every item carries its basket; a basket's folders are listed under its own name
   and repository; a search across both labels each result with its basket; a download's file name starts
   with the basket (`astrostudy-…`, `maison-tarot-…`).
4. **One API call per copy, ten minutes in memory.** `GET /api/studio/files` lists each copy with one call to
   GitHub's git trees API (recursive), kept ten minutes per server process; *Refresh* asks again. Both
   repositories are public (as decision 40 of TASK-0014 says), so no key is needed; one is used when set,
   for GitHub's higher hourly limit: `STUDIO_SOURCES_TOKEN`, else `GITHUB_STUDIO_TOKEN` (Settings → Keys),
   else `GITHUB_TOKEN`. A call a key is refused for (401, 403, 404) is asked once more without it. A copy
   that can't be read says why on the screen; the other copies still show.
5. **The browser loads the files from `raw.githubusercontent.com`**, which the API's hourly limit doesn't
   count and which answers any origin (`Access-Control-Allow-Origin: *`); branch names go in as
   `refs/heads/…`, so a name with slashes reads exactly. No AGS function carries a picture.
6. **What a basket lists.** Pictures (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`), drawings (`svg`), videos
   (`mp4`, `webm`, `mov`), PDFs, and text (`md`, `txt`) only in a folder that also holds one of those (a
   post's caption). Hidden folders are skipped. In one folder, files with the same name before `--` (or the
   same name in other formats) are one item with versions: the designs' four versions, a silhouette's SVG
   beside its two pictures, a card's JPG beside its WebP. Order is fixed: the four known versions first
   (white on black, black on white, white ink, black ink), then the rest by name, then by format.
7. **Browsing is by folder**, like a file explorer: a folder card shows its first picture and how many items
   it holds; a chain of folders with nothing else in it is one card (`Symbols › Feed`); at a basket's root,
   a folder holding only folders shows those instead (`Media › Myths`, `Media › Posts`…), so the
   collections are one tap away. Kinds (pictures, drawings, videos, text) and a search narrow everything.
   Grids show 48 items at a time.
8. **Downloads are made in the browser**, nothing is sent anywhere: PNG and JPG through a canvas; PDF with
   pdfmake (already AGS's, loaded only when asked), one page the picture's shape at 300 dpi, a drawing kept
   as vector when pdfmake can draw it (a picture inside the PDF otherwise, and the screen says so); SVG only
   for a drawing, never a picture wrapped in SVG; any other format as the original file. A transparent
   picture or a drawing can be put on white, black or the Studio's paper (a JPG can't be transparent: with
   *None*, a light ink gets black and a dark ink white; a PDF in light ink gets black too, since its page
   reads as white, and the screen says so). A drawing is drawn at 1080, 2000 or 4000 px. A text file has
   *Copy*, and a picture shows the text file of its folder (a post's caption) with *Copy*.

## AGS compliance (AGENTS.md)

- **Governing documents read:** `AGENTS.md`, `AGS_MASTER_SPEC.md`, ADR-0001 to ADR-0012 (there is no
  `docs/architecture/` directory), TASK-0014 and this file.
- **Created:** `src/studio/files/baskets.ts` (the baskets, the listing and the grouping),
  `src/studio/files/__tests__/baskets.test.ts`, `src/app/api/studio/files/route.ts`,
  `src/app/studio/files/page.tsx`, `src/app/studio/files/files-screen.tsx`,
  `src/components/studio/file-export.ts` (the downloads, browser only), `src/components/landing/doors.tsx`,
  this file.
- **Modified:** `src/app/page.tsx` (the doors for the owner), `src/components/studio/shell.tsx` (*Files* in the
  menu; the way back to the doors), `src/components/layout/sidebar.tsx` (the brand leads to `/`).
- **Excluded:** the engine, AGS's other pages and routes, its middleware, its sign-in, every migration, the
  Studio's agents, store and workers, and both basket repositories.
- **No new dependency, no ADR changed.** The listing is Studio code beside the site job (`inputs/sources.ts`)
  and imports nothing from the engine (ADR-0010); no astrology meaning is written anywhere (ADR-0001, 0002).

## Not built (open)

- **Ask to modify.** The owner wants to ask for a change to a file. Which hand makes it is the open decision:
  a model that edits pictures, the render worker's templates (text, background, format), or a request
  queued for a coding session. Changes would be saved back to the file's own repository or kept in the
  Studio, also to decide.
- **The lead magnet maker and the strategy workflow** (newsletter, posts, lead magnets).
- **Maison Tarot's own space in the Studio's agents.** The kit and the writers are The Astro Study's; Files
  only shows Maison Tarot's files.
- **More baskets from Settings** (other projects); the two are fixed in code for now.
- **Light thumbnails.** Tiles load the files themselves (a mosaic design is about 700 KB); a resized copy
  would need a service or files the repositories don't have.

## Validation

7 November 2026, on the Studio's branch:

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 258 tests pass, 13 of them the baskets' (names and kinds, versions grouped and ordered, text
  only beside media, main winning over the work copy, a copy that fails beside one that reads, the same
  listings giving the same items and ids, the branch encoded, a refused key dropped once, the hourly limit
  in Paris time, listings kept ten minutes and refusals never).
- `npm run build`: clean; `/` is now rendered per request (it asks who is signing in only when a sign-in
  cookie is there); `/studio/files` is 15.7 kB.
- `npm run cf:build` (OpenNext): clean; the server bundle is 2.41 MB gzipped (the free plan's limit is 3 MB).
- The local demo (`STUDIO_DEMO=1`, `STUDIO_DEV_OWNER=1`) in Chromium, phone and laptop: the doors; both
  baskets (The Astro Study: 567 items from 2,061 files; Maison Tarot: 381 items, 260 files from `main` and
  727 from the work copy), every picture loaded from `raw.githubusercontent.com`. This machine's network
  refused GitHub's API for `maison-tarot` and had used up GitHub's hourly limit without a key, which the
  screen said in those words; the listings were then answered from trees read from GitHub earlier that day.
- Downloads checked file by file: a PNG as is (see-through kept); a white-ink JPG on black, then on paper;
  a white-ink PDF on black and a black-ink PDF see-through (an image with its mask); a drawing's SVG as is,
  its PNG at 1080 px, its PDF as vector at 259.2 pt (the Fool's mask drawn right); a JPG card as is, as PNG,
  and as a PDF holding the JPEG unchanged; a WebP as the original; a post's caption shown beside it.
