/**
 * Synastry readings, stored in the readings table under the pair's first
 * chart with a private slug ("_synastry-<hash of the partner chart>"): the
 * readee share function never returns "_" records.
 */
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore } from "@/server/readings-store";
import { SYNASTRY_SLUG_PREFIX, orderPair, synastrySlug } from "@/interpretation/synastry";
import type { Chart, SynastryReading } from "@/types";

/** The pair in storage order, whichever page it was opened from. */
export function synastryPair(a: string, b: string): { owner: string; partner: string; slug: string } {
  const [owner, partner] = orderPair(a, b, (id) => ChartsStore.isSample(id));
  return { owner, partner, slug: synastrySlug(partner) };
}

export function isSynastryReading(value: unknown): value is SynastryReading {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "synastry";
}

export const SynastryStore = {
  async get(owner: string, partner: string): Promise<SynastryReading | null> {
    const stored = await ReadingsStore.getStored(owner, synastrySlug(partner));
    return isSynastryReading(stored) ? stored : null;
  },

  async save(ownerChart: Chart, reading: SynastryReading): Promise<{ persisted: boolean }> {
    return ReadingsStore.saveReading(ownerChart, reading);
  },

  /** The signed-in user's synastries. */
  async list(): Promise<SynastryReading[]> {
    const all = await ReadingsStore.listStoredByPrefix(SYNASTRY_SLUG_PREFIX);
    return all.filter(isSynastryReading);
  },

  async remove(owner: string, partner: string): Promise<void> {
    await ReadingsStore.deleteStored(owner, synastrySlug(partner));
  },
};
