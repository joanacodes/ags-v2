import assert from "node:assert/strict";
import { test } from "node:test";
import { KnowledgeRegistry } from "../registry";
import { DuplicateRecordError, InvalidPackError, type KnowledgePack } from "../types";
import { createCoreKnowledgeRegistry } from "../pack-loader";

function pack(records: KnowledgePack["records"]): KnowledgePack {
  return { $schemaVersion: "1.0", packId: "test", version: "1.0.0", locale: "en", records };
}

test("registry loads a pack and resolves records", () => {
  const registry = new KnowledgeRegistry();
  registry.loadPack(
    pack({
      "planets/venus": {
        id: "planets/venus", category: "planets", entity: "venus",
        modules: { identity: { canonicalFunction: "evaluates value" } },
      },
    }),
  );
  const hit = registry.resolve("planets/venus");
  assert.equal(hit.status, "resolved");
  const miss = registry.resolve("planets/vulcan");
  assert.equal(miss.status, "unresolved");
});

test("duplicate record keys are fatal", () => {
  const registry = new KnowledgeRegistry();
  const p = pack({
    "signs/leo": { id: "signs/leo", category: "signs", entity: "leo", modules: {} },
  });
  registry.loadPack(p);
  assert.throws(() => registry.loadPack(p), DuplicateRecordError);
});

test("structurally invalid packs are rejected", () => {
  const registry = new KnowledgeRegistry();
  assert.throws(
    () =>
      registry.loadPack(
        pack({
          "houses/house_1": {
            id: "WRONG", category: "houses", entity: "house_1", modules: {},
          },
        }),
      ),
    InvalidPackError,
  );
});

test("core pack loads with the expected entities present", () => {
  const registry = createCoreKnowledgeRegistry();
  assert.ok(registry.size() >= 60);
  for (const key of ["planets/venus", "signs/libra", "houses/house_7", "aspects/square", "angles/ascendant"]) {
    assert.equal(registry.resolve(key).status, "resolved", key);
  }
});
