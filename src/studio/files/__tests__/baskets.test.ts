/** The two baskets: what they list, how files group into items, and how GitHub is asked. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASKETS,
  basketItems,
  forgetListings,
  githubTokenFromEnv,
  githubUrl,
  kindOf,
  listCopy,
  pretty,
  rawUrl,
  readBaskets,
  refusal,
  splitName,
  versionPath,
  type Basket,
  type CopyListing,
  type TreeEntry,
} from "../baskets";

const astro = BASKETS.find((b) => b.key === "astrostudy")!;
const tarot = BASKETS.find((b) => b.key === "maison-tarot")!;

const blob = (path: string, size = 100): TreeEntry => ({ path, type: "blob", size });
const listing = (entries: TreeEntry[], readAt = "2026-11-07T12:00:00.000Z"): CopyListing => ({ ok: true, entries, truncated: false, readAt });

test("names: kinds by format, versions after --, words for slugs", () => {
  assert.equal(kindOf("a/b.PNG"), "picture");
  assert.equal(kindOf("x.svg"), "drawing");
  assert.equal(kindOf("loop.webm"), "video");
  assert.equal(kindOf("caption.md"), "text");
  assert.equal(kindOf("deck.pdf"), "document");
  assert.equal(kindOf("page.html"), null);
  assert.equal(kindOf("README"), null);
  assert.deepEqual(splitName("aquarius--white-on-black.png"), { stem: "aquarius--white-on-black", base: "aquarius", version: "white-on-black", ext: "png" });
  assert.deepEqual(splitName("ar00.jpg"), { stem: "ar00", base: "ar00", version: null, ext: "jpg" });
  assert.deepEqual(splitName("--odd.png"), { stem: "--odd", base: "--odd", version: null, ext: "png" });
  assert.equal(pretty("paper-cut"), "Paper cut");
  assert.equal(pretty("aphrodite-goddess-of-love"), "Aphrodite goddess of love");
  assert.equal(pretty("ar00-the-fool"), "ar00 the fool");
  assert.equal(pretty("brush--the-centaur-archer"), "Brush · the centaur archer");
  assert.equal(pretty("2026-11-09-new-moon-in-scorpio"), "2026-11-09 · new moon in scorpio");
});

test("addresses: raw files by refs/heads, slashes in a branch kept, names encoded", () => {
  assert.equal(rawUrl("joanacodes/maison-tarot", "claude/astrostudy-website-tdhyzt", "images/cards/line/ar00-the-fool--white-on-black.png"), "https://raw.githubusercontent.com/joanacodes/maison-tarot/refs/heads/claude/astrostudy-website-tdhyzt/images/cards/line/ar00-the-fool--white-on-black.png");
  assert.equal(rawUrl("joanacodes/astrostudy", "main", "media/my posts/été #1.png"), "https://raw.githubusercontent.com/joanacodes/astrostudy/refs/heads/main/media/my%20posts/%C3%A9t%C3%A9%20%231.png");
  assert.equal(githubUrl("joanacodes/astrostudy", "main", "media/a.png"), "https://github.com/joanacodes/astrostudy/blob/main/media/a.png");
  assert.equal(versionPath({ folder: "" }, { file: "logo.svg" }), "logo.svg");
  assert.equal(versionPath({ folder: "static" }, { file: "logo.svg" }), "static/logo.svg");
});

test("a design's four versions and its drawing are one item, in a fixed order, a picture on the cover", () => {
  const { items } = basketItems(astro, [
    listing([
      blob("media/myths/silhouettes/ares-god-of-war.svg"),
      blob("media/myths/silhouettes/ares-god-of-war--black-on-white.png"),
      blob("media/myths/silhouettes/ares-god-of-war--white-on-black.png"),
      blob("media/symbols/feed/line/aquarius--black-transparent.png"),
      blob("media/symbols/feed/line/aquarius--white-transparent.png"),
      blob("media/symbols/feed/line/aquarius--black-on-white.png"),
      blob("media/symbols/feed/line/aquarius--white-on-black.png"),
      blob("media/myths/mono/brush--the-centaur-archer.png"),
      blob("media/myths/mono/line--the-centaur-archer.png"),
    ]),
  ]);
  assert.deepEqual(
    items.map((i) => [i.folder, i.name, i.versions.map((v) => v.label), i.cover, i.kinds]),
    [
      ["media/myths/mono", "Brush · the centaur archer", ["The centaur archer"], 0, ["picture"]],
      ["media/myths/mono", "Line · the centaur archer", ["The centaur archer"], 0, ["picture"]],
      ["media/myths/silhouettes", "Ares god of war", ["White on black", "Black on white", "Drawing (SVG)"], 0, ["drawing", "picture"]],
      ["media/symbols/feed/line", "Aquarius", ["White on black", "Black on white", "White ink, transparent", "Black ink, transparent"], 0, ["picture"]],
    ],
  );
  const aquarius = items[3]!;
  assert.equal(aquarius.id, "astrostudy:main:media/symbols/feed/line/aquarius");
  assert.deepEqual(aquarius.versions.map((v) => v.transparent), [false, false, true, true]);
});

test("the same name in two formats is one item; a version two formats share says which", () => {
  const { items } = basketItems(astro, [
    listing([blob("assets/cards/ar00.webp"), blob("assets/cards/ar00.jpg"), blob("x/meadow--wide.webm"), blob("x/meadow--wide.mp4"), blob("x/logo.svg")]),
  ]);
  assert.deepEqual(
    items.map((i) => [i.name, i.versions.map((v) => v.label), i.cover]),
    [
      ["ar00", ["JPG", "WebP"], 0],
      ["Logo", ["Drawing (SVG)"], 0],
      ["Meadow", ["Wide · MP4", "Wide · WebM"], 0],
    ],
  );
});

test("text only beside media; hidden folders, other files and folders are left out", () => {
  const { items, shelves } = basketItems(astro, [
    listing([
      blob("media/posts/the-blind-test/post.png"),
      blob("media/posts/the-blind-test/caption.md"),
      blob("content/en/astrology/chiron.md"),
      blob("README.md"),
      blob(".github/preview.png"),
      blob("tools/node_modules/pkg/icon.png"),
      blob("layouts/index.html"),
      { path: "media/posts", type: "tree" },
    ]),
  ]);
  assert.deepEqual(items.map((i) => [i.folder, i.name, i.kinds]), [
    ["media/posts/the-blind-test", "Caption", ["text"]],
    ["media/posts/the-blind-test", "Post", ["picture"]],
  ]);
  assert.deepEqual(shelves, [{ ref: "main", label: null, files: 2, error: null, truncated: false }]);
});

test("main wins on a path both copies have; the work copy adds only what main lacks", () => {
  const { items, shelves } = basketItems(tarot, [
    listing([blob("assets/cards/ar00.jpg", 5), blob("static/favicon.svg")]),
    listing([blob("assets/cards/ar00.jpg", 9), blob("static/favicon.svg"), blob("images/cards/line/ar00-the-fool--white-on-black.png"), blob("images/cards/silhouettes/ar00-the-fool.svg")]),
  ]);
  assert.deepEqual(items.map((i) => [i.ref, i.folder, i.name]), [
    ["main", "assets/cards", "ar00"],
    ["claude/astrostudy-website-tdhyzt", "images/cards/line", "ar00 the fool"],
    ["claude/astrostudy-website-tdhyzt", "images/cards/silhouettes", "ar00 the fool"],
    ["main", "static", "Favicon"],
  ]);
  assert.equal(items[0]!.versions[0]!.size, 5);
  assert.deepEqual(shelves.map((s) => [s.ref, s.label, s.files]), [
    ["main", null, 2],
    ["claude/astrostudy-website-tdhyzt", "Work copy", 2],
  ]);
});

test("a copy that can't be read says why; the other copy still shows", () => {
  const { items, shelves } = basketItems(tarot, [{ ok: false, error: "GitHub answered 500 for joanacodes/maison-tarot at main." }, listing([blob("images/cards/line/ar01--white-on-black.png")])]);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.ref, "claude/astrostudy-website-tdhyzt");
  assert.equal(shelves[0]!.error, "GitHub answered 500 for joanacodes/maison-tarot at main.");
  assert.equal(shelves[1]!.error, null);
  assert.throws(() => basketItems(tarot, [listing([])]), /1 listings for 2 copies/);
});

test("the same listings give the same items, in the same order, with the same ids", () => {
  const entries = [blob("b/2.png"), blob("b/10.png"), blob("a/z--black-on-white.png"), blob("a/z--white-on-black.png"), blob("b/1.png")];
  const once = basketItems(astro, [listing(entries)]);
  const again = basketItems(astro, [listing([...entries].reverse())]);
  assert.deepEqual(once, again);
  assert.deepEqual(once.items.map((i) => i.id), ["astrostudy:main:a/z", "astrostudy:main:b/1", "astrostudy:main:b/2", "astrostudy:main:b/10"]);
  assert.deepEqual(basketItems(astro, [listing([])]).items, []);
});

/* ------------------------------------------------------------------ GitHub */

