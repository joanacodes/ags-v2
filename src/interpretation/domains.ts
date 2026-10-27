/**
 * Reading domain definitions (server-side).
 *
 * Each life domain declares which chart factors are relevant to it —
 * deterministic selection configuration, no interpretive prose (ADR-0001).
 * A grammar match belongs to a domain when it involves one of the domain's
 * planets, houses, or angles. The `summary` domain takes everything.
 */
import type { ChartPoint, PlanetName } from "@/types";

export interface ReadingDomainDefinition {
  readonly slug: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly icon: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  /** Planets whose placements and aspects belong to this domain. */
  readonly planets: readonly PlanetName[];
  /** Houses whose cusps and occupants belong to this domain. */
  readonly houses: readonly number[];
  /** Angles relevant to this domain. */
  readonly angles: readonly ChartPoint[];
  /** Extra points (Chiron, Lilith, Nodes, Vertex) in scope. */
  readonly points?: readonly string[];
  /** Domain-specific writing guidance injected into the AI prompt. */
  readonly promptFocus?: string;
  /** True = no filtering, the whole chart is in scope. */
  readonly wholeChart?: boolean;
  /**
   * Deep readings: longer, structured by an editable prompt
   * (`reading.deep.<slug>`), with the rest of the chart passed as supporting
   * material for what helps and what comes out of it.
   */
  readonly deep?: boolean;
  /** Points whose aspects are measured from the chart's positions. */
  readonly contactSources?: readonly string[];
}

export const READING_DOMAINS: readonly ReadingDomainDefinition[] = [
  {
    slug: "personality",
    title: "Personality",
    shortTitle: "Personality",
    icon: "user",
    description:
      "The core of who you are — how your sense of self, instincts, and outward presence are structured.",
    estimatedMinutes: 14,
    planets: ["Sun", "Moon", "Mercury"],
    houses: [1],
    angles: ["ASC"],
  },
  {
    slug: "family",
    title: "Family",
    shortTitle: "Family",
    icon: "home",
    description:
      "Roots, home, and lineage — the emotional foundation you come from and the one you build.",
    estimatedMinutes: 11,
    planets: ["Moon", "Saturn", "Sun", "Mercury"],
    houses: [3, 4, 10],
    angles: ["IC"],
    promptFocus:
      "Structure this reading around the family figures: one section on the mother figure and the emotional home (anchor it in the Moon and 4th-house material), one on the father figure and structure/authority (anchor it in Saturn and Sun and 10th-house material), and one on siblings and the immediate circle (anchor it in Mercury and 3rd-house material — if the material is thin there, say plainly that the chart speaks less about siblings). Family patterns describe experienced dynamics, never verdicts on real people.",
  },
  {
    slug: "love-relationships",
    title: "Love & Relationships",
    shortTitle: "Love",
    icon: "heart",
    description:
      "Attraction, partnership, and intimacy in depth — how you bond, what you desire, where love hurts, and what helps you love well.",
    estimatedMinutes: 30,
    planets: ["Venus", "Mars", "Moon"],
    houses: [5, 7, 8],
    angles: ["DC"],
    points: ["Vertex", "Lilith", "Chiron"],
    deep: true,
    contactSources: ["Lilith", "Chiron"],
  },
  {
    slug: "career",
    title: "Career",
    shortTitle: "Career",
    icon: "briefcase",
    description:
      "Vocation, ambition, and public role — where your effort compounds and how you are seen professionally.",
    estimatedMinutes: 16,
    planets: ["Sun", "Saturn", "Jupiter", "Mars"],
    houses: [2, 6, 10],
    angles: ["MC"],
  },
  {
    slug: "friends-social",
    title: "Friends & Social Life",
    shortTitle: "Friends",
    icon: "users",
    description:
      "Friendship, community, and belonging — the groups you join and the role you play in them.",
    estimatedMinutes: 10,
    planets: ["Venus", "Uranus", "Mercury"],
    houses: [3, 11],
    angles: [],
  },
  {
    slug: "communication",
    title: "Communication",
    shortTitle: "Communication",
    icon: "message",
    description:
      "How you think, learn, speak, and are understood — your mental style and everyday exchanges.",
    estimatedMinutes: 12,
    planets: ["Mercury"],
    houses: [3, 9],
    angles: [],
  },
  {
    slug: "money-resources",
    title: "Money & Resources",
    shortTitle: "Money",
    icon: "coins",
    description:
      "Earning, owning, and sharing — your relationship to material security and shared resources.",
    estimatedMinutes: 13,
    planets: ["Venus", "Jupiter", "Saturn"],
    houses: [2, 8],
    angles: [],
  },
  {
    slug: "pain-healing",
    title: "Pain & Healing",
    shortTitle: "Healing",
    icon: "sprout",
    description:
      "Where life presses hardest — Saturn, Chiron and Lilith in depth: the pain, what helps you through it, and what it can make of you.",
    estimatedMinutes: 35,
    planets: ["Saturn", "Pluto", "Mars", "Neptune"],
    houses: [8, 12],
    angles: [],
    points: ["Chiron", "Lilith"],
    deep: true,
    contactSources: ["Chiron", "Lilith"],
  },
  {
    slug: "blockages-patterns",
    title: "Blockages & Repeating Patterns",
    shortTitle: "Blockages",
    icon: "lock",
    description:
      "What slows you down and comes back — inherited structure, the cost of speaking too soon, and what stays out of sight: Saturn, the nodes and houses 4, 8 and 12, read as patterns, never as fate.",
    estimatedMinutes: 35,
    planets: ["Saturn", "Mercury", "Pluto", "Neptune", "Moon"],
    houses: [3, 4, 8, 12],
    angles: ["IC"],
    points: ["North Node", "South Node", "Chiron", "Lilith"],
    deep: true,
    // The South Node stands for the axis: a contact to it is the opposition to the North Node.
    contactSources: ["Chiron", "Lilith", "South Node"],
  },
  {
    slug: "talents",
    title: "Talents",
    shortTitle: "Talents",
    icon: "star",
    description:
      "Native strengths and creative capacities — what comes easily and where it can be invested.",
    estimatedMinutes: 15,
    planets: ["Sun", "Venus", "Mars", "Jupiter"],
    houses: [2, 5],
    angles: [],
  },
  {
    slug: "purpose-growth",
    title: "Purpose & Growth",
    shortTitle: "Purpose",
    icon: "compass",
    description:
      "Direction and meaning — the longer arc of development your chart keeps pointing toward.",
    estimatedMinutes: 17,
    planets: ["Jupiter", "Saturn", "Sun", "Neptune"],
    houses: [9, 12],
    angles: ["MC"],
    points: ["North Node", "South Node"],
    promptFocus:
      "If the lunar nodes appear in the material, frame them as the developmental axis: the South Node as familiar ground, the North Node as the direction growth keeps pointing toward.",
  },
  {
    slug: "summary",
    title: "Summary",
    shortTitle: "Summary",
    icon: "scroll",
    description:
      "A synthesized portrait of the entire chart — every domain woven into one coherent narrative.",
    estimatedMinutes: 25,
    planets: [],
    houses: [],
    angles: [],
    wholeChart: true,
  },
];

/** Place of a reading in reports and shared links: the summary first, then the usual order. */
export function reportOrder(slug: string): number {
  if (slug === "summary") return 0;
  const index = READING_DOMAINS.findIndex((d) => d.slug === slug);
  return index === -1 ? READING_DOMAINS.length + 1 : index + 1;
}

export function getDomain(slug: string): ReadingDomainDefinition | undefined {
  return READING_DOMAINS.find((d) => d.slug === slug);
}
