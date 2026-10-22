import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const QUALITY_SCHEMA = "phase20-quality.v1";
export const CORPUS_SCHEMA = "phase20-quality-corpus.v1";
export const MINIMUM_PAIRS = 5;
export const MINIMUM_BOOTSTRAP_ITERATIONS = 10_000;

const TASK_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SAFE_PATH = /^(?![./])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const FORMAL_MINIMUM_TASKS = 20;

function fail(message) {
  throw new Error(message);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonEmptyText(value, max = 16_384) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function identityText(value, max) {
  return nonEmptyText(value, max) && value.trim().length > 0;
}

function safePath(value) {
  return nonEmptyText(value, 1_024) && SAFE_PATH.test(value)
    && value.split("/").every(part => part && part !== "." && part !== "..");
}

function stringArray(value, max = 64) {
  if (!Array.isArray(value) || value.length > max
    || value.some(item => !nonEmptyText(item, 2_048))) {
    fail("Expected a bounded array of non-empty strings.");
  }
  return [...value];
}

function fixtureFiles(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) fail("Corpus fixture files must be a bounded array.");
  const seen = new Set();
  return value.map(file => {
    if (!record(file) || !safePath(file.path) || typeof file.content !== "string" || file.content.length > 1_048_576) {
      fail("Each corpus fixture file needs a safe path and bounded UTF-8 content.");
    }
    if (seen.has(file.path)) fail(`Duplicate fixture path: ${file.path}`);
    seen.add(file.path);
    return { path: file.path, content: file.content };
  });
}

function deterministicScorer(value) {
  if (!record(value) || value.kind !== "deterministic") fail("A deterministic task needs a deterministic scorer.");
  const allowed = ["kind", "textIncludes", "textExcludes", "requiredTools", "forbiddenTools", "files", "jsonFields"];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("A deterministic scorer contains an unsupported field.");
  const files = value.files === undefined ? [] : fixtureFiles(value.files);
  const jsonFields = value.jsonFields === undefined ? [] : value.jsonFields;
  if (!Array.isArray(jsonFields) || jsonFields.length > 64
    || jsonFields.some(field => typeof field !== "string" || !field)) {
    fail("jsonFields must be a bounded array of non-empty strings.");
  }
  const hasCheck = (value.textIncludes?.length ?? 0) > 0 || (value.textExcludes?.length ?? 0) > 0
    || (value.requiredTools?.length ?? 0) > 0 || (value.forbiddenTools?.length ?? 0) > 0
    || files.length > 0 || jsonFields.length > 0;
  if (!hasCheck) {
    fail("A deterministic task needs at least one observable check.");
  }
  return {
    kind: "deterministic",
    ...(value.textIncludes === undefined ? {} : { textIncludes: stringArray(value.textIncludes) }),
    ...(value.textExcludes === undefined ? {} : { textExcludes: stringArray(value.textExcludes) }),
    ...(value.requiredTools === undefined ? {} : { requiredTools: stringArray(value.requiredTools) }),
    ...(value.forbiddenTools === undefined ? {} : { forbiddenTools: stringArray(value.forbiddenTools) }),
    ...(value.files === undefined ? {} : { files }),
    ...(jsonFields.length === 0 ? {} : { jsonFields }),
  };
}

function blindScorer(value) {
  if (!record(value) || value.kind !== "blind-human") fail("A blind task needs a blind-human scorer.");
  if (!nonEmptyText(value.rubric, 16_384)) fail("A blind-human scorer needs a rubric.");
  return { kind: "blind-human", rubric: value.rubric };
}

