import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyBlindRatings,
  buildQualityReport,
  decodeBlindRating,
  decodeQualityCorpus,
  decodeTokenizerCorpus,
  estimateTokenCount,
  pairedRiskDifference,
  QUALITY_SAMPLING_POLICY,
  parseQualityEvents,
  projectQualityRun,
  reportSafeObservation,
  scoreQualityTask,
  tokenizerError,
} from "./qa-quality-lib.mjs";
import { redactAndAssertCodingProviderOutput } from "./real-provider-coding-redaction.mjs";

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

test("the formal corpus covers every preregistered category and language-neutral task shape", () => {
  const decoded = decodeQualityCorpus(JSON.parse(
    fs.readFileSync(path.join(root, "scripts", "qa-quality-formal.json"), "utf8"),
  ));
  assert.equal(decoded.qualifying, true);
  assert.equal(decoded.tasks.length, 20);
  assert.equal(decoded.tasks.filter(task => task.category === "discovery").length, 12);
  assert.equal(decoded.tasks.filter(task => task.category === "summary").length, 4);
  assert.equal(decoded.tasks.filter(task => task.category === "render").length, 4);
  assert.ok(decoded.tasks.some(task => task.homeFiles.some(file => file.path === ".cheers/mcp.json")));
  assert.ok(decoded.tasks.some(task => task.extension?.name === "quality-extension"));
  assert.ok(decoded.tasks.some(task => task.followUps.length > 0));
  assert.ok(decoded.tasks.some(task => task.approval === "deny"));
});

test("a qualifying corpus cannot silently drop a required category", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-formal.json"), "utf8"));
  raw.tasks = raw.tasks.filter(task => task.category !== "render");
  assert.throws(() => decodeQualityCorpus(raw), /at least 4 render tasks/);
});

test("the tokenizer corpus requires all four language strata", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-tokenizer-corpus.json"), "utf8"));
  const decoded = decodeTokenizerCorpus(raw);
  assert.deepEqual(decoded.samples.map(sample => sample.language).sort(),
    ["code", "en", "mixed-cjk-emoji", "zh"]);
  raw.samples = raw.samples.filter(sample => sample.language !== "zh");
  assert.throws(() => decodeTokenizerCorpus(raw), /requires every language stratum/);
});

test("a corpus cannot self-promote or omit its qualification state", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-corpus.json"), "utf8"));
  delete raw.qualifying;
  assert.throws(() => decodeQualityCorpus(raw), /header/);
  raw.qualifying = true;
  assert.throws(() => decodeQualityCorpus(raw), /qualifying corpus needs/);
});

test("a deterministic task cannot pass without an observable check", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-corpus.json"), "utf8"));
  raw.tasks[0].scorer = { kind: "deterministic" };
  assert.throws(() => decodeQualityCorpus(raw), /observable check/);
});

test("a corpus cannot override harness-owned provider, config or session arguments", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "scripts", "qa-quality-formal.json"), "utf8"));
  for (const args of [["--provider", "other"], ["--config=other"], ["-p", "other"]]) {
    const changed = structuredClone(raw);
    changed.tasks[0].args = args;
    assert.throws(() => decodeQualityCorpus(changed), /harness-owned argument/);
  }
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
  assert.equal(projected.discoveryRequests, 1);
  assert.deepEqual(projected.usage, { promptTokens: 10, completionTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 });
  assert.equal(projected.discoveryInputTokens, 7);
  assert.equal(projected.discoveryOutputTokens, 2);
  assert.equal(projected.discoveryAttribution, "measured");
});

