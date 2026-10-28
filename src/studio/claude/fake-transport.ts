/**
 * A model that answers like the agents should, from the request alone: enough to run a whole week
 * through the code with no key and no network (the tests, the local demo, STUDIO_FAKE_MODEL=1 runs),
 * and to see every rule the code enforces at work. It never runs in production.
 */
import type { BatchItem, BatchResult, BatchStatus, ModelRequest, ModelResponse, ModelTransport } from "./transport";

const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };

function words(n: number, lead: string): string {
  const filler = "and it shows where you learnt to carry things early which is a strength that took longer to learn".split(" ");
  const out = lead.split(" ");
  let i = 0;
  while (out.length < n) out.push(filler[i++ % filler.length]!);
  return out.join(" ") + ".";
}

function strategist(req: ModelRequest): string {
  const count = Number(/Write between (\d+) and/.exec(req.user)?.[1] ?? 10);
  const events = [...req.user.matchAll(/^(\d{4}-\d{2}-\d{2}): (.+)$/gm)].map((m) => m[1]!);
  const pillars = Array.from({ length: count }, (_, i) => {
    const r = i / count;
    return r < 0.4 ? "test" : r < 0.8 ? "placements" : r < 0.95 ? "tested" : "sky";
  });
  const formatsCycle = [["video", "text", "pin"], ["carousel", "text"], ["video", "pin"], ["text"], ["video", "story"], ["pin", "text"]];
  const anchors = ["Saturn", "Chiron", "Lilith", "Moon", "Venus", "Mars"];
  const topics = ["the responsible one", "the apology", "the careful heart", "the quiet strength", "the late bloomer", "the honest friend", "the one who leaves first", "the patient listener"];
  // Each week frames its hooks differently, so a second week isn't dropped as a copy of the first.
  const weekNo = Number(/<week>\d{4}-W(\d{2})/.exec(req.user)?.[1] ?? 0);
  const frames = [
    (a: string, t: string) => `${a} and ${t}`,
    (a: string, t: string) => `What ${a} says about ${t}`,
    (a: string, t: string) => `Why ${t} often carries ${a}`,
    (a: string, t: string) => `If you are ${t}, look at your ${a}`,
    (a: string, t: string) => `The ${a} placement behind ${t}`,
    (a: string, t: string) => `${t}: is it really ${a}?`,
  ];
  const cards = pillars.map((pillar, i) => ({
    pillar,
    language: i % 5 === 0 ? "both" : i % 7 === 0 ? "fr" : "en",
    idea: `Card ${i + 1}: ${topics[i % topics.length]} and ${anchors[i % anchors.length]}`,
    hook: `${frames[(weekNo + i) % frames.length]!(anchors[i % anchors.length]!, topics[i % topics.length]!)}, number ${i + 1} of the week`,
    points: ["it is a strength learnt slowly", "the test shows whether people recognise it"],
    figures: [],
    cta: "comment TEST",
    anchor: anchors[i % anchors.length],
    sky_date: events[i] ?? null,
    formats: formatsCycle[i % formatsCycle.length],
    variant_of: null,
    reason: "a test card",
  }));
  return JSON.stringify({ cards, reminders: [] });
}

