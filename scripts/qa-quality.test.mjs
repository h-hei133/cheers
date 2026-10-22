import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildQualityReport,
  decodeBlindRating,
  decodeQualityCorpus,
  pairedRiskDifference,
  parseQualityEvents,
  projectQualityRun,
  reportSafeObservation,
  scoreQualityTask,
} from "./qa-quality-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function corpus() {
  return decodeQualityCorpus(JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-corpus.json"), "utf8")));
}

function event(order, eventType, facts) {
  return JSON.stringify({
    schemaVersion: "run-event-stream.v1",
    order,
    eventType,
    facts,
    truthfulness: { observationOnly: true, terminalSuccessClaim: false },
  });
}

test("the shipped quality corpus is bounded and includes a blind-human task", () => {
  const decoded = corpus();
  assert.equal(decoded.schemaVersion, "phase20-quality-corpus.v1");
  assert.equal(decoded.qualifying, false);
  assert.equal(decoded.minimumPairs, 5);
  assert.ok(decoded.tasks.some(task => task.scorer.kind === "blind-human"));
  assert.ok(decoded.tasks.some(task => task.scorer.kind === "deterministic"));
});

test("a corpus cannot self-promote or omit its qualification state", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-corpus.json"), "utf8"));
  delete raw.qualifying;
  assert.throws(() => decodeQualityCorpus(raw), /header/);
  raw.qualifying = true;
  assert.throws(() => decodeQualityCorpus(raw), /at least 20 tasks/);
});

test("a deterministic task cannot pass without an observable check", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-corpus.json"), "utf8"));
  raw.tasks[0].scorer = { kind: "deterministic" };
  assert.throws(() => decodeQualityCorpus(raw), /observable check/);
});

test("quality event parsing rejects prose and non-monotonic order", () => {
  assert.throws(() => parseQualityEvents("not json\n"), /non-JSON/);
  assert.throws(() => parseQualityEvents(JSON.stringify({
    schemaVersion: "run-event-stream.v1", order: 1, eventType: "query.started", facts: {},
  })), /invalid event-stream/);
  assert.throws(() => parseQualityEvents(`${event(2, "query.started", { sessionId: "s", prompt: "x" })}\n`
    + `${event(1, "query.completed", { result: { finalOutput: "x" } })}\n`), /invalid event-stream/);
});

test("run projection keeps tool, discovery, final-text and usage facts separate", () => {
  const events = parseQualityEvents([
    event(1, "query.started", { sessionId: "s", prompt: "x", sessionPath: "/tmp/s" }),
    event(2, "tool.started", { toolName: "tool_search", taskId: "c1" }),
    event(3, "tool.result", { toolName: "tool_search", taskId: "c1", success: true }),
    event(4, "turn.completed", { output: { role: "coder", content: "done" } }),
    event(5, "query.completed", { result: { finalOutput: "done" } }),
  ].join("\n"));
  const projected = projectQualityRun(events, {
    usage: { byModel: { m: { promptTokens: 10, completionTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 } },
      recentRequests: [{ promptTokens: 7, completionTokens: 2, purpose: "discovery-load", kind: "request" }] },
  });
  assert.equal(projected.finalText, "done");
  assert.deepEqual(projected.tools, ["tool_search"]);
  assert.equal(projected.discoveryCalls, 1);
  assert.deepEqual(projected.usage, { promptTokens: 10, completionTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 });
  assert.equal(projected.discoveryInputTokens, 7);
  assert.equal(projected.discoveryOutputTokens, 2);
  assert.equal(projected.discoveryAttribution, "measured");
});

test("run projection falls back to the terminal result when turn content is empty", () => {
  const projected = projectQualityRun(parseQualityEvents([
    event(1, "turn.completed", { output: { role: "coder", content: "" } }),
    event(2, "query.completed", { result: { finalOutput: "terminal answer" } }),
  ].join("\n")), undefined);
  assert.equal(projected.finalText, "terminal answer");
});

test("deterministic scoring reads final files and never treats a blind rubric as a pass", () => {
  const tasks = corpus().tasks;
  const edit = tasks.find(task => task.id === "edit-single-file");
  const passed = scoreQualityTask(edit, { finalText: "", tools: ["edit"] }, () => "status=ready\n");
  assert.equal(passed.success, true);
  const failed = scoreQualityTask(edit, { finalText: "", tools: ["edit"] }, () => "status=old\n");
  assert.equal(failed.success, false);
  const blind = tasks.find(task => task.id === "summary-facts");
  assert.equal(scoreQualityTask(blind, { finalText: "anything", tools: [] }, () => "").status, "pending-human");
});

test("blind ratings require two independent values and adjudicate disagreement", () => {
  assert.deepEqual(decodeBlindRating([1, 1]), { value: 1, complete: true, raters: [1, 1] });
  assert.deepEqual(decodeBlindRating([0, 1]), { value: null, complete: false, raters: [0, 1] });
  assert.deepEqual(decodeBlindRating({ raters: [0, 1], adjudication: 1 }),
    { value: 1, complete: true, raters: [0, 1], adjudication: 1 });
  assert.equal(decodeBlindRating(1).complete, false);
  assert.throws(() => decodeBlindRating([1]), /exactly two/);
});

