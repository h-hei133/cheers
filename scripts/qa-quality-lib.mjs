import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { RUN_MANIFEST_SCHEMA } from "./qa-quality-manifest.mjs";

export const QUALITY_SCHEMA = "phase20-quality.v1";
export const CORPUS_SCHEMA = "phase20-quality-corpus.v1";
export const TOKENIZER_SCHEMA = "phase20-tokenizer-corpus.v1";
export const MINIMUM_PAIRS = 5;
export const MINIMUM_BOOTSTRAP_ITERATIONS = 10_000;
export const QUALITY_SAMPLING_POLICY = Object.freeze({
  temperature: 0,
  topP: 1,
  maxOutputTokens: 4_096,
});

const TASK_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SAFE_PATH = /^(?![./])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const SAFE_HOME_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const FORMAL_MINIMUM_TASKS = 20;
const FORMAL_CATEGORIES = {
  discovery: 12,
  summary: 4,
  render: 4,
};
const TOKENIZER_LANGUAGES = ["en", "zh", "code", "mixed-cjk-emoji"];
const ARGUMENT_FAILURE = /(?:Invalid tool arguments|Malformed JSON arguments|Tool argument schema)/i;
const RESERVED_TASK_ARGS = new Set([
  "--project", "--attach", "--config", "--json", "--print", "-p", "--session-id",
  "--non-interactive-approval", "--provider", "--api-key", "--profile", "--replay-file", "--tools",
  "--offline", "--no-context-files", "--no-skills", "-ns", "--skill", "--theme", "--use-theme",
  "--dangerously-bypass-hook-trust", "--migrate-session-root", "--doctor", "--version", "-v", "-V",
  "--help", "-h",
]);

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

function optionalStringArray(value, max = 64) {
  return value === undefined ? [] : stringArray(value, max);
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

function homeFixtureFiles(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) fail("Home fixtures must be a bounded array.");
  const seen = new Set();
  return value.map(file => {
    if (!record(file) || typeof file.path !== "string" || !SAFE_HOME_PATH.test(file.path)
      || file.path.split("/").some(part => !part || part === "." || part === "..")
      || typeof file.content !== "string" || file.content.length > 1_048_576) {
      fail("Each home fixture needs a safe path and bounded UTF-8 content.");
    }
    if (seen.has(file.path)) fail(`Duplicate home fixture path: ${file.path}`);
    seen.add(file.path);
    return { path: file.path, content: file.content };
  });
}

