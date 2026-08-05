/**
 * TASK-0001 test suite — dependency-free (node:test + node:assert).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DuplicateMatchIdError,
  DuplicateRuleRegistrationError,
  GrammarExecutor,
  GrammarRegistry,
  GrammarRuleUnsupportedInputError,
  InvalidRuleOutputError,
  type GrammarMatch,
  type GrammarRule,
  type NormalizedGrammarInput,
} from "../index";

const INPUT: NormalizedGrammarInput = {
  id: "input-1",
  facts: [
    { id: "fact-b", structure: "s", values: { v: 1 } },
    { id: "fact-a", structure: "s", values: { v: 2 } },
  ],
};
const CONTEXT = {};

function makeRule(
  id: string,
  produce: (input: NormalizedGrammarInput) => readonly GrammarMatch[],
  structure = "structure_x",
): GrammarRule {
  return { id, structure, evaluate: (input) => produce(input) };
}

function match(
  id: string,
  ruleId: string,
  structure = "structure_x",
  sourceFactIds: readonly string[] = ["fact-b", "fact-a"],
): GrammarMatch {
  return { id, ruleId, structure, values: { ok: true }, sourceFactIds };
}

/* 1 — registration, retrieval, deterministic listing, clearing */
test("registry registers, retrieves, lists deterministically, clears", () => {
  const registry = new GrammarRegistry();
  const rb = makeRule("rule-b", () => []);
  const ra = makeRule("rule-a", () => []);
  registry.register(rb);
  registry.register(ra);
  assert.equal(registry.get("rule-a"), ra);
  assert.equal(registry.get("missing"), undefined);
  assert.deepEqual(registry.list().map((r) => r.id), ["rule-a", "rule-b"]);
  assert.equal(registry.size(), 2);
  registry.clear();
  assert.equal(registry.size(), 0);
  assert.deepEqual(registry.list(), []);
});

/* 2 — duplicate rule rejection */
test("registry rejects duplicate rule ids", () => {
  const registry = new GrammarRegistry();
  registry.register(makeRule("rule-a", () => []));
  assert.throws(
    () => registry.register(makeRule("rule-a", () => [])),
    DuplicateRuleRegistrationError,
  );
});

/* 3 — zero, one, and multiple matches */
test("executor returns zero, one, and multiple matches", async () => {
  const registry = new GrammarRegistry();
  registry.register(makeRule("rule-zero", () => []));
  registry.register(makeRule("rule-one", () => [match("m-one", "rule-one")]));
  registry.register(
    makeRule("rule-many", () => [match("m-2", "rule-many"), match("m-1", "rule-many")]),
  );
  const result = await new GrammarExecutor().execute(INPUT, CONTEXT, registry);
  assert.deepEqual(result.matches.map((m) => m.id), ["m-1", "m-2", "m-one"]);
  assert.deepEqual(result.diagnostics, []);
});

/* 4 — deterministic rule execution order (ascending rule id) */
test("rules execute in ascending rule-id order regardless of registration order", async () => {
  const order: string[] = [];
  const registry = new GrammarRegistry();
  for (const id of ["rule-c", "rule-a", "rule-b"]) {
    registry.register(
      makeRule(id, () => {
        order.push(id);
        return [];
      }),
    );
  }
  await new GrammarExecutor().execute(INPUT, CONTEXT, registry);
  assert.deepEqual(order, ["rule-a", "rule-b", "rule-c"]);
});

/* 5 — deterministic match ordering + source-fact canonicalization */
test("matches order by structure, rule id, match id; sourceFactIds ascend", async () => {
  const registry = new GrammarRegistry();
  registry.register(makeRule("rule-b", () => [match("m-b", "rule-b", "beta")], "beta"));
  registry.register(
    makeRule("rule-a", () => [match("m-z", "rule-a", "beta"), match("m-a", "rule-a", "alpha")]),
  );
  const result = await new GrammarExecutor().execute(INPUT, CONTEXT, registry);
  assert.deepEqual(
    result.matches.map((m) => [m.structure, m.ruleId, m.id]),
    [
      ["alpha", "rule-a", "m-a"],
      ["beta", "rule-a", "m-z"],
      ["beta", "rule-b", "m-b"],
    ],
  );
  for (const m of result.matches) {
    assert.deepEqual(m.sourceFactIds, ["fact-a", "fact-b"]);
  }
});

/* 6 — repeated execution equality */
test("repeated execution with identical inputs is deeply equal", async () => {
  const registry = new GrammarRegistry();
  registry.register(makeRule("rule-one", () => [match("m-one", "rule-one")]));
  registry.register({
    id: "rule-async",
    structure: "structure_x",
    evaluate: async () => [match("m-async", "rule-async")],
  });
  const executor = new GrammarExecutor();
  const first = await executor.execute(INPUT, CONTEXT, registry);
  const second = await executor.execute(INPUT, CONTEXT, registry);
  assert.deepEqual(first, second);
});

/* 7 — recoverable rule failures become diagnostics */
test("rule failures and unsupported input are recoverable diagnostics", async () => {
  const registry = new GrammarRegistry();
  registry.register(
    makeRule("rule-boom", () => {
      throw new Error("boom");
    }),
  );
  registry.register(
    makeRule("rule-unsupported", () => {
      throw new GrammarRuleUnsupportedInputError("outside domain");
    }),
  );
  registry.register(makeRule("rule-still-runs", () => [match("m-ok", "rule-still-runs")]));
  const result = await new GrammarExecutor().execute(INPUT, CONTEXT, registry);
  assert.deepEqual(result.matches.map((m) => m.id), ["m-ok"]);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.ruleId, d.code]),
    [
      ["rule-boom", "RULE_FAILED"],
      ["rule-unsupported", "RULE_UNSUPPORTED_INPUT"],
    ],
  );
});

/* 8 — duplicate match id rejection (fatal) */
test("duplicate match ids across rules are a typed fatal error", async () => {
  const registry = new GrammarRegistry();
  registry.register(makeRule("rule-a", () => [match("m-dup", "rule-a")]));
  registry.register(makeRule("rule-b", () => [match("m-dup", "rule-b")]));
  await assert.rejects(
    () => new GrammarExecutor().execute(INPUT, CONTEXT, registry),
    DuplicateMatchIdError,
  );
});

/* 8b — invalid rule output is a typed fatal error */
test("contract-violating rule output is a typed fatal error", async () => {
  const registry = new GrammarRegistry();
  registry.register(
    makeRule("rule-bad", () => [
      { ...match("m-x", "rule-bad"), ruleId: "someone-else" } as GrammarMatch,
    ]),
  );
  await assert.rejects(
    () => new GrammarExecutor().execute(INPUT, CONTEXT, registry),
    InvalidRuleOutputError,
  );
});

/* 9 — empty registry */
test("empty registry yields empty matches and diagnostics", async () => {
  const result = await new GrammarExecutor().execute(INPUT, CONTEXT, new GrammarRegistry());
  assert.deepEqual(result, { matches: [], diagnostics: [] });
});

/* 10 — contracts require no interpretation prose */
test("contracts carry structure and values only, no interpretation prose", async () => {
  const registry = new GrammarRegistry();
  registry.register(makeRule("rule-one", () => [match("m-one", "rule-one")]));
  const result = await new GrammarExecutor().execute(INPUT, CONTEXT, registry);
  const keys = Object.keys(result.matches[0]).sort();
  assert.deepEqual(keys, ["id", "ruleId", "sourceFactIds", "structure", "values"]);
});
