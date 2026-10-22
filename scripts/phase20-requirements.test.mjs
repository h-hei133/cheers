import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditRequirements,
  declaredTaskIds,
  decodeRequirements,
  loadAudit,
} from "./phase20-requirements.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decisions = fs.readFileSync(path.join(root, ".wiki", "features", "phase-20-decisions.md"), "utf8");
const matrix = JSON.parse(fs.readFileSync(path.join(root, "scripts", "phase20-requirements.json"), "utf8"));

test("the Phase 20 audit covers every declared task ID exactly once", () => {
  const report = loadAudit();
  assert.equal(report.total, 47);
  assert.equal(report.counts.complete + report.counts.partial + report.counts.open, 47);
  assert.deepEqual(declaredTaskIds(decisions), report.rows.map(row => row.id).sort());
});

test("a missing or extra task ID fails the audit", () => {
  const missing = structuredClone(matrix);
  missing.tasks.pop();
  assert.throws(() => auditRequirements(decisions, missing), /task count|differs/);
  const extra = structuredClone(matrix);
  extra.tasks.push({ ...extra.tasks[0], id: "QA-99" });
  assert.throws(() => auditRequirements(decisions, extra), /task count|differs/);
});

test("complete rows cannot retain missing evidence and partial rows cannot hide it", () => {
  const complete = structuredClone(matrix);
  complete.tasks.find(task => task.status === "complete").missing = "still missing";
  assert.throws(() => decodeRequirements(complete), /complete but still declares missing/);
  const partial = structuredClone(matrix);
  partial.tasks.find(task => task.status !== "complete").missing = "";
  assert.throws(() => decodeRequirements(partial), /declares no missing evidence/);
});

test("the current matrix does not claim Phase 20 completion", () => {
  const report = loadAudit();
  assert.ok(report.counts.partial > 0);
  assert.notEqual(report.counts.complete, report.total);
});
