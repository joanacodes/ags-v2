import assert from "node:assert/strict";
import { test } from "node:test";
import { afterSignInPath, isPublicPath, safeNextPath } from "../auth-paths";

test("only the landing page, auth pages, readee links, the study test and files are public", () => {
  for (const path of ["/", "/auth/sign-in", "/auth/sign-up", "/auth/callback", "/r/abc123", "/test", "/test/2f1c0b7e-0000-4000-8000-000000000000", "/sky/stars.json", "/robots.txt", "/_next/webpack-hmr"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/dashboard", "/charts", "/charts/new", "/charts/chart-clara-mercer/readings/love", "/synastry", "/settings", "/reports", "/r", "/authors", "/study", "/testing"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});

test("next paths must stay on this site", () => {
  assert.equal(safeNextPath("/charts/abc?tab=love", "/x"), "/charts/abc?tab=love");
  for (const bad of [null, undefined, "", "dashboard", "https://evil.example", "//evil.example", "/\\evil.example", "/ok\\..", "/a\nb"]) {
    assert.equal(safeNextPath(bad, "/x"), "/x", String(bad));
  }
});

test("after signing in: the page asked for, never back to the auth pages", () => {
  assert.equal(afterSignInPath("/synastry?a=chart-1"), "/synastry?a=chart-1");
  assert.equal(afterSignInPath(null), "/dashboard");
  assert.equal(afterSignInPath("/auth/sign-in"), "/dashboard");
  assert.equal(afterSignInPath("/auth"), "/dashboard");
  assert.equal(afterSignInPath("//evil.example"), "/dashboard");
});
