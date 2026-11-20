import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { packageBoundaryFindings } from "./build/imports.mjs";

function fixture(t) {
  const parent = path.join(os.tmpdir(), "cheers-test");
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, "boundaries-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, data) => {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, data);
  };
  return { root, write };
}

test("checks relative, public, and private imports across workspace packages", t => {
  const { root, write } = fixture(t);
  write("package.json", JSON.stringify({ workspaces: ["packages/host", "packages/feature"] }));
  write("packages/host/package.json", JSON.stringify({ name: "@cheers/host", dependencies: { "@cheers/feature": "1.0.0" } }));
  write("packages/feature/package.json", JSON.stringify({ name: "@cheers/feature", exports: { ".": "./dist/index.js" } }));
  write("packages/host/src/entry.ts", [
    "import type { Contract } from '@cheers/feature'",
    "export { missing } from '@cheers/feature/internal'",
    "void import('../../feature/src/index.js')",
  ].join("\n"));
  write("packages/feature/api.d.ts", "export type Contract = typeof import('@cheers/host')");
  write("packages/feature/src/index.ts", "export {}");
  const findings = packageBoundaryFindings(root);
  assert.equal(findings.length, 3);
  assert(findings.some(item => item.endsWith("declare @cheers/host as a dependency")));
  assert(findings.some(item => item.endsWith("use the public entry of @cheers/feature")));
  assert(findings.some(item => item.endsWith("@cheers/feature/internal is outside the declared exports")));
  write("packages/feature/api.d.ts", "export type Contract = string");
  write("packages/host/src/entry.ts", "export type { Contract } from '@cheers/feature'");
  assert.deepEqual(packageBoundaryFindings(root), []);
});

test("rejects declared circular dependencies and checks runtime cycles inside an independent domain", t => {
  const { root, write } = fixture(t);
  write("package.json", JSON.stringify({ workspaces: ["packages/ts-shell", "packages/feature"] }));
  const exports = { ".": "./dist/index.js" };
  write("packages/ts-shell/package.json", JSON.stringify({
    name: "@cheers/ts-shell", exports, devDependencies: { "@cheers/feature": "1.0.0" },
  }));
  const feature = { name: "@cheers/feature", exports };
  write("packages/feature/package.json", JSON.stringify({
    ...feature, peerDependencies: { "@cheers/ts-shell": "1.0.0" },
  }));
  write("packages/ts-shell/src/index.ts", "export {}");
  write("packages/feature/src/index.ts", "export {}");
  const cycle = "package dependency cycle: @cheers/ts-shell -> @cheers/feature -> @cheers/ts-shell";
  assert.deepEqual(packageBoundaryFindings(root), [
    cycle,
    "packages/feature/package.json -> @cheers/ts-shell: domain packages must not depend on the shell host",
  ]);

  // The default invocation must reject a cycle contained wholly in an independent package.
  write("packages/feature/package.json", JSON.stringify(feature));
  assert.deepEqual(packageBoundaryFindings(root), []);
  write("packages/feature/src/index.ts", "import './entry.js';");
  write("packages/feature/src/entry.ts", "import './index.js';");
  const gate = fileURLToPath(new URL("./check-import-cycles.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [gate], { cwd: root, encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages\/feature\/src\/index\.ts/);
  assert.match(result.stderr, /packages\/feature\/src\/entry\.ts/);
  assert.match(result.stdout, /\[pass\] package-boundary/);
});