/** Validate the immutable task description before any provider request is sent. */
export function decodeQualityCorpus(value) {
  if (!record(value) || value.schemaVersion !== CORPUS_SCHEMA || !nonEmptyText(value.version, 128)
    || typeof value.qualifying !== "boolean"
    || !Number.isSafeInteger(value.minimumPairs) || value.minimumPairs < MINIMUM_PAIRS
    || !Array.isArray(value.tasks) || value.tasks.length === 0 || value.tasks.length > 64) {
    fail("The quality corpus header or task count is invalid.");
  }
  const ids = new Set();
  const tasks = value.tasks.map(task => {
    if (!record(task) || !TASK_ID.test(task.id) || ids.has(task.id) || !nonEmptyText(task.stratum, 128)
      || !nonEmptyText(task.prompt, 32_768) || !stringArray(task.args ?? [], 32)
      || (task.args !== undefined && task.args.length > 32)) {
      fail("A quality task has an invalid id, stratum, prompt or argument list.");
    }
    ids.add(task.id);
    const scorer = record(task.scorer) && task.scorer.kind === "deterministic"
      ? deterministicScorer(task.scorer)
      : blindScorer(task.scorer);
    const fixture = fixtureFiles(task.fixture);
    const declaredWrites = task.allowedWrites === undefined
      ? (scorer.kind === "deterministic" ? (scorer.files ?? []).map(file => file.path) : [])
      : stringArray(task.allowedWrites, 128);
    const allowedWrites = declaredWrites.map(file => {
      if (!safePath(file)) fail(`A quality task has an unsafe allowed write path: ${file}`);
      return file;
    });
    if (new Set(allowedWrites).size !== allowedWrites.length) fail("A quality task repeats an allowed write path.");
    return {
      id: task.id,
      stratum: task.stratum,
      prompt: task.prompt,
      args: task.args ?? [],
      fixture,
      allowedWrites,
      scorer,
    };
  });
  if (value.qualifying && tasks.length < FORMAL_MINIMUM_TASKS) {
    fail(`A qualifying quality corpus needs at least ${FORMAL_MINIMUM_TASKS} tasks.`);
  }
  return {
    schemaVersion: CORPUS_SCHEMA,
    version: value.version,
    qualifying: value.qualifying,
    minimumPairs: value.minimumPairs,
    tasks,
  };
}

/** Parse a CLI JSONL stream without accepting prose, malformed lines or a broken order. */
export function parseQualityEvents(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter(Boolean);
  const events = [];
  let previous = 0;
  for (const line of lines) {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      fail("The quality run emitted a non-JSON line.");
    }
    if (!record(value) || value.schemaVersion !== "run-event-stream.v1"
      || !Number.isSafeInteger(value.order) || value.order <= previous
      || !nonEmptyText(value.eventType, 128) || !record(value.facts)
      || !record(value.truthfulness) || value.truthfulness.observationOnly !== true
      || value.truthfulness.terminalSuccessClaim !== false) {
      fail("The quality run emitted an invalid event-stream line.");
    }
    previous = value.order;
    events.push(value);
  }
  return events;
}

function eventFact(event, key) {
  const facts = event?.facts;
  return record(facts) ? facts[key] : undefined;
}

