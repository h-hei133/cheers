import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkBuild, sourceDigest } from "./start-lib.mjs";

function fixture(version = "1.0.0") {
  const root = mkdtempSync(path.join(os.tmpdir(), "cheers-start-"));
  const dist = path.join(root, "packages/ts-shell/dist");
  mkdirSync(path.join(root, "packages/ts-shell/src"), { recursive: true });
  mkdirSync(path.join(dist, "entrypoints"), { recursive: true });
  writeFileSync(path.join(root, "packages/ts-shell/src/index.ts"), "export const value = 1;\n");
  writeFileSync(path.join(dist, "entrypoints/cli.js"), "// built\n");
  const digest = sourceDigest(root).digest;
  const manifest = { schemaVersion: 1, name: "x", version, builtAt: "now", node: "20", sourceDigest: digest, buildId: "a".repeat(64), entry: ["entrypoints/cli.js"] };
  writeFileSync(path.join(dist, "build-manifest.json"), JSON.stringify(manifest));
  return { root, dist, manifest };
}

test("accepts a fresh manifest whose digest matches the sources", () => {
  const { root, dist } = fixture();
  assert.equal(checkBuild({ root, dist, version: "1.0.0" }).state, "fresh");
  rmSync(root, { recursive: true, force: true });
});

test("refuses a missing, truncated, mismatched or stale build", () => {
  const { root, dist, manifest } = fixture();
  assert.equal(checkBuild({ root, dist: path.join(root, "none"), version: "1.0.0" }).state, "missing");
  writeFileSync(path.join(dist, "build-manifest.json"), "{");
  assert.equal(checkBuild({ root, dist, version: "1.0.0" }).state, "truncated");
  writeFileSync(path.join(dist, "build-manifest.json"), JSON.stringify(manifest));
  assert.equal(checkBuild({ root, dist, version: "2.0.0" }).state, "version-mismatch");
  writeFileSync(path.join(root, "packages/ts-shell/src/index.ts"), "export const value = 2;\n");
  assert.equal(checkBuild({ root, dist, version: "1.0.0" }).state, "stale");
  rmSync(root, { recursive: true, force: true });
});