test("run projection measures turns, approvals, argument failures, cache and priced cost", () => {
  const events = parseQualityEvents([
    event(1, "query.started", { sessionId: "s", prompt: "x" }),
    event(2, "turn.started", { role: "coder", turn: 1 }),
    event(3, "tool.started", { toolName: "write", taskId: "c1" }),
    event(4, "approval.resolved", { toolName: "write", taskId: "c1", outcome: "denied" }),
    event(5, "tool.result", {
      toolName: "write",
      taskId: "c1",
      success: false,
      failureReason: "Invalid tool arguments: required constraint failed.",
    }),
    event(6, "turn.completed", { output: { role: "coder", content: "done" } }),
    event(7, "query.completed", { result: { finalOutput: "done" } }),
  ].join("\n"));
  const projected = projectQualityRun(events, {
    usage: {
      byModel: {
        m: {
          promptTokens: 1_000,
          completionTokens: 100,
          cacheReadTokens: 400,
          cacheWriteTokens: 0,
          attribution: {
            provider: "p",
            model: "m",
            endpointId: "e",
            rates: { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.5 },
          },
        },
      },
      recentRequests: [{
        promptTokens: 1_000,
        completionTokens: 100,
        cacheReadTokens: 400,
        cacheWriteTokens: 0,
        purpose: "turn",
        kind: "request",
        reportedCache: true,
      }],
    },
  });
  assert.equal(projected.turns, 1);
  assert.equal(projected.toolCalls, 1);
  assert.equal(projected.argumentErrors, 1);
  assert.deepEqual(projected.approvals, ["denied"]);
  assert.equal(projected.cacheHitRate, 0.4);
  assert.equal(projected.costCoverage, "complete");
  assert.ok(Math.abs(projected.estimatedCostUsd - 0.0014) < Number.EPSILON * 10);
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

test("deterministic scoring distinguishes attempted, successful, denied and absent-file facts", () => {
  const denied = {
    kind: "deterministic",
    requiredTools: ["write"],
    approvalOutcomes: ["denied"],
    absentFiles: ["forbidden.txt"],
  };
  const passed = scoreQualityTask({ scorer: denied }, {
    finalText: "denied",
    tools: ["write"],
    successfulTools: [],
    approvals: ["denied"],
  }, () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
  assert.equal(passed.success, true);
  const wrong = scoreQualityTask({ scorer: denied }, {
    finalText: "denied",
    tools: ["write"],
    successfulTools: [],
    approvals: ["approved"],
  }, () => "forbidden\n");
  assert.equal(wrong.success, false);
  assert.deepEqual(wrong.checks.filter(check => !check.pass).map(check => check.name),
    ["approval:denied", "absent:forbidden.txt"]);
});

test("blind ratings require two independent values and adjudicate disagreement", () => {
  assert.deepEqual(decodeBlindRating([1, 1]), { value: 1, complete: true, raters: [1, 1] });
  assert.deepEqual(decodeBlindRating([0, 1]), { value: null, complete: false, raters: [0, 1] });
  assert.deepEqual(decodeBlindRating({ raters: [0, 1], adjudication: 1 }),
    { value: 1, complete: true, raters: [0, 1], adjudication: 1 });
  assert.equal(decodeBlindRating(1).complete, false);
  assert.throws(() => decodeBlindRating([1]), /exactly two/);
});

test("blind ratings update only subjective outcomes and preserve execution facts", () => {
  const pair = {
    pairId: "summary-facts:0",
    task: "summary-facts",
    repetition: 0,
    blindHuman: true,
    blindRatingsComplete: false,
    failureClass: null,
    full: { success: null, status: "pending-human", failureClass: null, inputTokens: 10 },
    dynamic: { success: null, status: "pending-human", failureClass: null, inputTokens: 11 },
  };
  const rated = applyBlindRatings(pair, {
    "summary-facts:0": { full: [1, 1], dynamic: { raters: [0, 1], adjudication: 0 } },
  });
  assert.equal(rated.blindRatingsComplete, true);
  assert.equal(rated.full.success, true);
  assert.equal(rated.dynamic.success, false);
  assert.equal(rated.dynamic.inputTokens, 11);
  const incomplete = applyBlindRatings({
    ...pair,
    full: { ...pair.full },
    dynamic: { ...pair.dynamic },
  }, { "summary-facts:0": { full: [1, 0], dynamic: 1 } });
  assert.equal(incomplete.blindRatingsComplete, false);
  assert.equal(incomplete.full.status, "pending-human");
  assert.equal(incomplete.dynamic.status, "pending-human");
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

test("blind review text is redacted before it can be written as an artifact", () => {
  const result = redactAndAssertCodingProviderOutput(
    "Authorization: Bearer sk-live-secret-123456789\napi_key=another-secret",
  );
  assert.equal(result.ok, true);
  assert.equal(result.redacted.includes("sk-live-secret"), false);
  assert.equal(result.redacted.includes("another-secret"), false);
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

test("tokenizer error is reported by language without promoting missing strata", () => {
  const summary = tokenizerError([
    { language: "en", estimated: 20, measured: 18 },
    { language: "zh", estimated: 20, measured: 30 },
    { language: "code", estimated: 20, measured: 20 },
    { language: "mixed-cjk-emoji", estimated: 20, measured: 25 },
  ]);
  assert.equal(summary.status, "measured");
  assert.equal(summary.samples, 4);
  assert.equal(summary.byLanguage.zh.samples, 1);
  assert.ok(summary.byLanguage.zh.bias < 0);
  assert.match(summary.note, /not a ceiling/);
  assert.equal(estimateTokenCount("1234567"), 2);
  assert.equal(tokenizerError([]).unknown, true);
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
  const arm = {
    success: true,
    policyEvidence: "measured",
    policyScope: "fixture-writes-and-forbidden-tools",
    policyViolations: 0,
    turns: 1,
    toolCalls: 1,
    argumentErrors: 0,
    missedDiscovery: 0,
    cacheReported: true,
    cacheHitRate: 0.5,
    cacheReadTokens: 10,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0.001,
    costCoverage: "complete",
  };
  const pairs = Array.from({ length: 100 }, (_, index) => ({
    pairId: `blind:${index}`,
    blindHuman: true,
    blindRatingsComplete: true,
    full: { ...arm },
    dynamic: { ...arm },
  }));
  const base = {
    build: {},
    runtime: { provider: "p", protocol: "responses", endpoint: "e", model: "m", ...QUALITY_SAMPLING_POLICY },
    runManifest: {
      schemaVersion: "phase20-quality-run-manifest.v1",
      file: ".omx/artifacts/quality-runs/run/run-manifest.json",
      sha256: "a".repeat(64),
      runId: "run",
      revision: 1,
      artifacts: 6,
    },
    corpus: { version: "v", qualifying: true, minimumPairs: 5, pairs: 100, tasks: 20, repetitions: 5 },
    scorer: { version: "v", kind: "blind-human", adjudication: "provided" },
    pairs,
    expectedPairs: 100,
    tokenizer: {
      status: "measured",
      samples: ["en", "zh", "code", "mixed-cjk-emoji"].map(language => ({
        language,
        status: "measured",
        estimatedCostUsd: 0.0001,
        costCoverage: "complete",
      })),
      byLanguage: Object.fromEntries(["en", "zh", "code", "mixed-cjk-emoji"]
        .map(language => [language, { samples: 1 }])),
    },
    limitations: [],
  };
  assert.equal(buildQualityReport(base).status, "complete");
  assert.equal(QUALITY_SAMPLING_POLICY.temperature, 0);
  assert.equal(QUALITY_SAMPLING_POLICY.maxOutputTokens, 4_096);
  assert.equal(buildQualityReport({ ...base, corpus: { ...base.corpus, qualifying: false } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, runtime: { ...base.runtime, protocol: null } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, runtime: { ...base.runtime, temperature: null } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, runtime: { ...base.runtime, maxOutputTokens: null } }).status, "partial");
  assert.equal(buildQualityReport({ ...base, runManifest: null }).status, "partial");
  assert.equal(buildQualityReport({ ...base, tokenizer: { status: "failed", byLanguage: {} } }).status, "partial");
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
  const toolsFailed = buildQualityReport({
    ...base,
    tokenizer: { status: "failed", byLanguage: {} },
    limitations: ["tokenizer incomplete"],
    qualityLimitations: [],
    toolLimitations: ["tokenizer incomplete"],
  });
  assert.equal(toolsFailed.status, "partial");
  assert.equal(toolsFailed.completion.quality, "complete");
  assert.equal(toolsFailed.completion.tools, "partial");
  const qualityFailed = buildQualityReport({
    ...base,
    limitations: ["quality incomplete"],
    qualityLimitations: ["quality incomplete"],
    toolLimitations: [],
  });
  assert.equal(qualityFailed.completion.quality, "partial");
  assert.equal(qualityFailed.completion.tools, "complete");
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
