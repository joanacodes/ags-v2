/** The email screens' server side: brands kept apart, contents checked, consent kept, tests sent to the owner only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentContext } from "../../agents/context";
import { FakeTransport } from "../../claude/fake-transport";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import { MemoryStorage, MemoryStore } from "../../store/memory";
import { ActionError } from "../../views/actions";
import { allowedLinks, toBlocks } from "../draft";
import { newWorkflow, starterDesign, workflowProblems } from "../model";
import { addContact, deleteDesign, draftDesign, emailOverview, getDesign, importContacts, listContacts, saveBrandSettings, saveDesign, saveWorkflow, sendTest, updateContact } from "../views";

function context(store = new MemoryStore(), settings: Record<string, Record<string, unknown>> = {}): AgentContext {
  return { store, storage: new MemoryStorage(), transport: null, kit: defaultKit(), kitVersion: 1, settings: new StudioSettings(settings), now: new Date("2026-11-07T12:00:00Z"), trigger: "interactive", ownerId: "owner-1", dryRun: true };
}

async function refused(work: Promise<unknown>, status: number, message?: RegExp) {
  await assert.rejects(work, (err: unknown) => err instanceof ActionError && err.status === status && (!message || message.test(err.message)));
}

test("a design belongs to its brand: the other brand can't read, save over or delete it", async () => {
  const ctx = context();
  const d = await saveDesign(ctx, "astrostudy", null, starterDesign("newsletter", "en", "November letter"));
  assert.equal((await getDesign(ctx, "astrostudy", d.id)).content.name, "November letter");
  await refused(getDesign(ctx, "maison-tarot", d.id), 404);
  await refused(saveDesign(ctx, "maison-tarot", d.id, starterDesign("blank", "fr", "Lettre")), 404);
  await refused(deleteDesign(ctx, "maison-tarot", d.id), 404);
  await refused(getDesign(ctx, "astrostudy", "not-an-id"), 404);
  const overview = await emailOverview(ctx, "maison-tarot");
  assert.deepEqual(overview.designs, []);
  assert.equal((await emailOverview(ctx, "astrostudy")).designs.length, 1);
});

test("workflows: saved as drafts, never switched on yet, the test trigger and designs kept to their brand", async () => {
  const ctx = context();
  const own = await saveDesign(ctx, "maison-tarot", null, starterDesign("blank", "fr", "Bienvenue"));
  const other = await saveDesign(ctx, "astrostudy", null, starterDesign("blank", "en", "Welcome"));
  const wf = newWorkflow("Bienvenue", "maison-tarot");
  const withDesign = { ...wf, steps: wf.steps.map((s) => (s.type === "send" ? { ...s, design_id: own.id } : s)) };
  const saved = await saveWorkflow(ctx, "maison-tarot", null, { content: withDesign, status: "draft" });
  assert.equal(saved.status, "draft");
  assert.deepEqual(saved.problems, []);
  await refused(saveWorkflow(ctx, "maison-tarot", saved.id, { content: withDesign, status: "on" }), 409, /can't be switched on yet/);
  await refused(saveWorkflow(ctx, "maison-tarot", null, { content: { ...wf, trigger: { type: "test-finished" } }, status: "draft" }), 400, /only The Astro Study has the test/);
  const foreign = { ...wf, steps: wf.steps.map((s) => (s.type === "send" ? { ...s, design_id: other.id } : s)) };
  await refused(saveWorkflow(ctx, "maison-tarot", null, { content: foreign, status: "draft" }), 400, /isn't this brand's/);
  await refused(deleteDesign(ctx, "maison-tarot", own.id), 409, /Bienvenue/);
  assert.deepEqual(workflowProblems(newWorkflow("x", "astrostudy"), new Set()), ["Email 1: choose a design, or let the AI write it.", "Email 2: choose a design, or let the AI write it."]);
});

test("contacts: consent required and kept, one per address and brand, unsubscribing only, bad lines reported", async () => {
  const ctx = context();
  const ana = { email: "ana@example.com", name: "Ana", language: "fr", tags: ["Test"], source: "", consent_text: "She asked me at the market", status: "subscribed" };
  await addContact(ctx, "astrostudy", ana);
  await refused(addContact(ctx, "astrostudy", ana), 409, /already in the list/);
  await addContact(ctx, "maison-tarot", ana);
  await assert.rejects(addContact(ctx, "astrostudy", { ...ana, email: "bob@example.com", consent_text: "" }));
  const report = await importContacts(ctx, "astrostudy", { csv: "email,name\nana@example.com,Ana again\ncid@example.com,Cid\nbroken", language: "en", source: "calls", consent_text: "Signed up on the calls form", status: "subscribed", tags: ["calls"] });
  assert.deepEqual(report, { added: 1, skipped: 1, problems: ["line 4: “broken” is not an email address"], problemCount: 1 });
  const { rows, total } = await listContacts(ctx, "astrostudy", {});
  assert.equal(total, 2);
  const kept = rows.find((r) => r.email === "ana@example.com")!;
  assert.equal(kept.name, "Ana");
  assert.equal(kept.consent_text, "She asked me at the market");
  assert.deepEqual(kept.tags, ["test"]);
  await updateContact(ctx, "astrostudy", kept.id, { status: "unsubscribed" });
  assert.equal((await listContacts(ctx, "astrostudy", { status: "unsubscribed" })).rows[0]?.email, "ana@example.com");
  await assert.rejects(updateContact(ctx, "astrostudy", kept.id, { status: "subscribed" }));
  await refused(updateContact(ctx, "maison-tarot", kept.id, { name: "x" }), 404);
  assert.equal((await emailOverview(ctx, "maison-tarot")).contacts.subscribed, 1);
});

test("a test goes to the owner only, from the brand's sender, once everything it needs is set", async () => {
  const ctx = context(new MemoryStore(), { global: { owner_email: "owner@example.com" } });
  const design = starterDesign("announcement", "en", "Launch");
  const before = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "";
  try {
    await refused(sendTest(ctx, "astrostudy", design), 400, /no Resend key/);
    process.env.RESEND_API_KEY = "re_test";
    await refused(sendTest(ctx, "astrostudy", design), 400, /sender address/);
    await refused(saveBrandSettings(ctx, "astrostudy", { ...(await emailOverview(ctx, "astrostudy")).settings, sender_email: "not an address" }), 400, /sender address/);
    await saveBrandSettings(ctx, "astrostudy", { ...(await emailOverview(ctx, "astrostudy")).settings, sender_email: "hello@astrostudy.co.uk", reply_to: "joana@astrostudy.co.uk" });
    const sent: Record<string, unknown>[] = [];
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ id: "email-1" });
    }) as typeof fetch;
    assert.deepEqual(await sendTest(ctx, "astrostudy", design, fake), { to: "owner@example.com", id: "email-1" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.from, "The Astro Study <hello@astrostudy.co.uk>");
    assert.deepEqual(sent[0]!.to, ["owner@example.com"]);
    assert.equal(sent[0]!.reply_to, "joana@astrostudy.co.uk");
    assert.equal(sent[0]!.subject, "[Test] Launch");
  } finally {
    process.env.RESEND_API_KEY = before;
  }
});

test("Write it for me: a draft in the brand's language, its cost on a run, nothing saved", async () => {
  const store = new MemoryStore();
  const transport = new FakeTransport();
  const ctx = { ...context(store), transport };
  await refused(draftDesign(ctx, "astrostudy", { brief: "hi", language: "en", current: null }), 400, /say in a sentence/);
  const draft = await draftDesign(ctx, "astrostudy", { brief: "Thank people who took the test and explain their score", language: "fr", current: starterDesign("blank", "fr", "Merci") });
  assert.equal(draft.subject, "Votre résultat, et la suite");
  assert.deepEqual(draft.blocks.map((b) => b.type), ["heading", "text", "image", "button"]);
  const button = draft.blocks.find((b) => b.type === "button");
  assert.equal(button?.type === "button" ? button.href : null, "https://astrostudy.co.uk/fr/test/");
  assert.match(transport.calls[0]!.system[0]!.text, /standing_rules/);
  assert.equal(store.runRows.length, 1);
  assert.equal(store.runRows[0]!.details.action, "email-draft");
  assert.equal(store.runRows[0]!.details.brand, "astrostudy");
  assert.equal(store.emailDesignRows.length, 0);
  const tarot = await draftDesign({ ...ctx, transport: new FakeTransport() }, "maison-tarot", { brief: "Present the new Major Arcana designs", language: "en", current: null });
  const tarotButton = tarot.blocks.find((b) => b.type === "button");
  assert.equal(tarotButton?.type === "button" ? tarotButton.href : null, "", "Maison Tarot has no link list: the button waits for one");
});

test("an AI draft: ids added, links only from the brand's list, a picture left for the owner to choose", () => {
  const ctx = context();
  const links = allowedLinks(ctx, "astrostudy", "en", "Point them to https://astrostudy.co.uk/blog/new-moon/ please", null);
  assert.ok(links.includes("https://astrostudy.co.uk/test/"));
  assert.ok(links.includes("https://astrostudy.co.uk/blog/new-moon/"));
  assert.deepEqual(allowedLinks(ctx, "maison-tarot", "fr", "no link here", null), []);
  const blocks = toBlocks(
    {
      subject: "s",
      preheader: "p",
      blocks: [
        { type: "heading", text: "Hello {{first_name}},", href: "", cite: "", level: 1 },
        { type: "button", text: "Take the test", href: "https://astrostudy.co.uk/test/", cite: "", level: 1 },
        { type: "button", text: "Elsewhere", href: "https://evil.example/", cite: "", level: 1 },
        { type: "image", text: "the scorpion myth picture", href: "", cite: "", level: 1 },
        { type: "text", text: "  ", href: "", cite: "", level: 1 },
      ],
    },
    links,
  );
  assert.deepEqual(
    blocks.map((b) => (b.type === "button" ? [b.type, b.label, b.href] : b.type === "image" ? [b.type, b.alt, b.src] : [b.type])),
    [["heading"], ["button", "Take the test", "https://astrostudy.co.uk/test/"], ["button", "Elsewhere", ""], ["image", "the scorpion myth picture", ""]],
  );
  assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length);
});
