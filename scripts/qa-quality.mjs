#!/usr/bin/env node
/**
 * Run the Phase 20 quality protocol or emit an explicit non-result.
 *
 * Real provider execution requires an explicit opt-in, a clean repository and
 * an isolated runtime home. The report never turns a missing run, a missing
 * blind rating or an incomplete sample set into a successful quality claim.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { checkBuild } from "./start-lib.mjs";
import {
  buildQualityReport,
  decodeQualityCorpus,
  decodeBlindRating,
  parseQualityEvents,
  projectQualityRun,
  reportSafeObservation,
  scoreQualityTask,
} from "./qa-quality-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCorpus = path.join(root, "scripts", "qa-quality-corpus.json");
const dist = path.join(root, "packages", "ts-shell", "dist");
const networkFailure = /(provider-network|ConnectTimeout|HeadersTimeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|TLS|timeout|unreachable)/i;

function parseArgs(argv) {
  const options = {
    corpus: defaultCorpus,
    output: path.join(root, ".omx", "artifacts", "phase20-quality.json"),
    runs: undefined,
    ratings: undefined,
    real: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--corpus") options.corpus = argv[++index];
    else if (token === "--output") options.output = argv[++index];
    else if (token === "--runs") options.runs = Number(argv[++index]);
    else if (token === "--ratings") options.ratings = argv[++index];
    else if (token === "--real") options.real = true;
    else if (token === "--json") options.json = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (options.help) return options;
  if (!options.corpus || !options.output) throw new Error("--corpus and --output require values.");
  if (options.runs !== undefined && (!Number.isSafeInteger(options.runs) || options.runs < 1 || options.runs > 100)) {
    throw new Error("--runs must be an integer from 1 to 100.");
  }
  return options;
}

function help() {
  return `Phase 20 quality evaluation

Usage:
  node scripts/qa-quality.mjs [--corpus file] [--output file] [--runs n]
  node scripts/qa-quality.mjs --real --runs 5 [--ratings file]

Without --real the command validates the corpus/build and writes an
inconclusive report. --real requires CHEERS_PHASE20_QUALITY=1,
CHEERS_REAL_HOME and a clean worktree. Blind ratings use
[raterA, raterB] per arm, or {raters, adjudication} on disagreement.
`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform === "win32" && fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

function repositoryClean() {
  const result = spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
  return result.status === 0 && !result.stdout.trim();
}

function projectSnapshot(directory) {
  const snapshot = new Map();
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path.relative(directory, target).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        snapshot.set(relative, `symlink:${fs.readlinkSync(target)}`);
      } else if (entry.isDirectory()) {
        visit(target);
      } else if (entry.isFile()) {
        const mode = fs.statSync(target).mode & 0o777;
        snapshot.set(relative, `file:${mode.toString(8)}:${createHash("sha256").update(fs.readFileSync(target)).digest("hex")}`);
      } else {
        snapshot.set(relative, `other:${entry.name}`);
      }
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return snapshot;
}

function evaluatePolicy(task, before, after, tools, eventsMeasured) {
  const allowed = new Set(task.allowedWrites);
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter(file => before.get(file) !== after.get(file))
    .sort();
  const unauthorizedWrites = changed.filter(file => !allowed.has(file));
  const forbiddenTools = [...new Set(tools.filter(tool => (task.scorer.forbiddenTools ?? []).includes(tool)))].sort();
  return {
    evidence: eventsMeasured ? "measured" : "partial",
    violations: unauthorizedWrites.length + forbiddenTools.length,
    unauthorizedWrites,
    forbiddenTools,
  };
}

function evidenceDigest(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function buildIdentity(verified, corpusFile) {
  const files = [
    path.join(root, "dist", "cli.js"),
    path.join(dist, "build-manifest.json"),
    path.join(root, verified.executable.path),
    verified.entry,
    fileURLToPath(import.meta.url),
    path.join(root, "scripts", "qa-quality-lib.mjs"),
    corpusFile,
    ...verified.manifest.artifacts.map(artifact => path.join(dist, artifact.path)),
  ];
  return {
    buildId: verified.manifest.buildId,
    inputsDigest: verified.manifest.inputsDigest,
    artifactDigest: verified.manifest.artifactDigest,
    executableSha256: createHash("sha256").update(fs.readFileSync(path.join(root, verified.executable.path))).digest("hex"),
    measurementSha256: evidenceDigest(files),
  };
}

function fixtureProject(task, directory) {
  fs.mkdirSync(directory, { recursive: true });
  for (const file of task.fixture) {
    const target = path.join(directory, file.path);
    const relative = path.relative(directory, target).split(path.sep).join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error(`Fixture escaped its project: ${file.path}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
}

function readSessionState(sessionPath, home) {
  if (typeof sessionPath !== "string") return undefined;
  const resolved = path.resolve(sessionPath);
  const homePath = path.resolve(home);
  if (resolved !== homePath && !resolved.startsWith(`${homePath}${path.sep}`)) return undefined;
  const stateFile = path.join(resolved, "state.json");
  if (!fs.existsSync(stateFile)) return undefined;
  return readJson(stateFile);
}

function environment(home, realHome, runRoot) {
  const env = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: path.join(home, "tmp"),
    TMP: path.join(home, "tmp"),
    TEMP: path.join(home, "tmp"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    CHEERS_TEST_ROOT: runRoot,
    CHEERS_HOME_OVERRIDE: realHome,
    CHEERS_REAL_HOME: realHome,
    CHEERS_PROVIDER_MODE: "real",
    CHEERS_PHASE20_QUALITY: "1",
    GIT_CEILING_DIRECTORIES: runRoot,
    NO_COLOR: "1",
  };
}

function spawnCapture(command, args, options) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const limit = 16 * 1024 * 1024;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stdout.on("data", chunk => {
      if (stdout.length < limit) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", chunk => {
      if (stderr.length < limit) stderr += chunk.toString("utf8");
    });
    child.on("error", error => {
      clearTimeout(timer);
      resolve({ code: -1, signal: null, timedOut, stdout, stderr, error: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}

async function probeProtocol(input) {
  const probeRoot = path.join(input.runRoot, "runtime-probe");
  const project = path.join(probeRoot, "project");
  const home = path.join(probeRoot, "home");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
  const config = path.join(home, "quality-config.json");
  fs.writeFileSync(config, `${JSON.stringify({ toolDiscovery: "full" })}\n`, "utf8");
  const result = await spawnCapture(process.execPath, [
    input.verified.entry,
    "--project", project,
    "--config", config,
    "--json",
    "--no-context-files",
    "--no-skills",
    "--print",
    "/context",
  ], {
    cwd: project,
    env: environment(home, input.realHome, input.runRoot),
    timeoutMs: 60_000,
  });
  if (result.code !== 0) return { protocol: null, failure: "Runtime protocol probe failed." };
  let events;
  try {
    events = parseQualityEvents(result.stdout);
  } catch {
    return { protocol: null, failure: "Runtime protocol probe emitted an invalid event stream." };
  }
  const protocol = events
    .filter(event => event.eventType === "cli.output")
    .map(event => event.facts?.report?.facts?.protocol)
    .find(value => typeof value === "string" && value.length > 0);
  return protocol
    ? { protocol, failure: null }
    : { protocol: null, failure: "Runtime protocol was not reported by the context command." };
}

function failureClass(result, error) {
  if (result.timedOut) return "provider";
  if (error) return "runtime";
  const text = `${result.stdout}\n${result.stderr}`;
  return networkFailure.test(text) ? "provider" : "runtime";
}

async function runArm(input) {
  const armRoot = path.join(input.runRoot, "arms", input.task.id, String(input.repetition), input.arm);
  const project = path.join(armRoot, "project");
  const home = path.join(armRoot, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
  fixtureProject(input.task, project);
  const before = projectSnapshot(project);
  const config = path.join(home, "quality-config.json");
  fs.writeFileSync(config, `${JSON.stringify({ toolDiscovery: input.arm === "dynamic" ? "dynamic" : "full" })}\n`, "utf8");
  const args = [
    input.verified.entry,
    "--project", project,
    "--config", config,
    "--json",
    "--no-context-files",
    "--no-skills",
    ...input.task.args,
    "--print",
    input.task.prompt,
  ];
  const started = performance.now();
  const result = await spawnCapture(process.execPath, args, {
    cwd: project,
    env: environment(home, input.realHome, input.runRoot),
    timeoutMs: input.timeoutMs,
  });
  const latencyMs = performance.now() - started;
  let events = [];
  let parseError;
  if (result.stdout.trim()) {
    try {
      events = parseQualityEvents(result.stdout);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  const after = projectSnapshot(project);
  const observation = projectQualityRun(events, readSessionState(
    events.find(event => event.eventType === "query.started")?.facts?.sessionPath,
    home,
  ));
  const readFile = relative => {
    const target = path.resolve(project, relative);
    if (!target.startsWith(`${path.resolve(project)}${path.sep}`)) throw new Error("Task file escaped its project.");
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Task file is not a regular project file.");
    return fs.readFileSync(target, "utf8");
  };
  const score = result.code === 0 && parseError === undefined
    ? scoreQualityTask(input.task, observation, readFile)
    : { status: "failed", success: false, checks: [] };
  const policy = evaluatePolicy(input.task, before, after, observation.tools,
    parseError === undefined && events.length > 0);
  const attributions = observation.attributions;
  const raw = {
    arm: input.arm,
    task: input.task.id,
    repetition: input.repetition,
    exitCode: result.code,
    timedOut: result.timedOut,
    latencyMs,
    score,
    ...(parseError ? { scoringError: parseError } : {}),
    observation: reportSafeObservation(observation),
    policy,
  };
  const rawFile = path.join(armRoot, "run.json");
  writeJson(rawFile, raw);
  return {
    arm: input.arm,
    status: result.code === 0 ? score.status : "failed",
    success: score.success,
    checks: score.checks,
    failureClass: result.code === 0
      ? (parseError === undefined ? null : "scorer")
      : failureClass(result, result.error),
    latencyMs,
    inputTokens: observation.usage.promptTokens,
    outputTokens: observation.usage.completionTokens,
    cacheReadTokens: observation.usage.cacheReadTokens,
    cacheWriteTokens: observation.usage.cacheWriteTokens,
    discoveryRequests: observation.discoveryCalls,
    discoveryInputTokens: observation.discoveryInputTokens,
    discoveryOutputTokens: observation.discoveryOutputTokens,
    discoveryAttribution: observation.discoveryAttribution,
    policyEvidence: policy.evidence,
    policyViolations: policy.violations,
    unauthorizedWrites: policy.unauthorizedWrites,
    forbiddenTools: policy.forbiddenTools,
    rawFile: path.relative(root, rawFile).split(path.sep).join("/"),
    attribution: attributions[0] ?? null,
    attributions,
  };
}

function ratingFor(ratings, task, repetition, arm) {
  const value = ratings?.[`${task.id}:${repetition}`]?.[arm];
  try {
    return decodeBlindRating(value);
  } catch (error) {
    throw new Error(`Invalid blind rating ${task.id}:${repetition}:${arm}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pairOrder(task, repetition) {
  const digest = createHash("sha256").update(`${task.id}:${repetition}`).digest();
  return digest[0] % 2 === 0 ? ["full", "dynamic"] : ["dynamic", "full"];
}

async function runPair(input) {
  const order = pairOrder(input.task, input.repetition);
  const arms = {};
  for (const arm of order) {
    arms[arm] = await runArm({ ...input, arm });
  }
  if (input.task.scorer.kind === "blind-human") {
    for (const arm of ["full", "dynamic"]) {
      const rating = ratingFor(input.ratings, input.task, input.repetition, arm);
      arms[arm].blindRating = rating;
      if (arms[arm].failureClass !== null) {
        arms[arm].success = false;
        arms[arm].status = "failed";
      } else {
        arms[arm].success = rating.value;
        arms[arm].status = rating.complete ? "scored" : "pending-human";
      }
    }
  }
  return {
    pairId: `${input.task.id}:${input.repetition}`,
    task: input.task.id,
    stratum: input.task.stratum,
    blindHuman: input.task.scorer.kind === "blind-human",
    blindRatingsComplete: input.task.scorer.kind !== "blind-human"
      || ["full", "dynamic"].every(arm => arms[arm].blindRating?.complete === true),
    order,
    full: arms.full,
    dynamic: arms.dynamic,
    failureClass: arms.full.failureClass ?? arms.dynamic.failureClass ?? null,
  };
}

function runtimeIdentity(pairs, protocol) {
  const arms = pairs.flatMap(pair => [pair.full, pair.dynamic]);
  const perArm = arms.map(arm => arm.attributions?.length
    ? arm.attributions
    : arm.attribution ? [arm.attribution] : []);
  const attributions = perArm.flat();
  const targets = new Set(attributions.map(attribution =>
    JSON.stringify([attribution.provider, attribution.model, attribution.endpointId])));
  const attribution = arms.length > 0 && perArm.every(items => items.length > 0) && targets.size === 1
    ? attributions[0] : undefined;
  return attribution ? {
    provider: attribution.provider,
    protocol: protocol ?? null,
    endpoint: attribution.endpointId,
    model: attribution.model,
    temperature: null,
    maxOutputTokens: null,
  } : { provider: null, protocol: protocol ?? null, endpoint: null, model: null, temperature: null, maxOutputTokens: null };
}

function reportLimitations(input) {
  const { real, clean, pairs, minimumPairs, corpus, runtime, protocolFailure } = input;
  const limitations = [];
  if (!real) limitations.push("Real provider execution was not requested; this report is not a quality result.");
  if (real && !clean) limitations.push("The repository was not clean after execution; the quality result is not accepted.");
  if (pairs.some(pair => pair.full.status === "pending-human" || pair.dynamic.status === "pending-human")) {
    limitations.push("Blind-human ratings are incomplete; subjective tasks remain inconclusive.");
  }
  if (pairs.some(pair => pair.full.discoveryAttribution !== "measured"
    || pair.dynamic.discoveryAttribution !== "measured")) {
    limitations.push("Discovery-specific input/output token attribution is not available from the current session usage snapshot.");
  }
  if (pairs.length < minimumPairs) limitations.push(`Only ${pairs.length} pairs were completed; at least ${minimumPairs} are required.`);
  if (Number.isSafeInteger(corpus.repetitions) && corpus.repetitions < minimumPairs) {
    limitations.push(`Each task ran ${corpus.repetitions} times; at least ${minimumPairs} independent repetitions are required.`);
  }
  if (real && !corpus.qualifying) {
    limitations.push("The corpus is a starter set, not the preregistered qualifying quality task set.");
  }
  if (real && (!runtime.provider?.trim() || !runtime.model?.trim()
    || !runtime.protocol?.trim() || !runtime.endpoint?.trim())) {
    limitations.push("Provider, model, protocol and endpoint identity were not all measured for every arm.");
  }
  if (real && protocolFailure) limitations.push(protocolFailure);
  if (real && pairs.some(pair => pair.full.policyEvidence !== "measured"
    || pair.dynamic.policyEvidence !== "measured")) {
    limitations.push("Policy evidence is incomplete; at least one arm lacks a parsed event stream for tool-policy checks.");
  }
  if (real && pairs.some(pair => pair.failureClass !== null)) {
    limitations.push("At least one arm failed outside the scored task; the batch is not a complete quality result.");
  }
  return limitations;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }
  const corpusFile = path.resolve(root, options.corpus);
  const corpus = decodeQualityCorpus(readJson(corpusFile));
  const pkg = readJson(path.join(root, "packages/ts-shell/package.json"));
  const verified = checkBuild({ root, dist, version: pkg.version, executablePolicy: "required" });
  if (!verified.ok) throw new Error(`A verified build is required: ${verified.reason}`);
  const build = buildIdentity(verified, corpusFile);
  const clean = repositoryClean();
  const realHome = process.env.CHEERS_REAL_HOME?.trim();
  const optIn = process.env.CHEERS_PHASE20_QUALITY?.trim() === "1";
  const runs = options.runs ?? corpus.minimumPairs;
  const real = options.real;
  if (real && (!optIn || !realHome || !fs.existsSync(realHome) || !clean)) {
    const report = buildQualityReport({
      build,
      runtime: runtimeIdentity([], null),
      corpus: { version: corpus.version, qualifying: corpus.qualifying, minimumPairs: corpus.minimumPairs,
        pairs: 0, tasks: corpus.tasks.length, repetitions: runs },
      scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human", adjudication: "not-run" },
      pairs: [],
      expectedPairs: corpus.tasks.length * runs,
      limitations: [
        !optIn ? "CHEERS_PHASE20_QUALITY=1 is required for real execution." : "",
        !realHome ? "CHEERS_REAL_HOME is required for real execution." : "",
        realHome && !fs.existsSync(realHome) ? "CHEERS_REAL_HOME does not exist." : "",
        !clean ? "The repository must be clean before real execution." : "",
      ].filter(Boolean),
    });
    writeJson(path.resolve(root, options.output), report);
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 2;
  }
  if (!real) {
    const report = buildQualityReport({
      build,
      runtime: runtimeIdentity([], null),
      corpus: { version: corpus.version, qualifying: corpus.qualifying, minimumPairs: corpus.minimumPairs,
        pairs: 0, tasks: corpus.tasks.length, repetitions: runs },
      scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human", adjudication: "not-run" },
      pairs: [],
      expectedPairs: corpus.tasks.length * runs,
      limitations: reportLimitations({ real: false, clean, pairs: [], minimumPairs: corpus.minimumPairs,
        corpus, runtime: runtimeIdentity([], null), protocolFailure: null }),
    });
    writeJson(path.resolve(root, options.output), report);
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 2;
  }
  const ratings = options.ratings ? readJson(path.resolve(root, options.ratings)) : undefined;
  const runRoot = path.join(path.dirname(path.resolve(root, options.output)), "quality-runs",
    new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(runRoot, { recursive: true });
  const protocolProbe = await probeProtocol({ runRoot, realHome, verified });
  const pairs = [];
  for (const task of corpus.tasks) {
    for (let repetition = 0; repetition < runs; repetition += 1) {
      pairs.push(await runPair({
        task,
        repetition,
        runs,
        ratings,
        realHome,
        runRoot,
        verified,
        timeoutMs: 240_000,
      }));
    }
  }
  const afterClean = repositoryClean();
  const runtime = runtimeIdentity(pairs, protocolProbe.protocol);
  const blindPairs = pairs.filter(pair => pair.blindHuman);
  const blindComplete = blindPairs.every(pair => pair.blindRatingsComplete === true);
  const report = buildQualityReport({
    build,
    runtime,
    corpus: { version: corpus.version, qualifying: corpus.qualifying, minimumPairs: corpus.minimumPairs, pairs: pairs.length,
      tasks: corpus.tasks.length, repetitions: runs },
    scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human",
      adjudication: blindPairs.length === 0 ? "not-required" : blindComplete ? "provided" : "incomplete" },
    pairs,
    expectedPairs: corpus.tasks.length * runs,
    limitations: reportLimitations({ real: true, clean: afterClean, pairs, minimumPairs: corpus.minimumPairs,
      corpus, runtime, protocolFailure: protocolProbe.failure }),
  });
  writeJson(path.resolve(root, options.output), report);
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "complete" ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`quality-evaluation: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
