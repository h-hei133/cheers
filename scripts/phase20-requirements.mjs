#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decisions = path.join(root, ".wiki", "features", "phase-20-decisions.md");
const requirements = path.join(root, "scripts", "phase20-requirements.json");
const statuses = new Set(["complete", "partial", "open"]);
const taskId = /^(?:CFG|PRV|CTX|TOOL|UI|CMD|SET|PAN|INPUT|RENDER|EDIT|JOB|START|QA)-\d{2}$/;

function fail(message) {
  throw new Error(message);
}

export function declaredTaskIds(markdown) {
  const ids = new Set();
  for (const line of String(markdown).split(/\r?\n/)) {
    const match = line.match(/^\|\s*([A-Z]+-\d{2})\s*\|/);
    if (match && taskId.test(match[1])) ids.add(match[1]);
  }
  return [...ids].sort();
}

export function decodeRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== "phase20-requirements.v1"
    || value.source !== ".wiki/features/phase-20-decisions.md"
    || typeof value.updated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.updated)
    || !Array.isArray(value.tasks) || value.tasks.length !== 47) {
    fail("The Phase 20 requirements header or task count is invalid.");
  }
  const ids = new Set();
  return value.tasks.map(task => {
    if (!task || typeof task !== "object" || Array.isArray(task)
      || typeof task.id !== "string" || !taskId.test(task.id) || ids.has(task.id)
      || !statuses.has(task.status)
      || typeof task.evidence !== "string" || task.evidence.trim().length === 0
      || typeof task.missing !== "string") {
      fail("A Phase 20 requirements row is invalid.");
    }
    ids.add(task.id);
    if (task.status === "complete" && task.missing.trim().length > 0) {
      fail(`${task.id} is complete but still declares missing evidence.`);
    }
    if (task.status !== "complete" && task.missing.trim().length === 0) {
      fail(`${task.id} is not complete but declares no missing evidence.`);
    }
    return { id: task.id, status: task.status, evidence: task.evidence.trim(), missing: task.missing.trim() };
  });
}

export function auditRequirements(markdown, value) {
  const expected = declaredTaskIds(markdown);
  const rows = decodeRequirements(value);
  const actual = rows.map(row => row.id).sort();
  if (expected.length !== 47) fail(`Decision tables declare ${expected.length} task IDs, expected 47.`);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const missing = expected.filter(id => !actual.includes(id));
    const extra = actual.filter(id => !expected.includes(id));
    fail(`Requirement matrix differs from decisions; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}.`);
  }
  const counts = Object.fromEntries([...statuses].map(status =>
    [status, rows.filter(row => row.status === status).length]));
  return { total: rows.length, counts, rows };
}

export function loadAudit() {
  return auditRequirements(
    fs.readFileSync(decisions, "utf8"),
    JSON.parse(fs.readFileSync(requirements, "utf8")),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = loadAudit();
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "phase20-requirements-report.v1",
      total: report.total,
      counts: report.counts,
      status: report.counts.complete === report.total ? "complete" : "partial",
    }, null, 2)}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`phase20-requirements: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