type Call = { url: string; auth: string | null };

function fakeGitHub(answer: (url: string, auth: string | null) => Response, calls: Call[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization") });
    return answer(url, headers.get("authorization"));
  }) as typeof fetch;
}

test("one call per copy, the branch encoded; a key that's refused is dropped once", async () => {
  const calls: Call[] = [];
  const fetchImpl = fakeGitHub((_url, auth) => (auth ? new Response("{}", { status: 404 }) : Response.json({ tree: [blob("a.png"), { path: 7 }], truncated: true })), calls);
  const got = await listCopy("joanacodes/maison-tarot", "claude/astrostudy-website-tdhyzt", { token: "k", fetchImpl, now: () => Date.parse("2026-11-07T12:00:00Z") });
  assert.deepEqual(got, { ok: true, entries: [blob("a.png")], truncated: true, readAt: "2026-11-07T12:00:00.000Z" });
  assert.deepEqual(calls, [
    { url: "https://api.github.com/repos/joanacodes/maison-tarot/git/trees/claude%2Fastrostudy-website-tdhyzt?recursive=1", auth: "Bearer k" },
    { url: "https://api.github.com/repos/joanacodes/maison-tarot/git/trees/claude%2Fastrostudy-website-tdhyzt?recursive=1", auth: null },
  ]);
});