function writer(req: ModelRequest): string {
  const fr = /autrice française/.test(req.system[0]?.text ?? "");
  const anchor = /"anchor": "([^"]+)"/.exec(req.user)?.[1] ?? "Saturn";
  const targets = [...req.user.matchAll(/\(platform "(\w+)", format "(\w+)"\)/g)].map((m) => ({ platform: m[1]!, format: m[2]! }));
  const lead = fr ? `${anchor} et votre thème natal :` : `${anchor} in your birth chart:`;
  const pieces = targets.map(({ platform, format }) => {
    const base = { platform, format, script: null, lines: null, caption: null, title: null, description: null, tags: [], slides: null, statements: null, template: null, link: false };
    if (format === "video")
      return {
        ...base,
        script: fr ? words(50, `${anchor} dans votre thème natal montre où vous avez appris tôt`) : words(50, `${anchor} in your birth chart shows where you learnt early`),
        lines: [lead, fr ? "une force apprise tôt" : "a strength learnt early"],
        caption: fr ? `${anchor} dans votre thème natal, en mots simples pour vous.` : `${anchor} in the birth chart, in plain words.`,
        title: fr ? `${anchor} dans le thème natal` : `${anchor} in the birth chart, explained`,
        tags: fr ? ["#astrologie"] : ["#astrology", "#birthchart", "#saturn"],
        template: "meadow-text",
      };
    if (format === "carousel")
      return fr
        ? { ...base, caption: `${anchor}, en mots simples pour vous.`, slides: Array.from({ length: 6 }, (_, i) => ({ heading: `${anchor}, partie ${i + 1}`, body: "une force que vous avez apprise lentement" })), tags: ["#astrologie"] }
        : { ...base, caption: `${anchor}, in plain words.`, slides: Array.from({ length: 6 }, (_, i) => ({ heading: `${anchor}, part ${i + 1}`, body: "a strength learnt slowly" })), tags: ["#astrology", "#birthchart", "#saturn"] };
    if (format === "pin") {
      const key = fr ? "thème natal" : "birth chart";
      return { ...base, title: fr ? `${anchor} dans le ${key}` : `${anchor} in the ${key}, explained`, description: fr ? `Le ${key} en mots simples. ${anchor} dans le ${key} : une force.` : `Your ${key} in plain words. ${anchor} in the ${key} is a strength learnt slowly.` };
    }
    if (format === "story") return { ...base, lines: [fr ? "Répondez TEST pour le test." : "Reply TEST for the test."] };
    if (format === "issue") return { ...base, title: "Study notes", description: words(700, "Study notes this week:") };
    return { ...base, caption: fr ? `Votre ${anchor} n’est pas une punition. C’est là où vous avez appris tôt.` : `Your ${anchor} is not your punishment. It is where you learnt early.`, tags: fr ? ["Astrologie", "#astrologie"] : ["Astrology", "#astrology"], link: platform === "threads" };
  });
  return JSON.stringify({ pieces });
}

export class FakeTransport implements ModelTransport {
  calls: ModelRequest[] = [];
  batches = new Map<string, BatchItem[]>();

  answer(req: ModelRequest): string {
    const sys = req.system[0]?.text ?? "";
    if (/You are the strategist/.test(sys)) return strategist(req);
    if (/writer of the Studio|autrice française/.test(sys)) return writer(req);
    if (/You sort comments/.test(sys)) {
      const items = [...req.user.matchAll(/"ref":"([^"]+)","platform":"[^"]+","text":"([^"]*)"/g)].map((m) => ({
        ref: m[1]!,
        klass: /die|end it/i.test(m[2]!) ? "distress" : /buy followers|promo/i.test(m[2]!) ? "spam" : /fake|nonsense/i.test(m[2]!) ? "sceptic" : /\?/.test(m[2]!) ? "question" : "praise",
        language: /[éèàç]|vous|merci/i.test(m[2]!) ? "fr" : "en",
      }));
      return JSON.stringify({ items });
    }
    if (/You draft replies/.test(sys)) return JSON.stringify({ reply: "So was I. Take the test at https://astrostudy.co.uk/test/?src=ig and tell me your score.", flag: "none", flag_reason: null, reminders: [] });
    if (/You are the analyst/.test(sys)) return JSON.stringify({ verdicts: [], suggestions: [{ idea: "More Saturn", pillar: "placements", figure: null, reason: "it worked" }], for_owner: ["Read the scorecard."], reminders: [] });
    throw new Error("the fake model doesn't know this agent");
  }
  async send(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(req);
    return { text: this.answer(req), stopReason: "end_turn", model: req.model, usage, fellBack: false };
  }
  async submitBatch(items: readonly BatchItem[]): Promise<string> {
    const id = `batch-${this.batches.size + 1}`;
    this.batches.set(id, [...items]);
    return id;
  }
  async batchStatus(id: string): Promise<BatchStatus> {
    return { id, ended: true, counts: { processing: 0, succeeded: this.batches.get(id)?.length ?? 0, errored: 0 } };
  }
  async batchResults(id: string): Promise<BatchResult[]> {
    return (this.batches.get(id) ?? []).map((item) => ({ customId: item.customId, ok: true as const, response: { text: this.answer(item.request), stopReason: "end_turn", model: item.request.model, usage, fellBack: false } }));
  }
  async cancelBatch(): Promise<void> {}
  async listModels() {
    return [{ id: "claude-opus-5-5", label: "Claude Opus 5.5", context: 1000000, maxOutput: 128000 }];
  }
}
