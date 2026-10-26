#!/usr/bin/env node
/**
 * Interactive startup benchmark for both shipped launch forms.
 *
 * Each sample is a fresh, isolated process. Linux terminal modes use the
 * installed `script` utility to allocate a real PTY; line mode is a live
 * non-TTY stream, and pipe mode is the print-batch surface. The report keeps
 * first byte, first frame, input announcement, rendered-key response, exit, startup
 * marks, and child event-loop delay as separate measurements.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { cacheEvidence, createCacheController } from "./bench/cache.mjs";
import { createQaPtyEnvironment } from "./qa-pty-env.mjs";
import { renderedKeyAfter, StartupObservation, terminalStartupTimes } from "./bench/observation.mjs";
import { processSettlement } from "./bench/process.mjs";
import { checkBuild } from "./start-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = createCacheController();
const runs = Number(process.env.BENCH_RUNS ?? 30);
if (!Number.isSafeInteger(runs) || runs < 2) {
  console.error("BENCH_RUNS must be an integer of at least 2");
  process.exit(2);
}
const selectedModes = process.env.BENCH_MODES?.split(",").map(value => value.trim()).filter(Boolean)
  ?? ["regular", "fullscreen", "line", "pipe"];
const modes = new Set(["regular", "fullscreen", "line", "pipe"]);
if (selectedModes.length === 0) {
  console.error("BENCH_MODES must select at least one mode");
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "packages/ts-shell/package.json"), "utf8"));
const verified = checkBuild({ root, dist: path.join(root, "packages/ts-shell/dist"),
  version: pkg.version, executablePolicy: "required" });
if (!verified.ok) {
  console.error(`Build first: ${verified.reason}`);
  process.exit(2);
}
const manifest = verified.manifest;
const executable = path.join(root, verified.executable.path);
const dist = path.join(root, "packages/ts-shell/dist");
const minimumRuns = 30;
const targets = [
  { name: "node", command: process.execPath, args: [path.join(root, "dist/cli.js")] },
  { name: "exe", command: executable, args: [] },
];
if (selectedModes.some(mode => !modes.has(mode))) {
  console.error(`Unknown BENCH_MODES entry: ${selectedModes.join(", ")}`);
  process.exit(2);
}

const executableDigest = createHash("sha256").update(fs.readFileSync(executable)).digest("hex");
const evidenceFiles = [path.join(root, "dist", "cli.js"),
  path.join(dist, "build-manifest.json"), executable, verified.entry,
  fileURLToPath(import.meta.url), path.join(root, "scripts", "bench", "cache.mjs"),
  path.join(root, "scripts", "bench", "observation.mjs"),
  path.join(root, "scripts", "bench", "process.mjs"),
  path.join(root, "scripts", "qa-pty-env.mjs"),
  ...manifest.artifacts.map(artifact => path.join(dist, artifact.path))];
const evidenceDigest = () => evidenceFiles.map(file => createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
const evidenceBefore = evidenceDigest();
const measurementSha256 = createHash("sha256").update(JSON.stringify(evidenceBefore)).digest("hex");

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function waitFor(read, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      try {
        if (predicate(read())) return resolve();
        if (performance.now() - started >= timeoutMs) return reject(new Error(`timed out waiting for ${label}`));
        setTimeout(tick, 25);
      } catch (error) { reject(error); }
    };
    tick();
  });
}

function createFixture(mode) {
  const scratch = path.join(root, ".tmp", "bench-interactive");
  fs.mkdirSync(scratch, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(scratch, "sample-"));
  const home = path.join(fixture, "home"), project = path.join(fixture, "project");
  fs.mkdirSync(project);
  fs.mkdirSync(path.join(project, ".git"));
  fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cheers", "config.json"), JSON.stringify({
    tuiMode: mode === "fullscreen" ? "fullscreen" : "regular",
  }));
  return { home, project, fixture };
}

function benchEnvironment(home, project, timingPath) {
  return {
    ...createQaPtyEnvironment(home, project),
    CHEERS_TIMING: "1",
    CHEERS_TIMING_PATH: timingPath,
  };
}

function startProcess(target, mode, home, project, timingPath) {
  const env = benchEnvironment(home, project, timingPath);
  const terminal = mode === "regular" || mode === "fullscreen";
  if (terminal) {
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const command = `stty rows 60 cols 120; exec ${[target.command, ...target.args].map(quote).join(" ")}`;
    return spawn("script", ["-E", "never", "-qec", command, "/dev/null"], { cwd: project, env });
  }
  const args = mode === "pipe" ? [...target.args, "--print"] : target.args;
  return spawn(target.command, args, { cwd: project, env });
}

async function sample(target, mode) {
  const { home, project, fixture } = createFixture(mode);
  const timingPath = path.join(home, "timing.json");
  let lifetime, observationError;
  const state = new StartupObservation(mode);
  try {
    const cachePreparation = cache.prepare();
    const started = performance.now();
    const child = startProcess(target, mode, home, project, timingPath);
    lifetime = processSettlement(child);
    const terminal = mode === "regular" || mode === "fullscreen";
    const onData = stream => chunk => {
      if (observationError) return;
      try { state.feed(stream, chunk, performance.now() - started); }
      catch (error) { observationError = error; child.kill("SIGTERM"); }
    };
    child.stdout.on("data", onData("stdout"));
    child.stderr.on("data", onData("stderr"));
    if (mode === "pipe") child.stdin.end("hello\n/exit\n");

    if (mode === "pipe") {
      const ended = await lifetime.wait();
      if (ended.launchError) throw ended.launchError;
      if (ended.code !== 0 || ended.signal || ended.interrupted) throw new Error(`process exited ${ended.code}, signal ${ended.signal}, interrupted ${ended.interrupted}`);
      state.exitAt = performance.now() - started;
    } else {
      await waitFor(() => {
        if (observationError) throw observationError;
        lifetime.assertRunning();
        return state.inputAnnouncementAt;
      }, value => value !== undefined, 15_000, "input announcement");

      if (terminal) {
        state.keyResponseMs = await renderedKeyAfter(child.stdout, () => child.stdin.write("Ω"), "Ω");
        child.stdin.write("\x15");
      }
      const exitStarted = performance.now();
      child.stdin.write(mode === "line" ? "/exit\n" : "/exit\r");
      const ended = await lifetime.wait();
      if (ended.launchError) throw ended.launchError;
      if (ended.code !== 0 || ended.signal || ended.interrupted) throw new Error(`process exited ${ended.code}, signal ${ended.signal}, interrupted ${ended.interrupted}`);
      state.exitAt = performance.now() - started;
      state.commandToExitMs = performance.now() - exitStarted;
    }
    if (observationError) throw observationError;
    await waitFor(() => fs.existsSync(timingPath), value => value, 2_000, "timing snapshot");
    const timing = JSON.parse(fs.readFileSync(timingPath, "utf8"));
    if (!timing.enabled || !timing.marks?.length) throw new Error("timing snapshot contains no startup marks");
    const processTimes = terminal ? terminalStartupTimes(timing.marks) : {};
    if (mode === "pipe" && state.firstReplyAt === undefined) throw new Error("pipe produced no synthetic reply");
    if (terminal && (state.firstFrameAt === undefined || state.firstFrameAt > state.inputAnnouncementAt)) {
      throw new Error("terminal benchmark did not observe the early editor before runtime input");
    }
    return {
      mode,
      target: target.name,
      firstByteMs: round(state.firstByteAt),
      firstFrameMs: round(state.firstFrameAt),
      inputAnnouncementMs: round(state.inputAnnouncementAt),
      runtimeReadyProcessMs: round(timing.marks.find(mark => mark.label === "runtime ready")?.elapsedMs),
      ...Object.fromEntries(Object.entries(processTimes).map(([key, value]) => [key, round(value)])),
      firstReplyMs: round(state.firstReplyAt),
      keyResponseMs: round(state.keyResponseMs),
      commandToExitMs: round(state.commandToExitMs),
      exitMs: round(state.exitAt),
      eventLoop: timing?.eventLoop,
      startupMarks: timing?.marks ?? [],
      cachePreparation,
    };
  } catch (error) {
    fs.mkdirSync(path.join(root, ".omx", "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, ".omx", "artifacts", `bench-failure-${target.name}-${mode}.txt`), state.output, "utf8");
    throw new Error(`${target.name}/${mode}: ${error.message}`, { cause: error });
  } finally {
    await lifetime?.stop();
    fs.rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function round(value) {
  return value === undefined ? null : Number(value.toFixed(1));
}

function summarize(samples) {
  const pick = key => samples.map(sample => sample[key]).filter(value => typeof value === "number");
  const metrics = {};
  for (const key of ["firstByteMs", "firstFrameMs", "inputAnnouncementMs", "runtimeReadyProcessMs", "inputListenerReadyProcessMs",
    "firstFrameLayoutProcessMs", "firstFrameWriteProcessMs", "runtimeInputAdoptedProcessMs", "runtimeFrameWriteProcessMs",
    "firstReplyMs", "keyResponseMs", "commandToExitMs", "exitMs"]) {
    const values = pick(key).sort((left, right) => left - right);
    metrics[key] = values.length === 0 ? null : {
      count: values.length,
      p50: round(percentile(values, 50)),
      p95: round(percentile(values, 95)),
      min: round(values[0]),
      max: round(values[values.length - 1]),
      uncertainty: {
        p50: bootstrapInterval(values, 50),
        p95: bootstrapInterval(values, 95),
      },
    };
  }
  return metrics;
}

/** Deterministic bootstrap interval; repeated benchmark runs remain comparable. */
function bootstrapInterval(values, quantile, iterations = 1000) {
  if (values.length < 2) return null;
  const sorted = [...values].sort((left, right) => left - right);
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const resampled = Array.from({ length: sorted.length }, () => sorted[Math.floor(random() * sorted.length)])
      .sort((left, right) => left - right);
    estimates.push(percentile(resampled, quantile));
  }
  estimates.sort((left, right) => left - right);
  return { low: round(percentile(estimates, 2.5)), high: round(percentile(estimates, 97.5)) };
}

