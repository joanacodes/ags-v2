/**
 * Synastry between two charts: list, view, write, delete.
 */
import type { SynastryReading } from "@/types";
import { aiFetch } from "@/lib/ai-fetch";

export interface SynastryPerson {
  id: string;
  name: string;
  firstName: string;
  birthLine: string;
  sun?: string;
  moon?: string;
  asc?: string;
  calculated: boolean;
}

export interface SynastryContactView {
  label: string;
  glyphs: string;
  aspectGlyph: string;
  type: string;
  orb: string;
}

export interface SynastryDetail {
  owner: SynastryPerson;
  partner: SynastryPerson;
  names: [string, string];
  contacts: SynastryContactView[];
  overlays: {
    ownerInPartner: { label: string; house: number }[];
    partnerInOwner: { label: string; house: number }[];
  };
  timeKnown: { owner: boolean; partner: boolean };
  reading: SynastryReading | null;
  job: { status: "queued" | "running" | "done" | "failed"; error: string | null } | null;
}

export interface SynastrySummary {
  ownerChartId: string;
  partnerChartId: string;
  ownerName: string;
  partnerName: string;
  title: string;
  status: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

const path = (a: string, b: string) => `/api/synastry/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;

export const SynastryService = {
  async list(): Promise<SynastrySummary[]> {
    const response = await fetch("/api/synastry", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as SynastrySummary[];
  },

  async get(a: string, b: string): Promise<SynastryDetail> {
    const response = await fetch(path(a, b), { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as SynastryDetail;
  },

  /** Queued on the server (background) or written right away. */
  async generate(
    a: string,
    b: string,
    style: string,
    language: string,
  ): Promise<{ status: "queued" } | { status: "done"; reading: SynastryReading }> {
    const response = await aiFetch(path(a, b), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style, language }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as { status: "queued" } | { status: "done"; reading: SynastryReading };
  },

  async remove(a: string, b: string): Promise<void> {
    const response = await fetch(path(a, b), { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response));
  },
};