function deterministicScorer(value) {
  if (!record(value) || value.kind !== "deterministic") fail("A deterministic task needs a deterministic scorer.");
  const allowed = [
    "kind", "textIncludes", "textExcludes", "requiredTools", "successfulTools", "toolsAnyOf",
    "forbiddenTools", "approvalOutcomes", "files", "absentFiles", "jsonFields",
  ];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("A deterministic scorer contains an unsupported field.");
  const files = value.files === undefined ? [] : fixtureFiles(value.files);
  const absentFiles = value.absentFiles === undefined ? [] : stringArray(value.absentFiles, 128);
  if (absentFiles.some(file => !safePath(file))) fail("absentFiles must contain safe relative paths.");
  const jsonFields = value.jsonFields === undefined ? [] : value.jsonFields;
  if (!Array.isArray(jsonFields) || jsonFields.length > 64
    || jsonFields.some(field => typeof field !== "string" || !field)) {
    fail("jsonFields must be a bounded array of non-empty strings.");
  }
  const toolsAnyOf = value.toolsAnyOf === undefined ? [] : value.toolsAnyOf;
  if (!Array.isArray(toolsAnyOf) || toolsAnyOf.length > 16
    || toolsAnyOf.some(group => !Array.isArray(group) || group.length === 0 || group.length > 16
      || group.some(item => !nonEmptyText(item, 240)))) {
    fail("toolsAnyOf must be a bounded array of non-empty tool-name groups.");
  }
  const approvalOutcomes = optionalStringArray(value.approvalOutcomes, 16);
  if (approvalOutcomes.some(outcome => outcome !== "approved" && outcome !== "denied")) {
    fail("approvalOutcomes may contain only approved or denied.");
  }
  const hasCheck = (value.textIncludes?.length ?? 0) > 0 || (value.textExcludes?.length ?? 0) > 0
    || (value.requiredTools?.length ?? 0) > 0 || (value.successfulTools?.length ?? 0) > 0
    || toolsAnyOf.length > 0 || (value.forbiddenTools?.length ?? 0) > 0
    || approvalOutcomes.length > 0 || files.length > 0 || absentFiles.length > 0
    || jsonFields.length > 0;
  if (!hasCheck) {
    fail("A deterministic task needs at least one observable check.");
  }
  return {
    kind: "deterministic",
    ...(value.textIncludes === undefined ? {} : { textIncludes: stringArray(value.textIncludes) }),
    ...(value.textExcludes === undefined ? {} : { textExcludes: stringArray(value.textExcludes) }),
    ...(value.requiredTools === undefined ? {} : { requiredTools: stringArray(value.requiredTools) }),
    ...(value.successfulTools === undefined ? {} : { successfulTools: stringArray(value.successfulTools) }),
    ...(toolsAnyOf.length === 0 ? {} : { toolsAnyOf: toolsAnyOf.map(group => [...group]) }),
    ...(value.forbiddenTools === undefined ? {} : { forbiddenTools: stringArray(value.forbiddenTools) }),
    ...(approvalOutcomes.length === 0 ? {} : { approvalOutcomes }),
    ...(value.files === undefined ? {} : { files }),
    ...(absentFiles.length === 0 ? {} : { absentFiles }),
    ...(jsonFields.length === 0 ? {} : { jsonFields }),
  };
}

function blindScorer(value) {
  if (!record(value) || value.kind !== "blind-human") fail("A blind task needs a blind-human scorer.");
  if (!nonEmptyText(value.rubric, 16_384)) fail("A blind-human scorer needs a rubric.");
  return { kind: "blind-human", rubric: value.rubric };
}

function extensionFixture(value) {
  if (value === undefined) return undefined;
  if (!record(value) || !TASK_ID.test(value.name) || !/^\d+\.\d+\.\d+$/.test(value.version)
    || !nonEmptyText(value.description, 256) || !nonEmptyText(value.script, 4_096)) {
    fail("An extension fixture needs a safe name, exact version, description and bounded script.");
  }
  return {
    name: value.name,
    version: value.version,
    description: value.description,
    script: value.script,
  };
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
    if ((task.args ?? []).some(argument => RESERVED_TASK_ARGS.has(argument)
      || [...RESERVED_TASK_ARGS].some(flag => flag.startsWith("--") && argument.startsWith(`${flag}=`)))) {
      fail(`A quality task cannot override a harness-owned argument: ${task.id}.`);
    }
    ids.add(task.id);
    const scorer = record(task.scorer) && task.scorer.kind === "deterministic"
      ? deterministicScorer(task.scorer)
      : blindScorer(task.scorer);
    const fixture = fixtureFiles(task.fixture);
    const homeFiles = homeFixtureFiles(task.homeFiles);
    const followUps = optionalStringArray(task.followUps, 8);
    if (followUps.some(prompt => prompt.length < 32 || prompt.length > 32_768)) {
      fail("Each follow-up prompt must be bounded between 32 and 32768 characters.");
    }
    const approval = task.approval ?? "allow-once";
    if (!["allow-once", "allow-always", "deny"].includes(approval)) {
      fail("A quality task approval must be allow-once, allow-always or deny.");
    }
    if (task.category !== undefined && !["discovery", "summary", "render"].includes(task.category)) {
      fail("A quality task category must be discovery, summary or render.");
    }
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
      category: task.category,
      fixture,
      homeFiles,
      extension: extensionFixture(task.extension),
      followUps,
      approval,
      allowedWrites,
      scorer,
    };
  });
  if (value.qualifying) {
    for (const [category, minimum] of Object.entries(FORMAL_CATEGORIES)) {
      const count = tasks.filter(task => task.category === category).length;
      if (count < minimum) fail(`A qualifying corpus needs at least ${minimum} ${category} tasks; found ${count}.`);
    }
    if (tasks.length < FORMAL_MINIMUM_TASKS) {
      fail(`A qualifying quality corpus needs at least ${FORMAL_MINIMUM_TASKS} tasks.`);
    }
  }
  return {
    schemaVersion: CORPUS_SCHEMA,
    version: value.version,
    qualifying: value.qualifying,
    minimumPairs: value.minimumPairs,
    tasks,
  };
}

