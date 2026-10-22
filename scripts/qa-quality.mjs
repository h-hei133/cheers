#!/usr/bin/env node
/**
 * Run the Phase 20 quality protocol or emit an explicit non-result.
 *
 * Real provider execution requires an explicit opt-in, a clean repository and
 * an isolated runtime home. The report never turns a missing run, a missing
 * blind rating or an incomplete sample set into a successful quality claim.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { checkBuild } from "./start-lib.mjs";
import { redactAndAssertCodingProviderOutput } from "./real-provider-coding-redaction.mjs";
import {
  buildQualityReport,
  applyBlindRatings,
  QUALITY_SAMPLING_POLICY,
  decodeQualityCorpus,
  decodeBlindRating,
  decodeTokenizerCorpus,
  estimateTokenCount,
  parseQualityEvents,
  projectQualityRun,
  reportSafeObservation,
  scoreQualityTask,
  tokenizerError,
} from "./qa-quality-lib.mjs";
import {
  manifestReportBinding,
  persistRatings,
  readRunManifest,
  writeRunManifest,
} from "./qa-quality-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCorpus = path.join(root, "scripts", "qa-quality-formal.json");
const defaultTokenizer = path.join(root, "scripts", "qa-tokenizer-corpus.json");
const dist = path.join(root, "packages", "ts-shell", "dist");
const networkFailure = /(provider-network|ConnectTimeout|HeadersTimeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|TLS|timeout|unreachable)/i;
const tokenizerPrefix = "Reply with the single word OK.";
const qualityAllowedTools = [
  "read", "glob", "grep", "bash", "edit", "write", "apply_patch", "ask",
  "taskOutput", "taskStop", "browser", "desktop", "lsp", "web_fetch", "web_search",
  "todo", "task", "skill", "tool_search", "tool_load",
  "mcp__quality__echo_message", "ext_quality_extension_echo",
];

function qualityConfig(toolDiscovery) {
  return {
    offline: false,
    toolDiscovery,
    enableMcpTools: true,
    allowedTools: qualityAllowedTools,
    disabledTools: [],
    hiddenToolPrefixes: [],
    ...QUALITY_SAMPLING_POLICY,
  };
}

function parseArgs(argv) {
  const options = {
    corpus: defaultCorpus,
    tokenizer: defaultTokenizer,
    output: path.join(root, ".omx", "artifacts", "phase20-quality.json"),
    runs: undefined,
    ratings: undefined,
    resume: undefined,
    real: false,
    noTokenizer: false,
    validateFixtures: false,
    outputExplicit: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--corpus") options.corpus = argv[++index];
    else if (token === "--tokenizer") options.tokenizer = argv[++index];
    else if (token === "--output") {
      options.output = argv[++index];
      options.outputExplicit = true;
    }
    else if (token === "--runs") options.runs = Number(argv[++index]);
    else if (token === "--ratings") options.ratings = argv[++index];
    else if (token === "--resume") options.resume = argv[++index];
    else if (token === "--real") options.real = true;
    else if (token === "--no-tokenizer") options.noTokenizer = true;
    else if (token === "--validate-fixtures") options.validateFixtures = true;
    else if (token === "--json") options.json = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (options.help) return options;
  if (!options.corpus || !options.tokenizer || !options.output) {
    throw new Error("--corpus, --tokenizer and --output require values.");
  }
  if (options.runs !== undefined && (!Number.isSafeInteger(options.runs) || options.runs < 1 || options.runs > 100)) {
    throw new Error("--runs must be an integer from 1 to 100.");
  }
  if (options.resume && !options.ratings) throw new Error("--resume requires --ratings.");
  if (options.resume && (options.real || options.validateFixtures)) {
    throw new Error("--resume cannot be combined with --real or --validate-fixtures.");
  }
  return options;
}

function help() {
  return `Phase 20 quality evaluation

Usage:
  node scripts/qa-quality.mjs [--corpus file] [--tokenizer file] [--output file] [--runs n]
  node scripts/qa-quality.mjs --real --runs 5 [--ratings file] [--no-tokenizer]
  node scripts/qa-quality.mjs --resume run-directory --ratings file [--output file]
  node scripts/qa-quality.mjs --validate-fixtures

Without --real the command validates the corpus/build and writes an
inconclusive report. --real requires CHEERS_PHASE20_QUALITY=1,
CHEERS_REAL_HOME and a clean worktree. Blind ratings use
[raterA, raterB] per arm, or {raters, adjudication} on disagreement.
Tokenizer calibration uses paired first requests for English, Chinese,
code and mixed CJK/emoji samples unless --no-tokenizer is explicit.
--validate-fixtures runs each isolated task setup through the local /tools
command without a provider request.
--resume rebuilds a report from recorded arms and applies blind ratings without
spending another provider request. It verifies the run manifest before loading
recorded evidence. Both arms use temperature 0, topP 1 and 4096 output tokens.
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

function buildIdentity(verified, corpusFile, tokenizerFile) {
  const files = [
    path.join(root, "dist", "cli.js"),
    path.join(dist, "build-manifest.json"),
    path.join(root, verified.executable.path),
    verified.entry,
    fileURLToPath(import.meta.url),
    path.join(root, "scripts", "qa-quality-lib.mjs"),
    path.join(root, "scripts", "qa-quality-manifest.mjs"),
    corpusFile,
    tokenizerFile,
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
    if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
      throw new Error(`Fixture escaped its project: ${file.path}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
}

function boundedTarget(rootDirectory, relative, label) {
  const target = path.resolve(rootDirectory, relative);
  const rootPath = path.resolve(rootDirectory);
  if (target !== rootPath && !target.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`${label} escaped its isolated root.`);
  }
  return target;
}

function fixtureHome(task, home, project) {
  for (const file of task.homeFiles) {
    const target = boundedTarget(home, file.path, "Home fixture");
    const jsonText = value => JSON.stringify(value).slice(1, -1);
    const content = file.content
      .replaceAll("{{projectRoot}}", jsonText(project))
      .replaceAll("{{node}}", jsonText(process.execPath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  if (task.extension) fixtureExtension(task.extension, home, project);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readRatings(file) {
  if (!file) return { value: undefined, raw: null, sha256: null };
  const resolved = path.resolve(root, file);
  const raw = fs.readFileSync(resolved);
  if (raw.length > 4 * 1024 * 1024) throw new Error("The blind ratings file exceeds 4 MiB.");
  const digest = sha256(raw);
  let value;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("The blind ratings file is not valid JSON.");
  }
  return { value, raw, sha256: digest };
}

function ratingsEvidence(runRoot, binding) {
  if (!binding?.sha256) return null;
  return {
    file: path.relative(root, path.join(runRoot, `private/ratings-${binding.sha256}.json`))
      .split(path.sep).join("/"),
    sha256: binding.sha256,
  };
}

function writeTokenizerEvidence(runRoot, tokenizer) {
  const file = path.join(runRoot, "tokenizer.json");
  writeJson(file, tokenizer);
  return { file: "tokenizer.json", sha256: sha256(fs.readFileSync(file)) };
}

function readTokenizerEvidence(runRoot, evidence) {
  if (!evidence || evidence.file !== "tokenizer.json"
    || !/^[a-f0-9]{64}$/.test(evidence.sha256)) {
    throw new Error("The resumed run tokenizer binding is invalid.");
  }
  const file = path.join(runRoot, evidence.file);
  const raw = fs.readFileSync(file);
  if (sha256(raw) !== evidence.sha256) {
    throw new Error("The resumed run tokenizer evidence changed after recording.");
  }
  return readJson(file);
}

function validateRatings(ratings, corpus, runs) {
  if (ratings === undefined) return;
  for (const task of corpus.tasks.filter(task => task.scorer.kind === "blind-human")) {
    for (let repetition = 0; repetition < runs; repetition += 1) {
      for (const arm of ["full", "dynamic"]) {
        const value = ratings?.[`${task.id}:${repetition}`]?.[arm];
        let decoded;
        try {
          decoded = decodeBlindRating(value);
        } catch (error) {
          throw new Error(`Invalid blind rating ${task.id}:${repetition}:${arm}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!decoded.complete) {
          throw new Error(`Blind rating ${task.id}:${repetition}:${arm} is missing or unresolved.`);
        }
      }
    }
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function directoryIdentity(target) {
  const stat = fs.lstatSync(target, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Extension fixture storage is not a directory.");
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

function workspaceSignature(target) {
  const canonical = fs.realpathSync(target);
  return directoryIdentity(canonical);
}

function storageProof(selected) {
  const proof = [];
  let current = path.resolve(selected);
  while (true) {
    if (fs.existsSync(current)) proof.push({ path: current, identity: directoryIdentity(current) });
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (proof.at(-1)?.path !== path.parse(path.resolve(selected)).root) {
    throw new Error("Extension fixture storage ancestry is incomplete.");
  }
  return proof;
}

function fixtureExtension(extension, home, project) {
  const registry = path.join(home, ".cheers", "extensions", "registry.json");
  const packageRoot = path.join(path.dirname(registry), "packages");
  const source = { name: "quality-fixture", url: "https://quality.invalid/registry" };
  const sourceIdentity = sha256(canonicalJson(source));
  fs.mkdirSync(path.join(home, ".cheers"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(home, ".cheers", "marketplaces.json"), `${JSON.stringify([source])}\n`, { mode: 0o600 });
  const digest = sha256(`${extension.name}\0${extension.version}\0${extension.script}`);
  const installed = path.join(packageRoot, extension.name, digest);
  const manifest = {
    schema: 1,
    name: extension.name,
    version: extension.version,
    description: extension.description,
    permissions: { workspace: "read", network: "none" },
    skills: [],
    scripts: [{ name: "echo", path: "scripts/echo.sh" }],
    commands: [],
    tools: [{ name: "echo", description: extension.description, script: "echo" }],
  };
  fs.mkdirSync(path.join(installed, "scripts"), { recursive: true });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(installed, "extension.json"), manifestText, { mode: 0o600 });
  fs.writeFileSync(path.join(installed, "scripts", "echo.sh"), extension.script, { mode: 0o700 });
  const files = {
    "extension.json": sha256(manifestText),
    "scripts/echo.sh": sha256(extension.script),
  };
  const active = {
    manifest,
    digest,
    url: `fixture://${extension.name}/${extension.version}`,
    source: "quality-fixture",
    sourceIdentity,
    trustFingerprint: sha256("quality-extension-trust"),
    files,
    directories: ["scripts"],
    storage: storageProof(installed),
  };
  const state = {
    schema: 1,
    revision: 1,
    packages: [{
      name: extension.name,
      active,
      history: [],
      activation: {
        [fs.realpathSync(project)]: {
          workspaceIdentity: workspaceSignature(project),
          enabled: true,
          grants: ["script:echo", "tool:echo"],
        },
      },
    }],
    imports: [],
  };
  fs.mkdirSync(path.dirname(registry), { recursive: true, mode: 0o700 });
  fs.writeFileSync(registry, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
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
  fs.writeFileSync(config, `${JSON.stringify(qualityConfig("full"))}\n`, "utf8");
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

function singleRequestMeasurement(events, state) {
  const requests = Array.isArray(state?.usage?.recentRequests)
    ? state.usage.recentRequests.filter(entry => entry?.kind === "request"
      && Number.isFinite(entry.promptTokens) && entry.promptTokens >= 0)
    : [];
  if (requests.length !== 1) return { failure: "Tokenizer probe did not produce exactly one measured request." };
  const observation = projectQualityRun(events, state);
  if (observation.attributions.length !== 1) {
    return { failure: "Tokenizer probe did not report exactly one provider/model/endpoint attribution." };
  }
  return {
    promptTokens: requests[0].promptTokens,
    completionTokens: Number.isFinite(requests[0].completionTokens) ? requests[0].completionTokens : 0,
    cacheReadTokens: Number.isFinite(requests[0].cacheReadTokens) ? requests[0].cacheReadTokens : 0,
    cacheWriteTokens: Number.isFinite(requests[0].cacheWriteTokens) ? requests[0].cacheWriteTokens : 0,
    attribution: observation.attributions[0],
    observation,
  };
}

async function tokenizerPrompt(input) {
  const project = path.join(input.probeRoot, "project");
  const home = path.join(input.probeRoot, input.phase);
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
  const config = path.join(home, "quality-config.json");
  fs.writeFileSync(config, `${JSON.stringify(qualityConfig("full"))}\n`, "utf8");
  const result = await spawnCapture(process.execPath, [
    input.verified.entry,
    "--project", project,
    "--config", config,
    "--json",
    "--no-context-files",
    "--no-skills",
    "--non-interactive-approval", "deny",
    "--print",
    input.prompt,
  ], {
    cwd: project,
    env: environment(home, input.realHome, input.runRoot),
    timeoutMs: 240_000,
  });
  if (result.code !== 0) return { failure: `Tokenizer ${input.phase} request failed (${failureClass(result, result.error)}).` };
  let events;
  try {
    events = parseQualityEvents(result.stdout);
  } catch {
    return { failure: `Tokenizer ${input.phase} request emitted an invalid event stream.` };
  }
  const sessionPath = events.find(event => event.eventType === "query.started")?.facts?.sessionPath;
  const measured = singleRequestMeasurement(events, readSessionState(sessionPath, home));
  return measured.failure ? measured : {
    ...measured,
    outputSha256: sha256(events
      .filter(event => event.eventType === "turn.completed")
      .map(event => event.facts?.output?.content ?? "")
      .join("")),
  };
}

async function probeTokenizer(input) {
  const probeRoot = path.join(input.runRoot, "tokenizer");
  const samples = [];
  const limitations = [];
  for (const sample of input.corpus.samples) {
    const sampleRoot = path.join(probeRoot, sample.id);
    const baseline = await tokenizerPrompt({
      ...input,
      probeRoot: sampleRoot,
      phase: "baseline",
      prompt: `${tokenizerPrefix}\n`,
    });
    const measured = baseline.failure ? baseline : await tokenizerPrompt({
      ...input,
      probeRoot: sampleRoot,
      phase: "sample",
      prompt: `${tokenizerPrefix}\n${sample.text}`,
    });
    if (baseline.failure || measured.failure) {
      const failure = baseline.failure ?? measured.failure;
      limitations.push(`${sample.id}: ${failure}`);
      samples.push({ ...sample, status: "failed", failure });
      continue;
    }
    const providerDelta = measured.promptTokens - baseline.promptTokens;
    const estimated = estimateTokenCount(`\n${sample.text}`);
    if (!Number.isFinite(providerDelta) || providerDelta <= 0) {
      const failure = "Paired tokenizer requests did not produce a positive provider token delta.";
      limitations.push(`${sample.id}: ${failure}`);
      samples.push({ ...sample, status: "failed", failure });
      continue;
    }
    if (JSON.stringify(baseline.attribution) !== JSON.stringify(measured.attribution)) {
      const failure = "Paired tokenizer requests resolved to different provider/model/endpoint identities.";
      limitations.push(`${sample.id}: ${failure}`);
      samples.push({ ...sample, status: "failed", failure });
      continue;
    }
    samples.push({
      id: sample.id,
      language: sample.language,
      status: "measured",
      textSha256: sha256(sample.text),
      textCharacters: sample.text.length,
      estimated,
      measured: providerDelta,
      baselinePromptTokens: baseline.promptTokens,
      samplePromptTokens: measured.promptTokens,
      baselineOutputSha256: baseline.outputSha256,
      sampleOutputSha256: measured.outputSha256,
      attribution: measured.attribution,
      usage: {
        promptTokens: baseline.promptTokens + measured.promptTokens,
        completionTokens: baseline.completionTokens + measured.completionTokens,
        cacheReadTokens: baseline.cacheReadTokens + measured.cacheReadTokens,
        cacheWriteTokens: baseline.cacheWriteTokens + measured.cacheWriteTokens,
      },
      estimatedCostUsd: baseline.observation.estimatedCostUsd === null
        || measured.observation.estimatedCostUsd === null
        ? null : baseline.observation.estimatedCostUsd + measured.observation.estimatedCostUsd,
      costCoverage: baseline.observation.costCoverage === "complete"
        && measured.observation.costCoverage === "complete" ? "complete" : "partial",
    });
  }
  const summary = tokenizerError(samples);
  return {
    ...summary,
    status: limitations.length === 0 && summary.status === "measured" ? "measured" : "failed",
    corpusVersion: input.corpus.version,
    method: "paired-first-request-prompt-token-delta",
    estimateMethod: "characters-per-token",
    divisor: 3.5,
    samples,
    summary,
    limitations,
  };
}

function writeBlindReview(input, observation) {
  if (observation.finalText.length > 128 * 1024) {
    return { error: "Blind review output exceeds the 128 KiB review bound." };
  }
  const output = redactAndAssertCodingProviderOutput(observation.finalText);
  if (!output.ok) {
    return { error: `Blind review output failed redaction: ${output.leaks.join(", ")}.` };
  }
  const candidateId = randomUUID();
  const directory = path.join(input.runRoot, "blind-reviews", input.task.id, String(input.repetition));
  const file = path.join(directory, `${candidateId}.md`);
  const document = redactAndAssertCodingProviderOutput([
    `# Blind quality candidate ${candidateId}`,
    "",
    `Task: ${input.task.id}`,
    "",
    "## Prompt",
    "",
    input.task.prompt,
    "",
    "## Fixture",
    "",
    ...(input.task.fixture.length === 0 ? ["(no fixture files)"] : input.task.fixture.flatMap(fixture => [
      `### ${fixture.path}`,
      "",
      "```",
      fixture.content,
      "```",
      "",
    ])),
    "## Rubric",
    "",
    input.task.scorer.rubric,
    "",
    "## Candidate output",
    "",
    output.redacted,
    "",
  ].join("\n"));
  if (!document.ok) {
    return { error: `Blind review packet failed redaction: ${document.leaks.join(", ")}.` };
  }
  if (Buffer.byteLength(document.redacted, "utf8") > 256 * 1024) {
    return { error: "Blind review packet exceeds the 256 KiB review bound." };
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, document.redacted, { mode: 0o600 });
  const mapDirectory = path.join(input.runRoot, "private");
  fs.mkdirSync(mapDirectory, { recursive: true, mode: 0o700 });
  fs.appendFileSync(path.join(mapDirectory, "review-map.jsonl"), `${JSON.stringify({
    task: input.task.id,
    repetition: input.repetition,
    arm: input.arm,
    candidateId,
    file: path.relative(input.runRoot, file).split(path.sep).join("/"),
    candidateSha256: sha256(document.redacted),
    outputSha256: sha256(observation.finalText),
    outputCharacters: observation.finalText.length,
  })}\n`, { mode: 0o600 });
  return {
    candidateId,
    file: path.relative(root, file).split(path.sep).join("/"),
    candidateSha256: sha256(document.redacted),
    outputSha256: sha256(output.redacted),
    outputCharacters: output.redacted.length,
  };
}

async function runArm(input) {
  const armRoot = path.join(input.runRoot, "arms", input.task.id, String(input.repetition), input.arm);
  const project = path.join(armRoot, "project");
  const home = path.join(armRoot, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
  fixtureProject(input.task, project);
  fixtureHome(input.task, home, project);
  const before = projectSnapshot(project);
  const config = path.join(home, "quality-config.json");
  fs.writeFileSync(config, `${JSON.stringify(
    qualityConfig(input.arm === "dynamic" ? "dynamic" : "full"),
  )}\n`, "utf8");
  const baseArgs = [
    input.verified.entry,
    "--project", project,
    "--config", config,
    "--json",
    "--no-context-files",
    "--no-skills",
    "--non-interactive-approval", input.task.approval,
    ...input.task.args,
  ];
  const prompts = [input.task.prompt, ...input.task.followUps];
  let events = [];
  let parseError;
  let sessionId;
  let sessionPath;
  let latencyMs = 0;
  let lastResult;
  let failureResult;
  const stepEvidence = [];
  for (let index = 0; index < prompts.length; index += 1) {
    const args = [
      ...baseArgs,
      ...(index > 0 && sessionId ? ["--session-id", sessionId] : []),
      "--print",
      prompts[index],
    ];
    const started = performance.now();
    const result = await spawnCapture(process.execPath, args, {
      cwd: project,
      env: environment(home, input.realHome, input.runRoot),
      timeoutMs: input.timeoutMs,
    });
    latencyMs += performance.now() - started;
    lastResult = result;
    let stepEvents = [];
    if (result.stdout.trim()) {
      try {
        stepEvents = parseQualityEvents(result.stdout);
      } catch (error) {
        parseError = `Step ${index + 1}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const startedEvent = stepEvents.find(event => event.eventType === "query.started");
    const measuredSessionId = startedEvent?.facts?.sessionId;
    const measuredSessionPath = startedEvent?.facts?.sessionPath;
    if (result.code === 0 && typeof measuredSessionId !== "string") {
      parseError ??= `Step ${index + 1}: query.started did not report a session id.`;
    }
    if (typeof sessionId === "string" && measuredSessionId !== sessionId) {
      parseError ??= `Step ${index + 1}: resumed a different session.`;
    }
    sessionId ??= typeof measuredSessionId === "string" ? measuredSessionId : undefined;
    sessionPath = typeof measuredSessionPath === "string" ? measuredSessionPath : sessionPath;
    events.push(...stepEvents);
    stepEvidence.push({
      promptCharacters: prompts[index].length,
      exitCode: result.code,
      timedOut: result.timedOut,
      events: stepEvents.length,
      sessionId: typeof measuredSessionId === "string" ? measuredSessionId : null,
    });
    if (result.code !== 0 || parseError !== undefined) {
      failureResult = result;
      break;
    }
  }
  const result = failureResult ?? lastResult ?? {
    code: -1, signal: null, timedOut: false, stdout: "", stderr: "", error: "No quality step ran.",
  };
  const after = projectSnapshot(project);
  const observation = projectQualityRun(events, readSessionState(
    sessionPath,
    home,
  ));
  const blindReview = input.task.scorer.kind === "blind-human"
    ? writeBlindReview(input, observation) : undefined;
  if (blindReview?.error) parseError ??= blindReview.error;
  const readFile = relative => {
    const target = path.resolve(project, relative);
    if (!target.startsWith(`${path.resolve(project)}${path.sep}`)) throw new Error("Task file escaped its project.");
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Task file is not a regular project file.");
    return fs.readFileSync(target, "utf8");
  };
  const allStepsCompleted = stepEvidence.length === prompts.length
    && stepEvidence.every(step => step.exitCode === 0);
  const score = allStepsCompleted && parseError === undefined
    ? scoreQualityTask(input.task, observation, readFile)
    : { status: "failed", success: false, checks: [] };
  const policy = evaluatePolicy(input.task, before, after, observation.tools,
    parseError === undefined && events.length > 0);
  const required = input.task.scorer.kind === "deterministic"
    ? input.task.scorer.requiredTools ?? [] : [];
  const missedDiscovery = required.filter(tool => !observation.tools.includes(tool)).length;
  const attributions = observation.attributions;
  const raw = {
    arm: input.arm,
    task: input.task.id,
    repetition: input.repetition,
    exitCode: result.code,
    timedOut: result.timedOut,
    latencyMs,
    steps: stepEvidence,
    score,
    ...(parseError ? { scoringError: parseError } : {}),
    observation: reportSafeObservation(observation),
    policy,
    ...(blindReview && !blindReview.error ? { blindReview } : {}),
  };
  const rawFile = path.join(armRoot, "run.json");
  writeJson(rawFile, raw);
  return {
    arm: input.arm,
    status: allStepsCompleted ? score.status : "failed",
    success: score.success,
    checks: score.checks,
    failureClass: allStepsCompleted
      ? (parseError === undefined ? null : "scorer")
      : failureClass(result, result.error),
    latencyMs,
    inputTokens: observation.usage.promptTokens,
    outputTokens: observation.usage.completionTokens,
    cacheReadTokens: observation.usage.cacheReadTokens,
    cacheWriteTokens: observation.usage.cacheWriteTokens,
    discoveryRequests: observation.discoveryRequests,
    discoveryToolCalls: observation.discoveryCalls,
    discoveryInputTokens: observation.discoveryInputTokens,
    discoveryOutputTokens: observation.discoveryOutputTokens,
    discoveryAttribution: observation.discoveryAttribution,
    turns: observation.turns,
    toolCalls: observation.toolCalls,
    argumentErrors: observation.argumentErrors,
    missedDiscovery,
    successfulTools: observation.successfulTools,
    approvals: observation.approvals,
    cacheReported: observation.cacheReported,
    cacheHitRate: observation.cacheHitRate,
    estimatedCostUsd: observation.estimatedCostUsd,
    costCoverage: observation.costCoverage,
    unpricedTokens: observation.unpricedTokens,
    policyEvidence: policy.evidence,
    policyScope: "fixture-writes-and-forbidden-tools",
    policyViolations: policy.violations,
    unauthorizedWrites: policy.unauthorizedWrites,
    forbiddenTools: policy.forbiddenTools,
    rawFile: path.relative(root, rawFile).split(path.sep).join("/"),
    attribution: attributions[0] ?? null,
    attributions,
    ...(blindReview && !blindReview.error ? { blindReview } : {}),
  };
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
  const pair = {
    schemaVersion: "phase20-quality-pair.v1",
    pairId: `${input.task.id}:${input.repetition}`,
    task: input.task.id,
    repetition: input.repetition,
    stratum: input.task.stratum,
    blindHuman: input.task.scorer.kind === "blind-human",
    blindRatingsComplete: input.task.scorer.kind !== "blind-human",
    order,
    full: arms.full,
    dynamic: arms.dynamic,
    failureClass: arms.full.failureClass ?? arms.dynamic.failureClass ?? null,
  };
  applyBlindRatings(pair, input.ratings);
  const pairFile = path.join(input.runRoot, "pairs", input.task.id, `${input.repetition}.json`);
  writeJson(pairFile, pair);
  return pair;
}

function runtimeIdentity(pairs, protocol, tokenizer = null) {
  const arms = pairs.flatMap(pair => [pair.full, pair.dynamic]);
  const perArm = arms.map(arm => arm.attributions?.length
    ? arm.attributions
    : arm.attribution ? [arm.attribution] : []);
  const tokenizerAttributions = Array.isArray(tokenizer?.samples)
    ? tokenizer.samples.filter(sample => sample.status === "measured" && sample.attribution)
      .map(sample => sample.attribution)
    : [];
  const attributions = [...perArm.flat(), ...tokenizerAttributions];
  const targets = new Set(attributions.map(attribution =>
    JSON.stringify([attribution.provider, attribution.model, attribution.endpointId])));
  const attribution = arms.length > 0 && perArm.every(items => items.length > 0)
    && targets.size === 1
    ? attributions[0] : undefined;
  return attribution ? {
    provider: attribution.provider,
    protocol: protocol ?? null,
    endpoint: attribution.endpointId,
    model: attribution.model,
    temperature: QUALITY_SAMPLING_POLICY.temperature,
    maxOutputTokens: QUALITY_SAMPLING_POLICY.maxOutputTokens,
  } : { provider: null, protocol: protocol ?? null, endpoint: null, model: null, temperature: null, maxOutputTokens: null };
}

function pairFiles(directory) {
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return files.sort();
}

function loadPairs(runRoot) {
  const pairs = pairFiles(path.join(runRoot, "pairs")).map(file => readJson(file));
  const ids = new Set();
  for (const pair of pairs) {
    if (!pair || pair.schemaVersion !== "phase20-quality-pair.v1"
      || typeof pair.pairId !== "string" || ids.has(pair.pairId)
      || typeof pair.task !== "string" || !Number.isSafeInteger(pair.repetition)
      || typeof pair.blindHuman !== "boolean" || !Array.isArray(pair.order)
      || !pair.full || !pair.dynamic) {
      throw new Error("A recorded quality pair is invalid or duplicated.");
    }
    ids.add(pair.pairId);
  }
  return pairs;
}

async function resumeRun(options, corpus, tokenizerCorpus, verified, corpusFile, tokenizerFile) {
  const runRoot = path.resolve(root, options.resume);
  const manifestBefore = readRunManifest(runRoot);
  const metaFile = path.join(runRoot, "run-meta.json");
  if (!fs.existsSync(metaFile)) throw new Error("The resumed run has no run-meta.json.");
  const meta = readJson(metaFile);
  if (meta?.schemaVersion !== "phase20-quality-run.v1" || !meta.build || !meta.corpus
    || !Number.isSafeInteger(meta.expectedPairs) || !Number.isSafeInteger(meta.runs)) {
    throw new Error("The resumed run metadata is invalid.");
  }
  const build = buildIdentity(verified, corpusFile, tokenizerFile);
  if (JSON.stringify(build) !== JSON.stringify(meta.build)) {
    throw new Error("The resumed run was produced by different build, harness, corpus or tokenizer bytes.");
  }
  if (meta.corpus.version !== corpus.version || meta.corpus.tasks !== corpus.tasks.length
    || meta.corpus.repetitions !== meta.runs || meta.corpus.qualifying !== corpus.qualifying) {
    throw new Error("The resumed run corpus does not match the current corpus.");
  }
  const tokenizer = readTokenizerEvidence(runRoot, meta.tokenizerEvidence);
  const ratingsBinding = readRatings(options.ratings);
  const ratings = ratingsBinding.value;
  validateRatings(ratings, corpus, meta.runs);
  const ratingsPath = ratingsBinding.sha256 ? persistRatings(runRoot, ratingsBinding) : null;
  const manifestBinding = writeRunManifest(runRoot, {
    previous: manifestBefore,
    additionalPaths: ratingsPath ? [ratingsPath] : [],
  });
  const pairs = loadPairs(runRoot).map(pair => applyBlindRatings(pair, ratings));
  const tasks = new Map(corpus.tasks.map(task => [task.id, task]));
  const expectedPairIds = new Set(corpus.tasks.flatMap(task =>
    Array.from({ length: meta.runs }, (_, repetition) => `${task.id}:${repetition}`)));
  for (const pair of pairs) {
    const task = tasks.get(pair.task);
    if (!task || !expectedPairIds.delete(pair.pairId) || pair.repetition < 0 || pair.repetition >= meta.runs
      || pair.blindHuman !== (task.scorer.kind === "blind-human")
      || pair.full.arm !== "full" || pair.dynamic.arm !== "dynamic"
      || JSON.stringify([...pair.order].sort()) !== JSON.stringify(["dynamic", "full"])) {
      throw new Error(`Recorded pair ${pair.pairId} does not match the corpus or arm identity.`);
    }
  }
  if (expectedPairIds.size > 0) {
    throw new Error(`The resumed run is missing ${expectedPairIds.size} expected pair(s).`);
  }
  if (pairs.length !== meta.expectedPairs) {
    throw new Error(`The resumed run has ${pairs.length} pairs; ${meta.expectedPairs} were expected.`);
  }
  const limitations = reportLimitations({
    real: true,
    clean: meta.cleanAfterRun === true,
    pairs,
    minimumPairs: corpus.minimumPairs,
    corpus: { ...corpus, repetitions: meta.runs },
    runtime: meta.runtime,
    protocolFailure: meta.protocolFailure,
    tokenizer,
  });
  const blindPairs = pairs.filter(pair => pair.blindHuman);
  const blindComplete = blindPairs.every(pair => pair.blindRatingsComplete === true);
  const report = buildQualityReport({
    build,
    runtime: meta.runtime,
    runManifest: manifestReportBinding(manifestBinding, root),
    corpus: { ...meta.corpus, pairs: pairs.length },
    scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human",
      adjudication: blindPairs.length === 0 ? "not-required" : blindComplete ? "provided" : "incomplete" },
    ratings: ratingsEvidence(runRoot, ratingsBinding),
    pairs,
    expectedPairs: meta.expectedPairs,
    tokenizer,
    limitations: limitations.limitations,
    qualityLimitations: limitations.qualityLimitations,
    toolLimitations: limitations.toolLimitations,
  });
  const output = options.outputExplicit
    ? path.resolve(root, options.output)
    : path.join(runRoot, "report.json");
  writeJson(output, report);
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "complete" ? 0 : 1;
}

function reportLimitations(input) {
  const { real, clean, pairs, minimumPairs, corpus, runtime, protocolFailure, tokenizer } = input;
  const quality = [];
  const tools = [];
  if (!real) quality.push("Real provider execution was not requested; this report is not a quality result.");
  if (real && !clean) quality.push("The repository was not clean after execution; the quality result is not accepted.");
  if (pairs.some(pair => pair.full.status === "pending-human" || pair.dynamic.status === "pending-human")) {
    quality.push("Blind-human ratings are incomplete; subjective tasks remain inconclusive.");
  }
  if (pairs.some(pair => pair.full.discoveryAttribution !== "measured"
    || pair.dynamic.discoveryAttribution !== "measured")) {
    tools.push("Discovery-specific input/output token attribution is not available from the current session usage snapshot.");
  }
  if (pairs.some(pair => pair.dynamic.discoveryToolCalls > 0 && pair.dynamic.discoveryRequests === 0)) {
    tools.push("At least one dynamic arm used discovery tools without a measured discovery-purpose provider request.");
  }
  if (pairs.length < minimumPairs) quality.push(`Only ${pairs.length} pairs were completed; at least ${minimumPairs} are required.`);
  if (Number.isSafeInteger(corpus.repetitions) && corpus.repetitions < minimumPairs) {
    quality.push(`Each task ran ${corpus.repetitions} times; at least ${minimumPairs} independent repetitions are required.`);
  }
  if (real && !corpus.qualifying) {
    quality.push("The corpus is a starter set, not the preregistered qualifying quality task set.");
  }
  if (real && (!runtime.provider?.trim() || !runtime.model?.trim()
    || !runtime.protocol?.trim() || !runtime.endpoint?.trim())) {
    quality.push("Provider, model, protocol and endpoint identity were not all measured for every arm.");
  }
  if (real && (!Number.isFinite(runtime.temperature)
    || !Number.isSafeInteger(runtime.maxOutputTokens) || runtime.maxOutputTokens <= 0)) {
    quality.push("Fixed sampling temperature and maximum output tokens were not recorded.");
  }
  if (real && protocolFailure) quality.push(protocolFailure);
  if (real && pairs.some(pair => pair.full.policyEvidence !== "measured"
    || pair.dynamic.policyEvidence !== "measured")) {
    quality.push("Policy evidence is incomplete; at least one arm lacks a parsed event stream for tool-policy checks.");
  }
  if (real && pairs.some(pair => pair.failureClass !== null)) {
    quality.push("At least one arm failed outside the scored task; the batch is not a complete quality result.");
  }
  if (real && pairs.some(pair => pair.full.costCoverage !== "complete"
    || pair.dynamic.costCoverage !== "complete")) {
    tools.push("At least one arm lacks captured prices for all recorded token categories.");
  }
  if (real && pairs.some(pair => pair.full.cacheReported !== true
    || pair.dynamic.cacheReported !== true)) {
    tools.push("At least one arm did not report whether provider cache accounting was available.");
  }
  if (real && tokenizer?.status !== "measured") {
    tools.push("Multilingual tokenizer calibration is incomplete or failed.");
  }
  return { limitations: [...quality, ...tools], qualityLimitations: quality, toolLimitations: tools };
}

async function validateFixtures(corpus, verified, output) {
  const rootPath = path.join(path.dirname(path.resolve(root, output)), "fixture-validation",
    new Date().toISOString().replace(/[:.]/g, "-"));
  const tasks = [];
  for (const task of corpus.tasks) {
    const taskRoot = path.join(rootPath, task.id);
    const project = path.join(taskRoot, "project");
    const home = path.join(taskRoot, "home");
    fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
    fixtureProject(task, project);
    fixtureHome(task, home, project);
    const config = path.join(home, "quality-config.json");
    fs.writeFileSync(config, `${JSON.stringify(qualityConfig("full"))}\n`, "utf8");
    const result = await spawnCapture(process.execPath, [
      verified.entry,
      "--project", project,
      "--config", config,
      "--json",
      "--no-context-files",
      "--no-skills",
      "--non-interactive-approval", task.approval,
      "--print",
      "/tools",
    ], {
      cwd: project,
      env: environment(home, home, rootPath),
      timeoutMs: 60_000,
    });
    let failure;
    let available = [];
    if (result.code !== 0) {
      failure = `/tools exited ${result.code} (${failureClass(result, result.error)}).`;
    } else {
      try {
        const events = parseQualityEvents(result.stdout);
        const report = events
          .filter(event => event.eventType === "cli.output")
          .map(event => event.facts?.report)
          .find(value => Array.isArray(value?.facts?.tools));
        available = Array.isArray(report?.facts?.tools)
          ? report.facts.tools.map(tool => tool?.name).filter(name => typeof name === "string")
          : [];
        if (available.length === 0) failure = "/tools did not publish a structured tool list.";
      } catch {
        failure = "/tools emitted an invalid event stream.";
      }
    }
    const scorer = task.scorer.kind === "deterministic" ? task.scorer : {};
    const required = scorer.requiredTools ?? [];
    const successful = scorer.successfulTools ?? [];
    const groups = scorer.toolsAnyOf ?? [];
    const missing = [...new Set([...required, ...successful])].filter(name => !available.includes(name));
    const missingGroups = groups.filter(group => !group.some(name => available.includes(name)));
    if (missing.length > 0) failure = `Required tools are absent from the full pool: ${missing.join(", ")}.`;
    if (missingGroups.length > 0) {
      failure = `Tool alternatives are absent from the full pool: ${missingGroups.map(group => group.join("|")).join(", ")}.`;
    }
    tasks.push({
      id: task.id,
      status: failure ? "failed" : "pass",
      available: available.length,
      required,
      successful,
      toolAlternatives: groups,
      missing,
      missingToolAlternatives: missingGroups,
      ...(failure ? { failure } : {}),
    });
  }
  const report = {
    schemaVersion: "phase20-quality-fixtures.v1",
    status: tasks.every(task => task.status === "pass") ? "pass" : "failed",
    tasks,
  };
  writeJson(path.resolve(root, output), report);
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }
  const corpusFile = path.resolve(root, options.corpus);
  const corpus = decodeQualityCorpus(readJson(corpusFile));
  const tokenizerFile = path.resolve(root, options.tokenizer);
  const tokenizerCorpus = decodeTokenizerCorpus(readJson(tokenizerFile));
  const pkg = readJson(path.join(root, "packages/ts-shell/package.json"));
  const verified = checkBuild({ root, dist, version: pkg.version, executablePolicy: "required" });
  if (!verified.ok) throw new Error(`A verified build is required: ${verified.reason}`);
  if (options.resume) {
    return resumeRun(options, corpus, tokenizerCorpus, verified, corpusFile, tokenizerFile);
  }
  if (options.validateFixtures) {
    return validateFixtures(corpus, verified, options.output);
  }
  const build = buildIdentity(verified, corpusFile, tokenizerFile);
  const clean = repositoryClean();
  const realHome = process.env.CHEERS_REAL_HOME?.trim();
  const optIn = process.env.CHEERS_PHASE20_QUALITY?.trim() === "1";
  const runs = options.runs ?? corpus.minimumPairs;
  const real = options.real;
  const tokenizerNotRun = {
    status: "not-measured",
    corpusVersion: tokenizerCorpus.version,
    samples: tokenizerCorpus.samples.map(sample => ({
      id: sample.id,
      language: sample.language,
      textSha256: sha256(sample.text),
      textCharacters: sample.text.length,
      status: "not-run",
    })),
    byLanguage: {},
    unknown: true,
    note: "Tokenizer calibration was not run.",
  };
  if (real && (!optIn || !realHome || !fs.existsSync(realHome) || !clean)) {
    const report = buildQualityReport({
      build,
      runtime: runtimeIdentity([], null),
      corpus: { version: corpus.version, qualifying: corpus.qualifying, minimumPairs: corpus.minimumPairs,
        pairs: 0, tasks: corpus.tasks.length, repetitions: runs },
      scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human", adjudication: "not-run" },
      ratings: null,
      pairs: [],
      expectedPairs: corpus.tasks.length * runs,
      tokenizer: tokenizerNotRun,
      limitations: [
        !optIn ? "CHEERS_PHASE20_QUALITY=1 is required for real execution." : "",
        !realHome ? "CHEERS_REAL_HOME is required for real execution." : "",
        realHome && !fs.existsSync(realHome) ? "CHEERS_REAL_HOME does not exist." : "",
        !clean ? "The repository must be clean before real execution." : "",
        "Real quality execution and tokenizer calibration were not started.",
      ].filter(Boolean),
    });
    writeJson(path.resolve(root, options.output), report);
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 2;
  }
  if (!real) {
    const limitations = reportLimitations({
      real: false,
      clean,
      pairs: [],
      minimumPairs: corpus.minimumPairs,
      corpus,
      runtime: runtimeIdentity([], null),
      protocolFailure: null,
      tokenizer: tokenizerNotRun,
    });
    const report = buildQualityReport({
      build,
      runtime: runtimeIdentity([], null),
      corpus: { version: corpus.version, qualifying: corpus.qualifying, minimumPairs: corpus.minimumPairs,
        pairs: 0, tasks: corpus.tasks.length, repetitions: runs },
      scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human", adjudication: "not-run" },
      ratings: null,
      pairs: [],
      expectedPairs: corpus.tasks.length * runs,
      tokenizer: tokenizerNotRun,
      limitations: limitations.limitations,
      qualityLimitations: limitations.qualityLimitations,
      toolLimitations: limitations.toolLimitations,
    });
    writeJson(path.resolve(root, options.output), report);
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 2;
  }
  const runRoot = path.join(path.dirname(path.resolve(root, options.output)), "quality-runs",
    new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(runRoot, { recursive: true });
  const ratingsBinding = readRatings(options.ratings);
  const ratings = ratingsBinding.value;
  validateRatings(ratings, corpus, runs);
  const ratingsPath = ratingsBinding.sha256 ? persistRatings(runRoot, ratingsBinding) : null;
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
  const tokenizer = options.noTokenizer ? tokenizerNotRun : await probeTokenizer({
    corpus: tokenizerCorpus,
    runRoot,
    realHome,
    verified,
  });
  const tokenizerEvidence = writeTokenizerEvidence(runRoot, tokenizer);
  const runtime = runtimeIdentity(pairs, protocolProbe.protocol, options.noTokenizer ? null : tokenizer);
  const blindPairs = pairs.filter(pair => pair.blindHuman);
  const blindComplete = blindPairs.every(pair => pair.blindRatingsComplete === true);
  const limitations = reportLimitations({
    real: true,
    clean: afterClean,
    pairs,
    minimumPairs: corpus.minimumPairs,
    corpus,
    runtime,
    protocolFailure: protocolProbe.failure,
    tokenizer,
  });
  writeJson(path.join(runRoot, "run-meta.json"), {
    schemaVersion: "phase20-quality-run.v1",
    build,
    corpus: {
      version: corpus.version,
      qualifying: corpus.qualifying,
      minimumPairs: corpus.minimumPairs,
      pairs: pairs.length,
      tasks: corpus.tasks.length,
      repetitions: runs,
    },
    expectedPairs: corpus.tasks.length * runs,
    runs,
    cleanAfterRun: afterClean,
    runtime,
    protocolFailure: protocolProbe.failure,
    tokenizerEvidence,
  });
  const manifestBinding = writeRunManifest(runRoot, {
    additionalPaths: ratingsPath ? [ratingsPath] : [],
  });
  const report = buildQualityReport({
    build,
    runtime,
    runManifest: manifestReportBinding(manifestBinding, root),
    corpus: { version: corpus.version, qualifying: corpus.qualifying, minimumPairs: corpus.minimumPairs, pairs: pairs.length,
      tasks: corpus.tasks.length, repetitions: runs },
    scorer: { version: "phase20-qa03-v1", kind: "deterministic|blind-human",
      adjudication: blindPairs.length === 0 ? "not-required" : blindComplete ? "provided" : "incomplete" },
    ratings: ratingsEvidence(runRoot, ratingsBinding),
    pairs,
    expectedPairs: corpus.tasks.length * runs,
    tokenizer,
    limitations: limitations.limitations,
    qualityLimitations: limitations.qualityLimitations,
    toolLimitations: limitations.toolLimitations,
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