test("GitHub's refusals in words: the hourly limit with its Paris time, a missing copy, a bad answer, no network", async () => {
  const limited = new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.parse("2026-11-07T13:45:00Z") / 1000) } });
  assert.equal(refusal(limited, "joanacodes/astrostudy", "main"), "GitHub's hourly limit is used up until 14:45 (Paris time). A GitHub key in Settings → Keys raises it.");
  // The limit is not the key's fault: no second call without it.
  const calls: Call[] = [];
  const once = await listCopy("joanacodes/astrostudy", "main", { token: "k", fetchImpl: fakeGitHub(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }), calls) });
  assert.deepEqual(once, { ok: false, error: "GitHub's hourly limit is used up. A GitHub key in Settings → Keys raises it." });
  assert.equal(calls.length, 1);
  assert.deepEqual(await listCopy("joanacodes/astrostudy", "gone", { fetchImpl: fakeGitHub(() => new Response("{}", { status: 404 })) }), {
    ok: false,
    error: "GitHub doesn't know joanacodes/astrostudy at gone: the copy may be gone, or the repository private.",
  });
  assert.deepEqual(await listCopy("joanacodes/astrostudy", "main", { fetchImpl: fakeGitHub(() => Response.json({ message: "?" })) }), { ok: false, error: "GitHub's answer for joanacodes/astrostudy at main has no file list." });
  const offline = (async () => {
    throw new Error("getaddrinfo ENOTFOUND api.github.com");
  }) as typeof fetch;
  assert.deepEqual(await listCopy("joanacodes/astrostudy", "main", { fetchImpl: offline }), { ok: false, error: "joanacodes/astrostudy at main could not be read: getaddrinfo ENOTFOUND api.github.com" });
});