/** Extract only the observable facts a scorer may use. */
export function projectQualityRun(events, state) {
  const started = events.find(event => event.eventType === "query.started");
  const completed = [...events].reverse().find(event => event.eventType === "turn.completed");
  const queryCompleted = [...events].reverse().find(event => event.eventType === "query.completed");
  const output = eventFact(completed, "output");
  const result = eventFact(queryCompleted, "result");
  const finalText = typeof output?.content === "string" && output.content.length > 0 ? output.content
    : typeof result?.finalOutput === "string" ? result.finalOutput : "";
  const tools = events.filter(event => event.eventType === "tool.started")
    .map(event => eventFact(event, "toolName"))
    .filter(name => typeof name === "string");
  const toolResults = events.filter(event => event.eventType === "tool.result")
    .map(event => ({ name: eventFact(event, "toolName"), success: eventFact(event, "success") === true }));
  const usage = state?.usage;
  const byModel = record(usage?.byModel) ? Object.values(usage.byModel) : [];
  const recentRequests = Array.isArray(usage?.recentRequests) ? usage.recentRequests : [];
  const attributions = byModel
    .map(bucket => record(bucket) && record(bucket.attribution) ? bucket.attribution : undefined)
    .filter(attribution => attribution !== undefined);
  const totals = byModel.reduce((sum, bucket) => {
    if (!record(bucket)) return sum;
    for (const key of ["promptTokens", "completionTokens", "cacheReadTokens", "cacheWriteTokens"]) {
      if (finiteNumber(bucket[key])) sum[key] += bucket[key];
    }
    return sum;
  }, { promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  return {
    sessionId: eventFact(started, "sessionId") ?? null,
    sessionPath: eventFact(started, "sessionPath") ?? null,
    finalText,
    tools,
    toolResults,
    discoveryCalls: tools.filter(name => name === "tool_search" || name === "tool_load").length,
    usage: totals,
    discoveryInputTokens: recentRequests
      .filter(entry => record(entry) && typeof entry.purpose === "string" && entry.purpose.startsWith("discovery-"))
      .reduce((sum, entry) => sum + (finiteNumber(entry.promptTokens) ? entry.promptTokens : 0), 0),
    discoveryOutputTokens: recentRequests
      .filter(entry => record(entry) && typeof entry.purpose === "string" && entry.purpose.startsWith("discovery-"))
      .reduce((sum, entry) => sum + (finiteNumber(entry.completionTokens) ? entry.completionTokens : 0), 0),
    discoveryAttribution: Array.isArray(usage?.recentRequests) ? "measured" : "not-measured",
    attributions,
    events: events.length,
  };
}

/** Keep scoring facts while excluding model text from persisted raw evidence. */
export function reportSafeObservation(observation) {
  const finalText = typeof observation?.finalText === "string" ? observation.finalText : "";
  return {
    sessionId: typeof observation?.sessionId === "string" ? observation.sessionId : null,
    finalText: {
      sha256: createHash("sha256").update(finalText).digest("hex"),
      characters: finalText.length,
    },
    tools: Array.isArray(observation?.tools) ? [...observation.tools] : [],
    toolResults: Array.isArray(observation?.toolResults) ? [...observation.toolResults] : [],
    usage: record(observation?.usage) ? { ...observation.usage } : null,
    attributions: Array.isArray(observation?.attributions) ? [...observation.attributions] : [],
  };
}

function fieldValue(value, path) {
  let current = value;
  for (const part of path.split(".")) {
    if (!record(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function parseJsonOutput(text) {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // The next candidate removes a single Markdown fence.
    }
  }
  return undefined;
}

/** Score one task from observable output and the final workspace bytes. */
export function scoreQualityTask(task, observation, readFile) {
  const scorer = task.scorer;
  if (scorer.kind === "blind-human") {
    return { status: "pending-human", success: null, checks: [] };
  }
  const checks = [];
  for (const text of scorer.textIncludes ?? []) checks.push({ name: `text:${text}`, pass: observation.finalText.includes(text) });
  for (const text of scorer.textExcludes ?? []) checks.push({ name: `not-text:${text}`, pass: !observation.finalText.includes(text) });
  for (const name of scorer.requiredTools ?? []) checks.push({ name: `tool:${name}`, pass: observation.tools.includes(name) });
  for (const name of scorer.forbiddenTools ?? []) checks.push({ name: `not-tool:${name}`, pass: !observation.tools.includes(name) });
  if ((scorer.jsonFields ?? []).length > 0) {
    const parsed = parseJsonOutput(observation.finalText);
    for (const field of scorer.jsonFields ?? []) {
      checks.push({ name: `json:${field}`, pass: fieldValue(parsed, field) !== undefined });
    }
  }
  for (const file of scorer.files ?? []) {
    let actual;
    try {
      actual = readFile(file.path);
    } catch {
      actual = undefined;
    }
    checks.push({ name: `file:${file.path}`, pass: actual === file.content });
  }
  return { status: "scored", success: checks.every(check => check.pass), checks };
}

/** Decode two independent blind ratings and an optional adjudication. */
export function decodeBlindRating(value) {
  const rating = item => item === 0 || item === 1 ? item : undefined;
  if (value === undefined) return { value: null, complete: false, raters: [] };
  if (rating(value) !== undefined) {
    return { value, complete: false, raters: [value] };
  }
  if (Array.isArray(value)) {
    if (value.length !== 2 || value.some(item => rating(item) === undefined)) {
      throw new Error("Blind ratings must contain exactly two 0 or 1 values.");
    }
    return value[0] === value[1]
      ? { value: value[0], complete: true, raters: [...value] }
      : { value: null, complete: false, raters: [...value] };
  }
  if (!record(value) || !Array.isArray(value.raters) || value.raters.length !== 2
    || value.raters.some(item => rating(item) === undefined)) {
    throw new Error("Blind ratings must contain exactly two 0 or 1 values.");
  }
  if (value.raters[0] === value.raters[1]) {
    return { value: value.raters[0], complete: true, raters: [...value.raters] };
  }
  const adjudication = rating(value.adjudication);
  if (adjudication === undefined) {
    return { value: null, complete: false, raters: [...value.raters], adjudication: null };
  }
  return { value: adjudication, complete: true, raters: [...value.raters], adjudication };
}

function percentile(sorted, percent) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1))];
}

