/** The Studio's email: the shapes and their defaults, the contacts import, and a design rendered as an email. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brandSettingsOf,
  cleanTags,
  DEFAULT_BRAND_SETTINGS,
  designContentSchema,
  newBlock,
  newContactSchema,
  newWorkflow,
  parseContactsCsv,
  starterDesign,
  triggerProblem,
  workflowContentSchema,
  type DesignContent,
} from "../model";
import { inlineHtml, inlineText, mergeName, mix, renderEmail, safeImage, safeLink } from "../render";

const settings = DEFAULT_BRAND_SETTINGS.astrostudy;

function design(blocks: DesignContent["blocks"], extra: Partial<DesignContent> = {}): DesignContent {
  return { name: "Test", subject: "Hello {{first_name}}", preheader: "A short line", language: "en", blocks, ...extra };
}

test("brand settings: stored values over the defaults, a broken field keeps its default", () => {
  assert.deepEqual(brandSettingsOf("astrostudy", null), DEFAULT_BRAND_SETTINGS.astrostudy);
  const s = brandSettingsOf("maison-tarot", { sender_email: "hello@maisontarot.example", colors: { accent: "#123456", page: "not a colour" }, fonts: { heading: "comic" }, unknown: 1 });
  assert.equal(s.sender_email, "hello@maisontarot.example");
  assert.equal(s.colors.accent, "#123456");
  assert.equal(s.colors.page, DEFAULT_BRAND_SETTINGS["maison-tarot"].colors.page);
  assert.equal(s.fonts.heading, DEFAULT_BRAND_SETTINGS["maison-tarot"].fonts.heading);
  assert.equal("unknown" in s, false);
});

test("designs and workflows: starters pass their own checks; the test trigger is The Astro Study's", () => {
  for (const starter of ["blank", "newsletter", "announcement"] as const) assert.equal(designContentSchema.safeParse(starterDesign(starter, "fr", "Lettre")).success, true);
  assert.equal(designContentSchema.safeParse({ ...starterDesign("blank", "en", ""), name: "  " }).success, false);
  assert.equal(workflowContentSchema.safeParse(newWorkflow("Welcome", "astrostudy")).success, true);
  assert.equal(newWorkflow("Bienvenue", "maison-tarot").trigger.type, "signup");
  assert.equal(triggerProblem("maison-tarot", { type: "test-finished" }), "only The Astro Study has the test");
  assert.equal(triggerProblem("astrostudy", { type: "test-finished" }), null);
  const ids = new Set(Array.from({ length: 50 }, () => newBlock("text").id));
  assert.equal(ids.size, 50);
});

test("contacts: an address is required, consent must be said, tags are cleaned", () => {
  assert.equal(newContactSchema.safeParse({ email: " Ana@Example.COM ", name: "Ana", language: "fr", tags: [], source: "hand", consent_text: "Asked me at the market" }).data?.email, "ana@example.com");
  assert.equal(newContactSchema.safeParse({ email: "not an address", name: "", language: "en", tags: [], source: "", consent_text: "yes, by email" }).success, false);
  assert.equal(newContactSchema.safeParse({ email: "a@b.co", name: "", language: "en", tags: [], source: "", consent_text: "" }).success, false);
  assert.deepEqual(cleanTags([" Test ", "test", "case file", ""]), ["test", "case-file"]);
});

test("contacts pasted as CSV: a header skipped, duplicates dropped, bad lines reported", () => {
  const { rows, problems } = parseContactsCsv("email,name,language,tags\nana@example.com,Ana,fr,test|calls\n\nbob@example.com;Bob\nana@example.com,Again\nnope,Nobody", "en");
  assert.deepEqual(rows, [
    { email: "ana@example.com", name: "Ana", language: "fr", tags: ["test", "calls"] },
    { email: "bob@example.com", name: "Bob", language: "en", tags: [] },
  ]);
  assert.deepEqual(problems, ["line 6: “nope” is not an email address"]);
});

test("links and pictures: only safe addresses go out", () => {
  assert.equal(safeLink("https://astrostudy.co.uk/test/"), "https://astrostudy.co.uk/test/");
  assert.equal(safeLink("mailto:hello@astrostudy.co.uk"), "mailto:hello@astrostudy.co.uk");
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("data:text/html,<b>x</b>"), null);
  assert.equal(safeLink("https://a.b/x y"), null);
  assert.equal(safeImage("http://example.com/a.png"), null);
  assert.equal(safeImage("https://raw.githubusercontent.com/joanacodes/astrostudy/refs/heads/main/media/a.png"), "https://raw.githubusercontent.com/joanacodes/astrostudy/refs/heads/main/media/a.png");
});

test("inline formatting is escaped first; a bad link keeps its words and loses its address", () => {
  assert.equal(inlineHtml("<b>**bold**</b> and *soft*", "s"), "&lt;b&gt;<strong>bold</strong>&lt;/b&gt; and <em>soft</em>");
  assert.equal(inlineHtml("[the test](https://astrostudy.co.uk/test/) or [x](javascript:alert(1))", "s"), '<a href="https://astrostudy.co.uk/test/" style="s">the test</a> or x');
  assert.equal(inlineText("Take **the** [test](https://astrostudy.co.uk/test/)"), "Take the test (https://astrostudy.co.uk/test/)");
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
});

test("first names: the name, else the fallback, else nothing and no stray space", () => {
  assert.equal(mergeName("Hello {{first_name}},", "Joana Smith"), "Hello Joana,");
  assert.equal(mergeName("Hello {{first_name}},", null), "Hello,");
  assert.equal(mergeName("Bonjour {{ first_name | à vous }} !", ""), "Bonjour à vous !");
});

test("a design as an email: escaped, the footer always there, safe links only, the same bytes each time", () => {
  const d = design([
    { id: "b-head01", type: "heading", text: "<script>alert(1)</script> for {{first_name}}", level: 1, align: "left" },
    { id: "b-text01", type: "text", text: "First line\nsecond line\n\nA [link](https://astrostudy.co.uk/) and a [bad one](javascript:x)", align: "left" },
    { id: "b-img001", type: "image", src: "http://insecure.example/a.png", alt: "A", href: "", width: 100, align: "center" },
    { id: "b-btn001", type: "button", label: "Take the test", href: "https://astrostudy.co.uk/test/", align: "center", style: "solid" },
    { id: "b-btn002", type: "button", label: "Nowhere", href: "", align: "left", style: "outline" },
  ]);
  const opts = { unsubscribeUrl: "https://ags.example/u/abc", firstName: "Ana" };
  const out = renderEmail(d, "astrostudy", { ...settings, footer_address: "1 rue de Paris, 75001 Paris" }, opts);
  assert.equal(out.subject, "Hello Ana");
  assert.ok(!out.html.includes("<script>"));
  assert.ok(out.html.includes("&lt;script&gt;alert(1)&lt;/script&gt; for Ana"));
  assert.ok(out.html.includes('<a href="https://astrostudy.co.uk/" style="color:#b5512c;text-decoration:underline">link</a>'));
  assert.ok(!out.html.includes("javascript:"));
  assert.ok(!out.html.includes("insecure.example"), "an http picture is left out");
  assert.ok(out.html.includes("Take the test") && !out.html.includes("Nowhere"), "a button without a link is left out");
  assert.ok(out.html.includes("1 rue de Paris, 75001 Paris"));
  assert.ok(out.html.includes('href="https://ags.example/u/abc"') && out.html.includes(">Unsubscribe<"));
  assert.ok(out.html.includes("You&#39;re receiving this because you signed up at astrostudy.co.uk."));
  assert.ok(out.text.includes("A link (https://astrostudy.co.uk/) and a bad one"));
  assert.ok(out.text.includes("Take the test: https://astrostudy.co.uk/test/"));
  assert.ok(out.text.endsWith("Unsubscribe: https://ags.example/u/abc"));
  assert.deepEqual(renderEmail(d, "astrostudy", settings, opts), renderEmail(d, "astrostudy", settings, opts));
});

test("a preview shows where a picture or a link is missing; French gets French words", () => {
  const d = design([newBlock("image", "fr"), newBlock("button", "fr")], { language: "fr" });
  const preview = renderEmail(d, "maison-tarot", DEFAULT_BRAND_SETTINGS["maison-tarot"], { unsubscribeUrl: "#", preview: true });
  assert.ok(preview.html.includes("Choisir une image"));
  assert.ok(preview.html.includes("Découvrir"));
  assert.ok(preview.html.includes(">Se désinscrire<"));
  assert.ok(preview.html.includes('lang="fr"'));
  const real = renderEmail(d, "maison-tarot", DEFAULT_BRAND_SETTINGS["maison-tarot"], { unsubscribeUrl: "https://x.example/u" });
  assert.ok(!real.html.includes("Choisir une image") && !real.html.includes("Découvrir"));
});