test("raw evidence hashes model text instead of persisting the response body", () => {
  const raw = reportSafeObservation({
    sessionId: "s",
    finalText: "SYNTHETIC_RESPONSE_BODY",
    tools: ["read"],
    toolResults: [{ name: "read", success: true }],
    usage: { promptTokens: 1, completionTokens: 2 },
    attributions: [{ provider: "p", model: "m", endpointId: "e" }],
  });
  assert.equal(JSON.stringify(raw).includes("SYNTHETIC_RESPONSE_BODY"), false);
  assert.equal(raw.finalText.characters, 23);
  assert.match(raw.finalText.sha256, /^[a-f0-9]{64}$/);
});

test("paired risk difference is deterministic and retains discordant counts", () => {
  const pairs = [
    { full: true, dynamic: true },
    { full: false, dynamic: true },
    { full: true, dynamic: false },
    { full: true, dynamic: true },
    { full: false, dynamic: false },
  ];
  const first = pairedRiskDifference(pairs, 10_000);
  const second = pairedRiskDifference(pairs, 10_000);
  assert.deepEqual(first, second);
  assert.equal(first.samples, 5);
  assert.equal(first.discordant.dynamicOnly, 1);
  assert.equal(first.discordant.fullOnly, 1);
});

test("report status remains inconclusive or partial when evidence is missing", () => {
  const build = { buildId: "b".repeat(64), inputsDigest: "i".repeat(64),
    artifactDigest: "a".repeat(64), executableSha256: "e".repeat(64), measurementSha256: "m".repeat(64) };
  const runtime = { provider: "p", protocol: "responses", endpoint: "e", model: "m", temperature: 0, maxOutputTokens: 1 };
  const base = {
    build,
    runtime,
    corpus: { version: "v", qualifying: true, minimumPairs: 5, pairs: 0, tasks: 20, repetitions: 5 },
    scorer: { version: "v", kind: "deterministic", adjudication: "none" },
    expectedPairs: 5,
  };
  assert.equal(buildQualityReport({ ...base, pairs: [], limitations: ["not run"] }).status, "inconclusive");
  const arm = { success: true, policyEvidence: "measured", policyViolations: 0 };
  const one = [{ full: arm, dynamic: arm }];
  assert.equal(buildQualityReport({ ...base, pairs: one, limitations: ["one pair"] }).status, "partial");
  const five = Array.from({ length: 5 }, (_, index) => ({
    pairId: `p:${index}`,
    full: arm,
    dynamic: arm,
  }));
  assert.equal(buildQualityReport({ ...base, pairs: five, limitations: [] }).status, "partial");
});

test("complete requires a qualifying corpus, measured runtime, ratings and policy evidence", () => {
  const arm = { success: true, policyEvidence: "measured", policyViolations: 0 };
  const pairs = Array.from({ length: 100 }, (_, index) => ({
    pairId: `blind:${index}`,
    blindHuman: true,
    blindRatingsComplete: true,
    full: { ...arm },
    dynamic: { ...arm },
  }));
  const base = {
    build: {},
    runtime: { provider: "p", protocol: "responses", endpoint: "e", model: "m", temperature: null, maxOutputTokens: null },
    corpus: { version: "v", qualifying: true, minimumPairs: 5, pairs: 100, tasks: 20, repetitions: 5 },
    scorer: { version: "v", kind: "blind-human", adjudication: "provided" },
    pairs,
    expectedPairs: 100,
    limitations: [],
  };
  assert.equal(buildQualityReport(base).status, "complete");
  assert.equal(buildQualityReport({ ...base, corpus: { ...base.corpus, qualifying: false } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, runtime: { ...base.runtime, protocol: null } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, corpus: { ...base.corpus, repetitions: 4 } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, pairs: pairs.map(pair => ({ ...pair, pairId: "duplicate" })) }).status, "partial");
  assert.equal(buildQualityReport({ ...base, limitations: ["repository changed during execution"] }).status, "partial");
  assert.equal(buildQualityReport({ ...base, pairs: pairs.map(pair => ({ ...pair, failureClass: "provider" })) }).status, "partial");
  assert.equal(buildQualityReport({ ...base, pairs: pairs.map(pair => ({ ...pair, blindRatingsComplete: false })) }).status, "partial");
  assert.equal(buildQualityReport({ ...base, pairs: pairs.map(pair => ({
    ...pair, dynamic: { ...pair.dynamic, policyEvidence: "partial" },
  })) }).status, "partial");
  assert.equal(buildQualityReport({ ...base, pairs: pairs.map(pair => ({
    ...pair, dynamic: { ...pair.dynamic, success: null },
  })) }).status, "partial");
});

test("a policy violation prevents a complete quality verdict", () => {
  const pairs = Array.from({ length: 5 }, () => ({
    full: { success: true, policyEvidence: "measured", policyViolations: 0 },
    dynamic: { success: true, policyEvidence: "measured", policyViolations: 1 },
  }));
  const report = buildQualityReport({
    build: {},
    runtime: {},
    corpus: { version: "v", qualifying: true, minimumPairs: 5, pairs: 5, tasks: 20, repetitions: 5 },
    scorer: { version: "v", kind: "deterministic", adjudication: "none" },
    pairs,
    expectedPairs: 5,
    limitations: [],
  });
  assert.equal(report.status, "partial");
  assert.equal(report.summary.policyViolations, 5);
});