function seededRandom(seed = 0x9e3779b9) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

/** Deterministic paired bootstrap interval for a risk difference. */
export function pairedRiskDifference(pairs, iterations = MINIMUM_BOOTSTRAP_ITERATIONS) {
  if (!Array.isArray(pairs) || !Number.isSafeInteger(iterations) || iterations < 1_000) {
    fail("A paired risk difference needs a pair array and at least 1,000 bootstrap iterations.");
  }
  const valid = pairs.filter(pair => typeof pair.full === "boolean" && typeof pair.dynamic === "boolean");
  if (valid.length === 0) return { samples: 0, difference: null, ci95: null, discordant: { dynamicOnly: 0, fullOnly: 0 } };
  const differences = valid.map(pair => Number(pair.dynamic) - Number(pair.full));
  const difference = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const random = seededRandom();
  const estimates = [];
  for (let index = 0; index < iterations; index += 1) {
    let total = 0;
    for (let sample = 0; sample < differences.length; sample += 1) {
      total += differences[Math.floor(random() * differences.length)];
    }
    estimates.push(total / differences.length);
  }
  estimates.sort((left, right) => left - right);
  return {
    samples: valid.length,
    difference,
    ci95: [percentile(estimates, 2.5), percentile(estimates, 97.5)],
    discordant: {
      dynamicOnly: valid.filter(pair => pair.dynamic === true && pair.full === false).length,
      fullOnly: valid.filter(pair => pair.dynamic === false && pair.full === true).length,
    },
  };
}

function numeric(values) {
  return values.filter(value => typeof value === "number" && Number.isFinite(value));
}

export function metricSummary(values) {
  const selected = numeric(values).sort((left, right) => left - right);
  if (selected.length === 0) return { count: 0, mean: null, p50: null, p95: null, total: null };
  return {
    count: selected.length,
    mean: selected.reduce((sum, value) => sum + value, 0) / selected.length,
    p50: percentile(selected, 50),
    p95: percentile(selected, 95),
    total: selected.reduce((sum, value) => sum + value, 0),
  };
}