const report = [];
const cachePreparations = [];
for (const target of targets) {
  for (const mode of selectedModes) {
    const samples = [];
    for (let index = 0; index < runs; index += 1) {
      samples.push(await sample(target, mode));
      process.stderr.write(`benchmark ${target.name}/${mode}: ${index + 1}/${runs} settled\n`);
    }
    cachePreparations.push(...samples.map(sample => sample.cachePreparation));
    report.push({ target: target.name, mode, runs, samples, summary: summarize(samples) });
  }
}

if (JSON.stringify(evidenceDigest()) !== JSON.stringify(evidenceBefore)) {
  throw new Error("Build or benchmark inputs changed during measurement; samples cannot bind to one build");
}

const output = {
  build: {
    buildId: manifest.buildId,
    inputsDigest: manifest.inputsDigest,
    artifactDigest: manifest.artifactDigest,
    executableSha256: executableDigest,
    measurementSha256,
  },
  fixture: {
    platform: process.platform,
    node: process.version,
    cpu: os.cpus()[0]?.model,
    architecture: process.arch,
    kernel: os.release(),
    rows: 60,
    columns: 120,
    runs,
    qualifying: runs >= minimumRuns,
    cacheControl: cache.control,
    cacheEvidence: cacheEvidence(cache.control, cachePreparations,
      runs * targets.length * selectedModes.length),
    minimumRuns,
    modes: selectedModes,
    note: "One fresh isolated process per sample with an empty session store; each target is closed and fixture removed before the next sample. global-cold runs sync and drop_caches immediately before every sample; warm-uncontrolled supplies no cold-cache claim. Parent observations include launcher/PTY transport. Terminal firstFrameMs observes the actual Loading editor and status; inputAnnouncementMs observes the later runtime placeholder. Stream receipt is not a terminal pixel acknowledgement. Process-local marks separately bind early listener/layout/write, runtime construction, input adoption and runtime write; their clock origin differs from parent observations. Pipe has a reply, no interactive frame or per-key metric. Key response waits for Ω in application output with PTY echo disabled. Event-loop samples cover the instrumented process lifetime and can miss work before the first observation cycle; Node and compiled runtime histograms are not assumed equivalent. Complex-stream blocking and 1000-item list response are not measured here.",
  },
  report,
};
const target = process.env.BENCH_OUTPUT?.trim();
if (target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
