/**
 * How close two hooks are: Sørensen–Dice over character trigrams of their normalised text. 1 is the same
 * hook, 0.85 is the strategist's line ("no hook within 85% of one used in the last eight weeks").
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(text: string): Map<string, number> {
  const t = `  ${normalise(text)}  `;
  const grams = new Map<string, number>();
  for (let i = 0; i < t.length - 2; i += 1) {
    const g = t.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

export function similarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  let total = 0;
  for (const [g, n] of ga) {
    shared += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * shared) / total;
}

/** The closest of `others` to `text`, with its score. */
export function closest(text: string, others: readonly string[]): { text: string; score: number } | null {
  let best: { text: string; score: number } | null = null;
  for (const o of others) {
    const score = similarity(text, o);
    if (!best || score > best.score) best = { text: o, score };
  }
  return best;
}