/** Validate the fixed language strata before any tokenizer probe spends a request. */
export function decodeTokenizerCorpus(value) {
  if (!record(value) || value.schemaVersion !== TOKENIZER_SCHEMA || !nonEmptyText(value.version, 128)
    || !Array.isArray(value.samples) || value.samples.length === 0 || value.samples.length > 32) {
    fail("The tokenizer corpus header or sample count is invalid.");
  }
  const ids = new Set();
  const samples = value.samples.map(sample => {
    if (!record(sample) || !TASK_ID.test(sample.id) || ids.has(sample.id)
      || !TOKENIZER_LANGUAGES.includes(sample.language)
      || typeof sample.text !== "string" || sample.text.length < 8 || sample.text.length > 4_096
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(sample.text)) {
      fail("A tokenizer sample has an invalid id, language or bounded text.");
    }
    ids.add(sample.id);
    return { id: sample.id, language: sample.language, text: sample.text };
  });
  const languages = new Set(samples.map(sample => sample.language));
  if (TOKENIZER_LANGUAGES.some(language => !languages.has(language))) {
    fail(`Tokenizer calibration requires every language stratum: ${TOKENIZER_LANGUAGES.join(", ")}.`);
  }
  return { schemaVersion: TOKENIZER_SCHEMA, version: value.version, samples };
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
    .map(event => {
      const failureReason = eventFact(event, "failureReason");
      return {
        name: eventFact(event, "toolName"),
        success: eventFact(event, "success") === true,
        argumentError: typeof failureReason === "string" && ARGUMENT_FAILURE.test(failureReason),
      };
    });
  const approvals = events.filter(event => event.eventType === "approval.resolved")
    .map(event => eventFact(event, "outcome"))
    .filter(outcome => outcome === "approved" || outcome === "denied");
  const usage = state?.usage;
  const byModel = record(usage?.byModel) ? Object.values(usage.byModel) : [];
  const recentRequests = Array.isArray(usage?.recentRequests) ? usage.recentRequests : [];
  const discoveryHistory = recentRequests
    .filter(entry => record(entry) && typeof entry.purpose === "string" && entry.purpose.startsWith("discovery-"));
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
  const cost = byModel.reduce((sum, bucket) => {
    if (!record(bucket)) return sum;
    const rates = record(bucket.attribution) && record(bucket.attribution.rates) ? bucket.attribution.rates : undefined;
    if (!rates || !finiteNumber(rates.promptPerMTok) || !finiteNumber(rates.completionPerMTok)
      || (finiteNumber(bucket.cacheReadTokens) && bucket.cacheReadTokens > 0
        && !finiteNumber(rates.cacheReadPerMTok))
      || (finiteNumber(bucket.cacheWriteTokens) && bucket.cacheWriteTokens > 0
        && !finiteNumber(rates.cacheWritePerMTok))) {
      sum.coverage = "partial";
      sum.unpricedTokens += ["promptTokens", "completionTokens", "cacheReadTokens", "cacheWriteTokens"]
        .reduce((tokens, key) => tokens + (finiteNumber(bucket[key]) ? bucket[key] : 0), 0);
      return sum;
    }
    sum.usd += (bucket.promptTokens / 1_000_000) * rates.promptPerMTok
      + (bucket.completionTokens / 1_000_000) * rates.completionPerMTok
      + (bucket.cacheReadTokens / 1_000_000) * (rates.cacheReadPerMTok ?? 0)
      + (bucket.cacheWriteTokens / 1_000_000) * (rates.cacheWritePerMTok ?? 0);
    return sum;
  }, { usd: 0, coverage: byModel.length === 0 ? "unknown" : "complete", unpricedTokens: 0 });
  const reportedCache = recentRequests.some(entry => record(entry) && entry.reportedCache === true);
  const promptTokens = totals.promptTokens;
  return {
    sessionId: eventFact(started, "sessionId") ?? null,
    sessionPath: eventFact(started, "sessionPath") ?? null,
    finalText,
    tools,
    toolResults,
    turns: events.filter(event => event.eventType === "turn.started").length,
    toolCalls: tools.length,
    argumentErrors: toolResults.filter(result => result.argumentError).length,
    successfulTools: toolResults.filter(result => result.success).map(result => result.name),
    approvals,
    discoveryCalls: tools.filter(name => name === "tool_search" || name === "tool_load").length,
    discoveryRequests: discoveryHistory.length,
    usage: totals,
    discoveryInputTokens: discoveryHistory
      .reduce((sum, entry) => sum + (finiteNumber(entry.promptTokens) ? entry.promptTokens : 0), 0),
    discoveryOutputTokens: discoveryHistory
      .reduce((sum, entry) => sum + (finiteNumber(entry.completionTokens) ? entry.completionTokens : 0), 0),
    discoveryAttribution: Array.isArray(usage?.recentRequests) && usage.recentRequests.length > 0
      ? "measured" : "not-measured",
    cacheReported: reportedCache,
    cacheHitRate: reportedCache && promptTokens > 0 ? totals.cacheReadTokens / promptTokens : null,
    estimatedCostUsd: cost.coverage === "complete" ? cost.usd : null,
    costCoverage: cost.coverage,
    unpricedTokens: cost.unpricedTokens,
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
    toolResults: Array.isArray(observation?.toolResults)
      ? observation.toolResults.map(result => ({
        name: result.name, success: result.success, argumentError: result.argumentError === true,
      })) : [],
    turns: finiteNumber(observation?.turns) ? observation.turns : 0,
    toolCalls: finiteNumber(observation?.toolCalls) ? observation.toolCalls : 0,
    argumentErrors: finiteNumber(observation?.argumentErrors) ? observation.argumentErrors : 0,
    successfulTools: Array.isArray(observation?.successfulTools) ? [...observation.successfulTools] : [],
    approvals: Array.isArray(observation?.approvals) ? [...observation.approvals] : [],
    discoveryCalls: finiteNumber(observation?.discoveryCalls) ? observation.discoveryCalls : 0,
    discoveryRequests: finiteNumber(observation?.discoveryRequests) ? observation.discoveryRequests : 0,
    discoveryInputTokens: finiteNumber(observation?.discoveryInputTokens) ? observation.discoveryInputTokens : null,
    discoveryOutputTokens: finiteNumber(observation?.discoveryOutputTokens) ? observation.discoveryOutputTokens : null,
    usage: record(observation?.usage) ? { ...observation.usage } : null,
    cacheReported: observation?.cacheReported === true,
    cacheHitRate: finiteNumber(observation?.cacheHitRate) ? observation.cacheHitRate : null,
    estimatedCostUsd: finiteNumber(observation?.estimatedCostUsd) ? observation.estimatedCostUsd : null,
    costCoverage: typeof observation?.costCoverage === "string" ? observation.costCoverage : "unknown",
    unpricedTokens: finiteNumber(observation?.unpricedTokens) ? observation.unpricedTokens : null,
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
  for (const name of scorer.successfulTools ?? []) checks.push({
    name: `successful-tool:${name}`,
    pass: (observation.successfulTools ?? []).includes(name),
  });
  for (const group of scorer.toolsAnyOf ?? []) checks.push({
    name: `any-tool:${group.join("|")}`,
    pass: group.some(name => observation.tools.includes(name)),
  });
  for (const name of scorer.forbiddenTools ?? []) checks.push({ name: `not-tool:${name}`, pass: !observation.tools.includes(name) });
  for (const outcome of scorer.approvalOutcomes ?? []) checks.push({
    name: `approval:${outcome}`,
    pass: (observation.approvals ?? []).includes(outcome),
  });
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
  for (const file of scorer.absentFiles ?? []) {
    let present = true;
    try {
      readFile(file);
    } catch (error) {
      present = error?.code !== "ENOENT";
    }
    checks.push({ name: `absent:${file}`, pass: !present });
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

/** Apply arm-blind ratings without changing recorded execution facts. */
export function applyBlindRatings(pair, ratings) {
  if (!pair?.blindHuman) return pair;
  for (const arm of ["full", "dynamic"]) {
    const value = ratings?.[`${pair.task}:${pair.repetition}`]?.[arm];
    let rating;
    try {
      rating = decodeBlindRating(value);
    } catch (error) {
      throw new Error(`Invalid blind rating ${pair.task}:${pair.repetition}:${arm}: ${error instanceof Error ? error.message : String(error)}`);
    }
    pair[arm].blindRating = rating;
    if (pair[arm].failureClass !== null) {
      pair[arm].success = false;
      pair[arm].status = "failed";
    } else {
      pair[arm].success = rating.complete ? rating.value === 1 : null;
      pair[arm].status = rating.complete ? "scored" : "pending-human";
    }
  }
  pair.blindRatingsComplete = ["full", "dynamic"]
    .every(arm => pair[arm].blindRating?.complete === true);
  pair.failureClass = pair.full.failureClass ?? pair.dynamic.failureClass ?? null;
  return pair;
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

function bootstrapInterval(values, iterations = 1_000) {
  if (!Array.isArray(values) || values.length === 0) return { low: null, high: null };
  const random = seededRandom();
  const estimates = [];
  for (let index = 0; index < iterations; index += 1) {
    let total = 0;
    for (let sample = 0; sample < values.length; sample += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    estimates.push(total / values.length);
  }
  estimates.sort((left, right) => left - right);
  return { low: percentile(estimates, 2.5), high: percentile(estimates, 97.5) };
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

/** Character-based estimate used by the product report; never a token ceiling. */
export function estimateTokenCount(text) {
  return Math.round((String(text).length / 3.5) * 10) / 10;
}

/**
 * Compare local estimates with provider-counted paired deltas.
 *
 * The measured value is the difference between two otherwise identical first
 * requests, so request framing is deliberately part of the estimated sample.
 */
export function tokenizerError(samples) {
  const usable = Array.isArray(samples) ? samples.filter(sample =>
    typeof sample?.language === "string"
    && Number.isFinite(sample.estimated) && sample.estimated >= 0
    && Number.isFinite(sample.measured) && sample.measured > 0) : [];
  if (usable.length === 0) {
    return {
      status: "not-measured",
      samples: 0,
      byLanguage: {},
      unknown: true,
      note: "No paired local estimate and provider token delta is available.",
    };
  }
  const summarize = selected => {
    const ratios = selected.map(sample => sample.estimated / sample.measured);
    const absolute = selected.map(sample => Math.abs(sample.estimated - sample.measured) / sample.measured)
      .sort((left, right) => left - right);
    return {
      samples: selected.length,
      ratio: ratios.reduce((sum, value) => sum + value, 0) / ratios.length,
      min: Math.min(...ratios),
      max: Math.max(...ratios),
      bias: selected.reduce((sum, sample) =>
        sum + (sample.estimated - sample.measured) / sample.measured, 0) / selected.length,
      medianAbsoluteError: percentile(absolute, 50),
      p95AbsoluteError: percentile(absolute, 95),
      ratioInterval: bootstrapInterval(ratios),
    };
  };
  const byLanguage = {};
  for (const language of TOKENIZER_LANGUAGES) {
    const selected = usable.filter(sample => sample.language === language);
    byLanguage[language] = selected.length === 0 ? { samples: 0 } : summarize(selected);
  }
  return {
    status: "measured",
    ...summarize(usable),
    byLanguage,
    unknown: false,
    note: "Ratio of the character estimate to a paired provider prompt-token delta; this is an observed error, not a ceiling.",
  };
}

function costSummary(arms) {
  const values = arms.map(arm => arm?.estimatedCostUsd);
  const priced = values.filter(value => typeof value === "number" && Number.isFinite(value));
  return {
    estimatedUsd: priced.length === arms.length && arms.length > 0
      ? priced.reduce((sum, value) => sum + value, 0) : null,
    coverage: arms.length > 0 && arms.every(arm => arm?.costCoverage === "complete")
      ? "complete" : arms.some(arm => arm?.costCoverage === "partial") ? "partial" : "unknown",
    unpricedTokens: arms.reduce((sum, arm) =>
      sum + (Number.isFinite(arm?.unpricedTokens) ? arm.unpricedTokens : 0), 0),
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
    && arm.policyScope === "fixture-writes-and-forbidden-tools"
    && finiteNumber(arm.policyViolations));
  const blindPairs = pairs.filter(pair => pair.blindHuman === true);
  const blindComplete = pairs.every(pair => pair.blindHuman !== true || pair.blindRatingsComplete === true);
  const runtimeComplete = identityText(input.runtime?.provider, 1_024)
    && identityText(input.runtime?.model, 1_024)
    && identityText(input.runtime?.protocol, 128)
    && identityText(input.runtime?.endpoint, 1_024)
    && finiteNumber(input.runtime?.temperature)
    && Number.isSafeInteger(input.runtime?.maxOutputTokens)
    && input.runtime.maxOutputTokens > 0;
  const manifestComplete = record(input.runManifest)
    && input.runManifest.schemaVersion === RUN_MANIFEST_SCHEMA
    && identityText(input.runManifest.file, 1_024)
    && /^[a-f0-9]{64}$/.test(input.runManifest.sha256)
    && identityText(input.runManifest.runId, 128)
    && Number.isSafeInteger(input.runManifest.revision)
    && input.runManifest.revision >= 1
    && Number.isSafeInteger(input.runManifest.artifacts)
    && input.runManifest.artifacts > 0;
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
  const metricsMeasured = arms.length > 0 && arms.every(arm =>
    finiteNumber(arm.turns) && finiteNumber(arm.toolCalls) && finiteNumber(arm.argumentErrors)
    && finiteNumber(arm.missedDiscovery) && arm.cacheReported === true
    && finiteNumber(arm.cacheHitRate));
  const tokenizerMeasured = input.tokenizer?.status === "measured"
    && TOKENIZER_LANGUAGES.every(language => input.tokenizer?.byLanguage?.[language]?.samples > 0);
  const costComplete = arms.length > 0 && arms.every(arm => arm.costCoverage === "complete"
    && finiteNumber(arm.estimatedCostUsd));
  const tokenizerSamples = Array.isArray(input.tokenizer?.samples)
    ? input.tokenizer.samples.filter(sample => sample.status === "measured") : [];
  const tokenizerCostComplete = tokenizerMeasured && tokenizerSamples.length > 0
    && tokenizerSamples.every(sample => sample.costCoverage === "complete"
      && finiteNumber(sample.estimatedCostUsd));
  const toolLimitationsComplete = !Array.isArray(input.toolLimitations)
    || input.toolLimitations.length === 0;
  const qualityLimitations = Array.isArray(input.qualityLimitations)
    ? input.qualityLimitations : input.limitations;
  const limitationsComplete = !Array.isArray(qualityLimitations) || qualityLimitations.length === 0;
  const qualityComplete = pairs.length >= Math.max(Number(input.expectedPairs) || 0, corpusPairs)
    && pairIdsComplete && repetitionsComplete && corpusCountComplete
    && blindComplete && runtimeComplete && corpusComplete && executionComplete && limitationsComplete
    && policyMeasured && policyViolations === 0 && metricsMeasured && manifestComplete
    && pairs.every(pair => typeof pair.full?.success === "boolean" && typeof pair.dynamic?.success === "boolean");
  const qualityPassed = qualityComplete && risk.ci95 !== null && risk.ci95[0] >= -0.05;
  const toolsComplete = tokenizerMeasured && tokenizerCostComplete && costComplete
    && metricsMeasured && toolLimitationsComplete && manifestComplete;
  const complete = qualityPassed && toolsComplete;
  const status = complete
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
    runManifest: input.runManifest ?? null,
    corpus: input.corpus,
    scorer: input.scorer,
    ratings: input.ratings ?? null,
    pairs,
    summary: {
      riskDifference: risk.difference,
      ci95: risk.ci95,
      discordant: risk.discordant,
      policyViolations,
      policyEvidence: {
        status: policyMeasured ? "measured" : "incomplete",
        scope: "fixture-writes-and-forbidden-tools",
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
      turns: metric("turns"),
      toolCalls: metric("toolCalls"),
      argumentErrors: metric("argumentErrors"),
      missedDiscovery: metric("missedDiscovery"),
      cacheHitRate: metric("cacheHitRate"),
      estimatedCostUsd: metric("estimatedCostUsd"),
      toolEvaluation: {
        status: toolsComplete ? "complete" : metricsMeasured ? "partial" : "not-measured",
        full: {
          cost: costSummary(pairs.map(pair => pair.full)),
          turns: metricSummary(pairs.map(pair => pair.full?.turns)),
          toolCalls: metricSummary(pairs.map(pair => pair.full?.toolCalls)),
          argumentErrors: metricSummary(pairs.map(pair => pair.full?.argumentErrors)),
          missedDiscovery: metricSummary(pairs.map(pair => pair.full?.missedDiscovery)),
          discoveryToolCalls: metricSummary(pairs.map(pair => pair.full?.discoveryToolCalls)),
          cacheReadTokens: metricSummary(pairs.map(pair => pair.full?.cacheReadTokens)),
          cacheWriteTokens: metricSummary(pairs.map(pair => pair.full?.cacheWriteTokens)),
        },
        dynamic: {
          cost: costSummary(pairs.map(pair => pair.dynamic)),
          turns: metricSummary(pairs.map(pair => pair.dynamic?.turns)),
          toolCalls: metricSummary(pairs.map(pair => pair.dynamic?.toolCalls)),
          argumentErrors: metricSummary(pairs.map(pair => pair.dynamic?.argumentErrors)),
          missedDiscovery: metricSummary(pairs.map(pair => pair.dynamic?.missedDiscovery)),
          discoveryRequests: metricSummary(pairs.map(pair => pair.dynamic?.discoveryRequests)),
          discoveryToolCalls: metricSummary(pairs.map(pair => pair.dynamic?.discoveryToolCalls)),
          discoveryInputTokens: metricSummary(pairs.map(pair => pair.dynamic?.discoveryInputTokens)),
          discoveryOutputTokens: metricSummary(pairs.map(pair => pair.dynamic?.discoveryOutputTokens)),
          cacheReadTokens: metricSummary(pairs.map(pair => pair.dynamic?.cacheReadTokens)),
          cacheWriteTokens: metricSummary(pairs.map(pair => pair.dynamic?.cacheWriteTokens)),
        },
        tokenizer: input.tokenizer ?? {
          status: "not-measured",
          samples: 0,
          byLanguage: {},
          unknown: true,
          note: "Tokenizer calibration was not run.",
        },
        tokenizerCost: {
          estimatedUsd: tokenizerCostComplete
            ? tokenizerSamples.reduce((sum, sample) => sum + sample.estimatedCostUsd, 0) : null,
          coverage: tokenizerCostComplete ? "complete" : tokenizerSamples.length > 0 ? "partial" : "unknown",
          samples: tokenizerSamples.length,
        },
      },
    },
    completion: {
      quality: qualityPassed ? "complete" : pairs.length === 0 ? "not-run" : "partial",
      tools: toolsComplete ? "complete" : metricsMeasured ? "partial" : "not-run",
    },
    limitations: input.limitations ?? [],
  };
}

export function sameCorpus(left, right) {
  return isDeepStrictEqual(left, right);
}