/** Convert raw pairs into the versioned report without promoting partial data. */
export function buildQualityReport(input) {
  const pairs = Array.isArray(input.pairs) ? input.pairs : [];
  const risk = pairedRiskDifference(pairs.map(pair => ({
    full: pair.full?.success ?? null,
    dynamic: pair.dynamic?.success ?? null,
  })));
  const policyViolations = pairs.reduce((sum, pair) => sum
    + (finiteNumber(pair.full?.policyViolations) ? pair.full.policyViolations : 0)
    + (finiteNumber(pair.dynamic?.policyViolations) ? pair.dynamic.policyViolations : 0), 0);
  const arms = pairs.flatMap(pair => [pair.full, pair.dynamic]).filter(record);
  const pairIds = new Set();
  const pairIdsComplete = pairs.every(pair => {
    if (typeof pair.pairId !== "string" || pair.pairId.length === 0 || pairIds.has(pair.pairId)) return false;
    pairIds.add(pair.pairId);
    return true;
  });
  const policyMeasured = arms.length > 0 && arms.every(arm => arm.policyEvidence === "measured"
    && finiteNumber(arm.policyViolations));
  const blindPairs = pairs.filter(pair => pair.blindHuman === true);
  const blindComplete = pairs.every(pair => pair.blindHuman !== true || pair.blindRatingsComplete === true);
  const runtimeComplete = identityText(input.runtime?.provider, 1_024)
    && identityText(input.runtime?.model, 1_024)
    && identityText(input.runtime?.protocol, 128)
    && identityText(input.runtime?.endpoint, 1_024);
  const corpusComplete = input.corpus?.qualifying === true
    && Number.isSafeInteger(input.corpus?.tasks)
    && input.corpus.tasks >= FORMAL_MINIMUM_TASKS;
  const repetitionsComplete = Number.isSafeInteger(input.corpus?.minimumPairs)
    && Number.isSafeInteger(input.corpus?.repetitions)
    && input.corpus.repetitions >= input.corpus.minimumPairs;
  const corpusPairs = Number.isSafeInteger(input.corpus?.tasks)
    && Number.isSafeInteger(input.corpus?.repetitions)
    ? input.corpus.tasks * input.corpus.repetitions : 0;
  const corpusCountComplete = Number.isSafeInteger(input.corpus?.pairs)
    && input.corpus.pairs === pairs.length;
  const executionComplete = arms.length > 0 && pairs.every(pair => pair.failureClass == null
    && pair.full?.failureClass == null && pair.dynamic?.failureClass == null);
  const limitationsComplete = !Array.isArray(input.limitations) || input.limitations.length === 0;
  const complete = pairs.length >= Math.max(Number(input.expectedPairs) || 0, corpusPairs)
    && pairIdsComplete && repetitionsComplete && corpusCountComplete
    && blindComplete && runtimeComplete && corpusComplete && executionComplete && limitationsComplete
    && policyMeasured && policyViolations === 0
    && pairs.every(pair => typeof pair.full?.success === "boolean" && typeof pair.dynamic?.success === "boolean");
  const status = complete && risk.ci95 !== null && risk.ci95[0] >= -0.05
    ? "complete" : pairs.length === 0 ? "inconclusive" : "partial";
  const metric = key => ({
    full: metricSummary(pairs.map(pair => pair.full?.[key])),
    dynamic: metricSummary(pairs.map(pair => pair.dynamic?.[key])),
    pairedDifference: metricSummary(pairs.map(pair => (
      typeof pair.dynamic?.[key] === "number" && typeof pair.full?.[key] === "number"
        ? pair.dynamic[key] - pair.full[key] : null
    ))),
  });
  return {
    schemaVersion: QUALITY_SCHEMA,
    status,
    preregistration: "phase-20-quality-evaluation.md",
    build: input.build,
    runtime: input.runtime,
    corpus: input.corpus,
    scorer: input.scorer,
    pairs,
    summary: {
      riskDifference: risk.difference,
      ci95: risk.ci95,
      discordant: risk.discordant,
      policyViolations,
      policyEvidence: {
        status: policyMeasured ? "measured" : "incomplete",
        arms: arms.length,
        measuredArms: arms.filter(arm => arm.policyEvidence === "measured").length,
      },
      blindRatings: {
        status: blindPairs.length === 0 ? "not-required" : blindComplete ? "complete" : "incomplete",
        pairs: blindPairs.length,
      },
      execution: { status: arms.length === 0 ? "not-run" : executionComplete ? "complete" : "failed" },
      inputTokens: metric("inputTokens"),
      outputTokens: metric("outputTokens"),
      cacheReadTokens: metric("cacheReadTokens"),
      cacheWriteTokens: metric("cacheWriteTokens"),
      latencyMs: metric("latencyMs"),
      discoveryRequests: metric("discoveryRequests"),
      discoveryInputTokens: metric("discoveryInputTokens"),
      discoveryOutputTokens: metric("discoveryOutputTokens"),
    },
    limitations: input.limitations ?? [],
  };
}

export function sameCorpus(left, right) {
  return isDeepStrictEqual(left, right);
}