test("both baskets, each from its own repository only; listings kept ten minutes, refusals never", async () => {
  forgetListings();
  let clock = Date.parse("2026-11-07T12:00:00Z");
  const calls: Call[] = [];
  let failMain = true;
  const fetchImpl = fakeGitHub((url) => {
    if (url.includes("/joanacodes/astrostudy/")) return Response.json({ tree: [blob("media/symbols/feed/line/aries--white-on-black.png")] });
    if (url.includes("/trees/main?") && failMain) return new Response("{}", { status: 502 });
    if (url.includes("/trees/main?")) return Response.json({ tree: [blob("assets/cards/ar00.jpg")] });
    return Response.json({ tree: [blob("images/cards/line/ar00-the-fool--white-on-black.png")] });
  }, calls);
  const opts = { fetchImpl, now: () => clock };
  const first = await readBaskets(opts);
  assert.equal(calls.length, 3);
  assert.deepEqual(first.baskets.map((b) => [b.key, b.repo, b.items, b.shelves.map((s) => s.error)]), [
    ["astrostudy", "joanacodes/astrostudy", 1, [null]],
    ["maison-tarot", "joanacodes/maison-tarot", 1, ["GitHub answered 502 for joanacodes/maison-tarot at main.", null]],
  ]);
  for (const item of first.items) assert.ok(item.id.startsWith(`${item.basket}:`));
  assert.deepEqual(first.items.map((i) => i.basket), ["astrostudy", "maison-tarot"]);

  // Five minutes on: the two good listings are kept, the refused one is asked again.
  failMain = false;
  clock += 5 * 60_000;
  const second = await readBaskets(opts);
  assert.equal(calls.length, 4);
  assert.deepEqual(second.items.map((i) => [i.basket, i.ref, i.name]), [
    ["astrostudy", "main", "Aries"],
    ["maison-tarot", "main", "ar00"],
    ["maison-tarot", "claude/astrostudy-website-tdhyzt", "ar00 the fool"],
  ]);
  assert.equal(second.baskets[1]!.readAt, "2026-11-07T12:00:00.000Z");

  // Refresh asks every copy again; so does the eleventh minute.
  await readBaskets({ ...opts, fresh: true });
  assert.equal(calls.length, 7);
  clock += 11 * 60_000;
  await readBaskets(opts);
  assert.equal(calls.length, 10);
  forgetListings();
});

test("the key read with: the sources' own, else the Studio's GitHub key, else the workflow's", () => {
  assert.equal(githubTokenFromEnv({}), null);
  assert.equal(githubTokenFromEnv({ GITHUB_TOKEN: "w", GITHUB_STUDIO_TOKEN: " s " }), "s");
  assert.equal(githubTokenFromEnv({ GITHUB_TOKEN: "w", GITHUB_STUDIO_TOKEN: "s", STUDIO_SOURCES_TOKEN: "o" }), "o");
  assert.equal(githubTokenFromEnv({ GITHUB_TOKEN: "w", STUDIO_SOURCES_TOKEN: "  " }), "w");
});

test("the baskets are the two repositories, main first", () => {
  const shape = (b: Basket) => [b.key, b.repo, b.shelves.map((s) => s.ref)];
  assert.deepEqual(BASKETS.map(shape), [
    ["astrostudy", "joanacodes/astrostudy", ["main"]],
    ["maison-tarot", "joanacodes/maison-tarot", ["main", "claude/astrostudy-website-tdhyzt"]],
  ]);
});
