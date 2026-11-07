/** The sites' pages: addresses as Hugo makes them, drafts and legal pages left out. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { frontMatter, pageUrl, readSite, SITES } from "../sources";

const site = SITES["astrostudy"]!;

test("addresses follow the files, the slugs and the language", () => {
  assert.equal(pageUrl(site, "en", "content/en/astrology/chiron.md", {}), "https://astrostudy.co.uk/astrology/chiron/");
  assert.equal(pageUrl(site, "fr", "content/fr/birth-chart.md", { slug: "theme-natal" }), "https://astrostudy.co.uk/fr/theme-natal/");
  assert.equal(pageUrl(site, "en", "content/en/astrology/_index.md", {}), "https://astrostudy.co.uk/astrology/");
  assert.equal(pageUrl(site, "en", "content/en/_index.md", {}), "https://astrostudy.co.uk/");
  assert.equal(pageUrl(site, "en", "content/en/x.md", { url: "/special/" }), "https://astrostudy.co.uk/special/");
});

test("front matter is read; drafts, legal pages and the order flow are skipped", async () => {
  assert.deepEqual(frontMatter('---\ntitle: "Chiron"\ndescription: "The wounded healer"\n---\nBody'), { title: "Chiron", description: "The wounded healer" });
  const files: Record<string, string> = {
    "content/en/astrology/chiron.md": '---\ntitle: "Chiron"\ndescription: "The <em>wounded</em> healer"\n---\n',
    "content/en/blog/draft.md": '---\ntitle: "Soon"\ndraft: true\n---\n',
    "content/en/privacy.md": '---\ntitle: "Privacy"\n---\n',
    "content/fr/astrology/chiron.md": '---\ntitle: "Chiron"\nslug: "chiron"\n---\n',
  };
  const asked: string[] = [];
  const fake = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.includes("/git/trees/")) return Response.json({ tree: Object.keys(files).map((path) => ({ path, type: "blob" })) });
    const path = decodeURIComponent(url.split("/HEAD/")[1] ?? "");
    return files[path] ? new Response(files[path]) : new Response("", { status: 404 });
  }) as typeof fetch;
  const rows = await readSite(site, null, fake);
  assert.deepEqual(rows.map((r) => [r.language, r.url, r.title, r.description, r.section]), [
    ["en", "https://astrostudy.co.uk/astrology/chiron/", "Chiron", "The wounded healer", "astrology"],
    ["fr", "https://astrostudy.co.uk/fr/astrology/chiron/", "Chiron", null, "astrology"],
  ]);
  // One API call lists the files; every page comes from raw.githubusercontent.com, outside the API's limit.
  assert.equal(asked.filter((u) => u.startsWith("https://api.github.com/")).length, 1);
  assert.ok(asked.filter((u) => !u.includes("/git/trees/")).every((u) => u.startsWith("https://raw.githubusercontent.com/joanacodes/astrostudy/HEAD/")));
});
