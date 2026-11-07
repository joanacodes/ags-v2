/**
 * The email screens' server side, one brand at a time: every id is checked against its brand (an id of
 * the other brand is "no such…"), and every content is checked against its shape before it is saved
 * (ADR-0009). Nothing here sends to a contact: the only email that leaves is a test, to the owner.
 */
import { z } from "zod/v4";
import type { AgentContext } from "../agents/context";
import { sendBrandEmail } from "../clients/resend";
import type { EmailContactRow, EmailDesignRow, EmailWorkflowRow } from "../store/rows";
import { LANGUAGES } from "../types";
import { ActionError } from "../views/actions";
import { draftEmail } from "./draft";
import {
  blockSchema,
  BRAND_LABELS,
  brandSettingsOf,
  brandSettingsSchema,
  cleanTags,
  CONTACT_STATUSES,
  DEFAULT_WORKFLOW_SETTINGS,
  designContentSchema,
  emailAddress,
  isBrand,
  newContactSchema,
  parseContactsCsv,
  stepSchema,
  TRIGGER_LABELS,
  triggerProblem,
  triggerSchema,
  workflowContentSchema,
  workflowProblems,
  workflowSettingsSchema,
  WORKFLOW_STATUSES,
  type Block,
  type Brand,
  type BrandSettings,
  type ContactStatus,
  type DesignContent,
  type WorkflowContent,
  type WorkflowStatus,
} from "./model";
import { renderEmail } from "./render";

const OWNER = "owner";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function brandOf(raw: string): Brand {
  if (!isBrand(raw)) throw new ActionError("no such brand", 404);
  return raw;
}

function checkId(id: string, what: string): void {
  if (!UUID.test(id)) throw new ActionError(`no such ${what}`, 404);
}

async function settingsFor(ctx: AgentContext, brand: Brand): Promise<BrandSettings> {
  return brandSettingsOf(brand, (await ctx.store.emailBrand(brand))?.settings);
}

/* ---------------------------------------------------------------- sending */

export interface Sending {
  /** Everything a real send needs is there. */
  readonly ready: boolean;
  /** Plain sentences: what is missing, and where to add it. */
  readonly problems: string[];
  readonly from: string | null;
  readonly testTo: string | null;
}

function testAddress(ctx: AgentContext, s: BrandSettings): string | null {
  return s.test_email.trim() || ctx.settings.get("reminders").email || ctx.settings.get("global").owner_email || null;
}

