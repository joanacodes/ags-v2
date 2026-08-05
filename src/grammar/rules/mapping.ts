/**
 * Deterministic mapping from normalized chart vocabulary to knowledge
 * record keys. Pure string mapping — no meaning (ADR-0001).
 */
const ANGLE_KEYS: Readonly<Record<string, string>> = {
  ASC: "angles/ascendant",
  MC: "angles/midheaven",
  DC: "angles/descendant",
  IC: "angles/imum_coeli",
};

const POINT_KEYS: Readonly<Record<string, string>> = {
  chiron: "points/chiron",
  lilith: "points/lilith",
  north_node: "points/north_node",
  south_node: "points/south_node",
  vertex: "angles/vertex",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** "Venus" -> "planets/venus"; "ASC" -> "angles/ascendant". */
export function pointKnowledgeKey(point: string): string {
  const angle = ANGLE_KEYS[point];
  if (angle !== undefined) return angle;
  const extra = POINT_KEYS[slug(point)];
  if (extra !== undefined) return extra;
  return `planets/${slug(point)}`;
}

/** Knowledge key for a functional condition, e.g. "retrograde". */
export function conditionKnowledgeKey(condition: string): string {
  return `conditions/${slug(condition)}`;
}

/** "Libra" -> "signs/libra". */
export function signKnowledgeKey(sign: string): string {
  return `signs/${slug(sign)}`;
}

/** 7 -> "houses/house_7". */
export function houseKnowledgeKey(houseNumber: number): string {
  return `houses/house_${houseNumber}`;
}

/** "square" -> "aspects/square". */
export function aspectKnowledgeKey(aspectType: string): string {
  return `aspects/${slug(aspectType)}`;
}