function fromOf(brand: Brand, s: BrandSettings): string | null {
  const email = s.sender_email.trim();
  if (!email || !emailAddress.safeParse(email).success) return null;
  const name = (s.sender_name.trim() || BRAND_LABELS[brand]).replace(/[<>"]/g, "");
  return `${name} <${email}>`;
}

export function sendingState(ctx: AgentContext, brand: Brand, s: BrandSettings): Sending {
  const problems: string[] = [];
  if (!(process.env.RESEND_API_KEY ?? "").trim()) problems.push("No Resend key yet: Studio → Settings → Keys → Resend.");
  if (!s.sender_email.trim()) problems.push("No sender address yet: add it in this brand's email settings (an address on a domain verified in Resend).");
  else if (!fromOf(brand, s)) problems.push("The sender address doesn't look like an email address.");
  if (!s.footer_address.trim()) problems.push("No postal address for the footer yet: many countries require one in marketing emails.");
  return { ready: problems.length === 0, problems, from: fromOf(brand, s), testTo: testAddress(ctx, s) };
}

/* --------------------------------------------------------------- overview */

export interface DesignSummary {
  readonly id: string;
  readonly content: DesignContent;
  readonly updated_at: string;
}

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly status: WorkflowStatus;
  readonly trigger: string;
  readonly steps: number;
  readonly updated_at: string;
}

export interface EmailOverview {
  readonly brand: Brand;
  readonly label: string;
  readonly settings: BrandSettings;
  readonly sending: Sending;
  readonly designs: DesignSummary[];
  readonly workflows: WorkflowSummary[];
  readonly contacts: Record<ContactStatus, number>;
}

export async function emailOverview(ctx: AgentContext, brand: Brand): Promise<EmailOverview> {
  const [settings, designs, workflows, contacts] = await Promise.all([
    settingsFor(ctx, brand),
    ctx.store.emailDesigns(brand),
    ctx.store.emailWorkflows(brand),
    ctx.store.emailContactCounts(brand),
  ]);
  return {
    brand,
    label: BRAND_LABELS[brand],
    settings,
    sending: sendingState(ctx, brand, settings),
    designs: designs.map((d) => {
      const v = designOf(d);
      return { id: v.id, content: v.content, updated_at: v.updated_at };
    }),
    workflows: workflows.map((w) => {
      const trigger = triggerSchema.safeParse(w.trigger);
      return { id: w.id, name: w.name, status: w.status, trigger: trigger.success ? TRIGGER_LABELS[trigger.data.type] : "(no trigger)", steps: w.steps.length, updated_at: w.updated_at };
    }),
    contacts,
  };
}

export async function saveBrandSettings(ctx: AgentContext, brand: Brand, input: unknown): Promise<BrandSettings> {
  const s = brandSettingsSchema.parse(input);
  const addresses: [string, string][] = [
    ["The sender address", s.sender_email],
    ["The reply-to address", s.reply_to],
    ["The test address", s.test_email],
  ];
  for (const [label, value] of addresses) if (value.trim() && !emailAddress.safeParse(value).success) throw new ActionError(`${label} isn't an email address`);
  await ctx.store.putEmailBrand(brand, s, OWNER);
  return s;
}

/* ---------------------------------------------------------------- designs */

export interface DesignView {
  readonly id: string;
  readonly content: DesignContent;
  readonly updated_at: string;
  /** Blocks that no longer match their shape and were left out. */
  readonly dropped: number;
}

function designOf(row: EmailDesignRow): DesignView {
  const blocks: Block[] = [];
  let dropped = 0;
  for (const b of row.blocks) {
    const parsed = blockSchema.safeParse(b);
    if (parsed.success) blocks.push(parsed.data);
    else dropped += 1;
  }
  return { id: row.id, content: { name: row.name, subject: row.subject, preheader: row.preheader, language: row.language, blocks }, updated_at: row.updated_at, dropped };
}

async function ownDesign(ctx: AgentContext, brand: Brand, id: string): Promise<EmailDesignRow> {
  checkId(id, "design");
  const row = await ctx.store.emailDesign(id);
  if (!row || row.brand !== brand) throw new ActionError("no such design", 404);
  return row;
}

export async function getDesign(ctx: AgentContext, brand: Brand, id: string): Promise<DesignView> {
  return designOf(await ownDesign(ctx, brand, id));
}

export async function saveDesign(ctx: AgentContext, brand: Brand, id: string | null, input: unknown): Promise<DesignView> {
  const content = designContentSchema.parse(input);
  if (id) await ownDesign(ctx, brand, id);
  const row = await ctx.store.saveEmailDesign({ ...(id ? { id } : {}), brand, ...content }, OWNER);
  return designOf(row);
}

export async function duplicateDesign(ctx: AgentContext, brand: Brand, id: string): Promise<DesignView> {
  const d = await getDesign(ctx, brand, id);
  return saveDesign(ctx, brand, null, { ...d.content, name: `${d.content.name} (copy)`.slice(0, 80) });
}

export async function deleteDesign(ctx: AgentContext, brand: Brand, id: string): Promise<void> {
  await ownDesign(ctx, brand, id);
  const using = (await ctx.store.emailWorkflows(brand)).find((w) => w.steps.some((s) => typeof s === "object" && s !== null && (s as { design_id?: unknown }).design_id === id));
  if (using) throw new ActionError(`the workflow “${using.name}” sends this design: change that step first`, 409);
  await ctx.store.deleteEmailDesign(id);
}

/** The design as it is on screen (saved or not), sent once to the owner's test address. */
export async function sendTest(ctx: AgentContext, brand: Brand, input: unknown, fetchImpl: typeof fetch = fetch): Promise<{ to: string; id: string | null }> {
  const content = designContentSchema.parse(input);
  const s = await settingsFor(ctx, brand);
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  if (!key) throw new ActionError("There's no Resend key yet: add it in Studio → Settings → Keys.");
  const from = fromOf(brand, s);
  if (!from) throw new ActionError("add the sender address in this brand's email settings first");
  const to = testAddress(ctx, s);
  if (!to) throw new ActionError("where should the test go? Add a test address in this brand's email settings");
  const r = renderEmail(content, brand, s, { unsubscribeUrl: "#" });
  const sent = await sendBrandEmail(key, { from, to, subject: `[Test] ${r.subject || content.name}`, html: r.html, text: r.text, replyTo: s.reply_to.trim() || null }, fetchImpl);
  return { to, id: sent.id };
}

export async function draftDesign(ctx: AgentContext, brand: Brand, input: unknown) {
  const req = z.object({ brief: z.string().max(3000), language: z.enum(LANGUAGES), current: designContentSchema.nullable() }).parse(input);
  return draftEmail(ctx, brand, await settingsFor(ctx, brand), req);
}

/* -------------------------------------------------------------- workflows */

export interface WorkflowView {
  readonly id: string;
  readonly status: WorkflowStatus;
  readonly content: WorkflowContent;
  readonly updated_at: string;
  /** What would stop it from running, in plain words. */
  readonly problems: string[];
}

function workflowOf(row: EmailWorkflowRow, designIds: ReadonlySet<string>): WorkflowView {
  const trigger = triggerSchema.safeParse(row.trigger);
  const settings = workflowSettingsSchema.safeParse({ ...DEFAULT_WORKFLOW_SETTINGS, ...row.settings });
  const steps = row.steps.flatMap((s) => {
    const parsed = stepSchema.safeParse(s);
    return parsed.success ? [parsed.data] : [];
  });
  const content: WorkflowContent = {
    name: row.name,
    trigger: trigger.success ? trigger.data : { type: "signup", sources: [] },
    steps,
    settings: settings.success ? settings.data : DEFAULT_WORKFLOW_SETTINGS,
  };
  return { id: row.id, status: row.status, content, updated_at: row.updated_at, problems: workflowProblems(content, designIds) };
}

async function ownWorkflow(ctx: AgentContext, brand: Brand, id: string): Promise<EmailWorkflowRow> {
  checkId(id, "workflow");
  const row = await ctx.store.emailWorkflow(id);
  if (!row || row.brand !== brand) throw new ActionError("no such workflow", 404);
  return row;
}

async function designIdsOf(ctx: AgentContext, brand: Brand): Promise<Set<string>> {
  return new Set((await ctx.store.emailDesigns(brand)).map((d) => d.id));
}

export async function getWorkflow(ctx: AgentContext, brand: Brand, id: string): Promise<WorkflowView> {
  return workflowOf(await ownWorkflow(ctx, brand, id), await designIdsOf(ctx, brand));
}

export async function saveWorkflow(ctx: AgentContext, brand: Brand, id: string | null, input: unknown): Promise<WorkflowView> {
  const { content: raw, status } = z.object({ content: z.unknown(), status: z.enum(WORKFLOW_STATUSES) }).parse(input);
  const content = workflowContentSchema.parse(raw);
  if (status === "on") throw new ActionError("a workflow can't be switched on yet: sending to your contacts comes in the next step. Save it as a draft for now.", 409);
  const problem = triggerProblem(brand, content.trigger);
  if (problem) throw new ActionError(problem);
  const designIds = await designIdsOf(ctx, brand);
  for (const s of content.steps) if (s.type === "send" && s.design_id && !designIds.has(s.design_id)) throw new ActionError("a step sends a design that isn't this brand's");
  if (id) await ownWorkflow(ctx, brand, id);
  const row = await ctx.store.saveEmailWorkflow({ ...(id ? { id } : {}), brand, name: content.name, status, trigger: content.trigger, steps: content.steps, settings: content.settings }, OWNER);
  return workflowOf(row, designIds);
}

export async function deleteWorkflow(ctx: AgentContext, brand: Brand, id: string): Promise<void> {
  await ownWorkflow(ctx, brand, id);
  await ctx.store.deleteEmailWorkflow(id);
}

/* --------------------------------------------------------------- contacts */

export type ContactView = Omit<EmailContactRow, "brand" | "updated_by" | "updated_at">;

const contactOf = ({ brand: _brand, updated_by: _by, updated_at: _at, ...rest }: EmailContactRow): ContactView => rest;

export async function listContacts(ctx: AgentContext, brand: Brand, query: { status?: string | null; q?: string | null; offset?: number }): Promise<{ rows: ContactView[]; total: number }> {
  const status = query.status && (CONTACT_STATUSES as readonly string[]).includes(query.status) ? (query.status as ContactStatus) : undefined;
  const { rows, total } = await ctx.store.emailContacts({ brand, status, q: query.q ?? undefined, limit: 100, offset: Math.max(0, query.offset ?? 0) });
  return { rows: rows.map(contactOf), total };
}

const joinAs = z.enum(["subscribed", "pending"]);

export async function addContact(ctx: AgentContext, brand: Brand, input: unknown): Promise<{ ok: true }> {
  const c = newContactSchema.extend({ status: joinAs }).parse(input);
  const { added } = await ctx.store.addEmailContacts(brand, [{ email: c.email, name: c.name.trim(), language: c.language, tags: cleanTags(c.tags), source: c.source.trim() || "added by hand", consent_text: c.consent_text, status: c.status }], OWNER);
  if (!added) throw new ActionError("this address is already in the list", 409);
  return { ok: true };
}

export async function importContacts(ctx: AgentContext, brand: Brand, input: unknown): Promise<{ added: number; skipped: number; problems: string[]; problemCount: number }> {
  const i = z
    .object({
      csv: z.string().max(1_000_000),
      language: z.enum(LANGUAGES),
      source: z.string().max(80),
      consent_text: z.string().trim().min(3, "say how they agreed").max(500),
      status: joinAs,
      tags: z.array(z.string().max(40)).max(20),
    })
    .parse(input);
  const { rows, problems } = parseContactsCsv(i.csv, i.language);
  if (!rows.length) throw new ActionError(problems.length ? `no address found: ${problems[0]}` : "paste at least one address");
  if (rows.length > 10_000) throw new ActionError("10,000 addresses at a time at most");
  const res = await ctx.store.addEmailContacts(
    brand,
    rows.map((r) => ({ email: r.email, name: r.name, language: r.language, tags: cleanTags([...r.tags, ...i.tags]), source: i.source.trim() || "import", consent_text: i.consent_text, status: i.status })),
    OWNER,
  );
  return { ...res, problems: problems.slice(0, 20), problemCount: problems.length };
}

/** The owner changes a name, a language or tags, or unsubscribes someone; re-subscribing takes their own new sign-up. */
export async function updateContact(ctx: AgentContext, brand: Brand, id: string, input: unknown): Promise<{ ok: true }> {
  checkId(id, "contact");
  const patch = z
    .object({ name: z.string().max(120).optional(), language: z.enum(LANGUAGES).optional(), tags: z.array(z.string().max(40)).max(20).optional(), status: z.literal("unsubscribed").optional() })
    .parse(input);
  const changed = await ctx.store.updateEmailContact(brand, id, { ...patch, ...(patch.tags ? { tags: cleanTags(patch.tags) } : {}) }, OWNER);
  if (!changed) throw new ActionError("no such contact", 404);
  return { ok: true };
}

export async function deleteContact(ctx: AgentContext, brand: Brand, id: string): Promise<void> {
  checkId(id, "contact");
  if (!(await ctx.store.deleteEmailContact(brand, id))) throw new ActionError("no such contact", 404);
}

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function exportContacts(ctx: AgentContext, brand: Brand): Promise<string> {
  const lines = ["email,name,language,status,tags,source,consent_text,consent_at,unsubscribed_at"];
  for (let offset = 0; offset < 50_000; offset += 500) {
    const { rows } = await ctx.store.emailContacts({ brand, limit: 500, offset });
    for (const c of rows) lines.push([c.email, c.name, c.language, c.status, c.tags.join("|"), c.source, c.consent_text, c.consent_at, c.unsubscribed_at ?? ""].map(csvCell).join(","));
    if (rows.length < 500) break;
  }
  return `${lines.join("\n")}\n`;
}
