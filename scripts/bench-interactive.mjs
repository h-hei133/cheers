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
import { renderedKeyAfter } from "./bench/observation.mjs";
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
  path.join(root, "scripts", "qa-pty-env.mjs"),
  ...manifest.artifacts.map(artifact => path.join(dist, artifact.path))];
const evidenceDigest = () => evidenceFiles.map(file => createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
const evidenceBefore = evidenceDigest();
const measurementSha256 = createHash("sha256").update(JSON.stringify(evidenceBefore)).digest("hex");
const plain = value => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const normalized = value => plain(value)
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
  .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");

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

function waitForExit(child, timeoutMs) {
  if (child.measurementError) return Promise.reject(child.measurementError);
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const onError = error => { clearTimeout(timer); reject(error); };
    const timer = setTimeout(() => { child.off("error", onError); reject(new Error("process did not exit")); }, timeoutMs);
    child.once("error", onError);
    child.once("exit", code => {
      clearTimeout(timer);
      child.off("error", onError);
      resolve(code);
    });
  });
}

function createFixture(mode) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "bench-interactive-home-"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "bench-interactive-project-"));
  fs.mkdirSync(path.join(project, ".git"));
  fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cheers", "config.json"), JSON.stringify({
    tuiMode: mode === "fullscreen" ? "fullscreen" : "regular",
  }));
  return { home, project };
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
  const { home, project } = createFixture(mode);
  const timingPath = path.join(home, "timing.json");
  const cachePreparation = cache.prepare();
  const started = performance.now();
  const child = startProcess(target, mode, home, project, timingPath);
  child.on("error", error => { child.measurementError = error; });
  const state = { output: "", firstByteAt: undefined, firstFrameAt: undefined, inputAnnouncementAt: undefined,
    keyResponseMs: undefined, exitAt: undefined };
  const hardTimeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try {
    if (mode === "pipe") child.stdin.end("hello\n/exit\n");
    const frameMarker = mode === "pipe" ? undefined : mode === "line" ? "Cheers Shell" : "openai";
    const announcement = mode === "line" ? "waiting for newline-delimited prompts."
      : mode === "pipe" ? undefined : "Ask anything, or / for commands";
    const onData = chunk => {
      const at = performance.now() - started;
      if (state.firstByteAt === undefined) state.firstByteAt = at;
      state.output += chunk.toString("utf8");
      const output = normalized(state.output);
      if (frameMarker && state.firstFrameAt === undefined && output.includes(frameMarker)) state.firstFrameAt = at;
      if (announcement && state.inputAnnouncementAt === undefined && output.includes(announcement)) state.inputAnnouncementAt = at;
      if (state.firstReplyAt === undefined && output.includes("Synthetic reply:")) state.firstReplyAt = at;
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    if (mode === "pipe") {
      const code = await waitForExit(child, 20_000);
      if (code !== 0) throw new Error(`process exited ${code}`);
      state.exitAt = performance.now() - started;
    } else {
      await waitFor(() => {
        if (child.measurementError) throw child.measurementError;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`process ended before input announcement (exit ${child.exitCode}, signal ${child.signalCode})`);
        return state.inputAnnouncementAt;
      }, value => value !== undefined, 15_000, "input announcement");

      if (mode === "regular" || mode === "fullscreen") {
        state.keyResponseMs = await renderedKeyAfter(child.stdout, () => child.stdin.write("Ω"), "Ω");
        child.stdin.write("\x15");
      }
      const exitStarted = performance.now();
      child.stdin.write(mode === "line" ? "/exit\n" : "/exit\r");
      const code = await waitForExit(child, 20_000);
      if (code !== 0) throw new Error(`process exited ${code}`);
      state.exitAt = performance.now() - started;
      state.commandToExitMs = performance.now() - exitStarted;
    }
    await waitFor(() => fs.existsSync(timingPath), value => value, 2_000, "timing snapshot");
    const timing = JSON.parse(fs.readFileSync(timingPath, "utf8"));
    if (!timing.enabled || !timing.marks?.length) throw new Error("timing snapshot contains no startup marks");
    if ((mode === "regular" || mode === "fullscreen")
      && ["runtime ready", "input listener ready", "first frame layout", "first frame write completed"]
        .some(label => !timing.marks.some(mark => mark.label === label))) {
      throw new Error("terminal timing snapshot is missing observer marks");
    }
    if (mode === "pipe" && state.firstReplyAt === undefined) throw new Error("pipe produced no synthetic reply");
    if ((mode === "regular" || mode === "fullscreen") && state.firstFrameAt === undefined) {
      throw new Error("terminal benchmark did not observe the first frame");
    }
    return {
      mode,
      target: target.name,
      firstByteMs: round(state.firstByteAt),
      firstFrameMs: round(state.firstFrameAt),
      inputAnnouncementMs: round(state.inputAnnouncementAt),
      runtimeReadyProcessMs: round(timing.marks.find(mark => mark.label === "runtime ready")?.elapsedMs),
      inputListenerReadyProcessMs: round(timing.marks.find(mark => mark.label === "input listener ready")?.elapsedMs),
      firstFrameWriteProcessMs: round(timing.marks.find(mark => mark.label === "first frame write completed")?.elapsedMs),
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
    clearTimeout(hardTimeout);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, 2_000).catch(() => undefined);
    }
    for (const targetPath of [home, project]) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // A killed launcher can outlive one cleanup attempt; this sample is already isolated.
      }
    }
  }
}

function round(value) {
  return value === undefined ? null : Number(value.toFixed(1));
}

function summarize(samples) {
  const pick = key => samples.map(sample => sample[key]).filter(value => typeof value === "number");
  const metrics = {};
  for (const key of ["firstByteMs", "firstFrameMs", "inputAnnouncementMs", "runtimeReadyProcessMs", "inputListenerReadyProcessMs", "firstFrameWriteProcessMs", "firstReplyMs", "keyResponseMs", "commandToExitMs", "exitMs"]) {
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
    for (let index = 0; index < runs; index += 1) samples.push(await sample(target, mode));
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
    note: "One fresh isolated process per sample with an empty session store. global-cold runs sync and drop_caches immediately before every sample. Parent observations include launcher/PTY transport. First frame and input announcement are separate parent-observed events; runtime-ready is a process-local mark after session-runtime construction. Process marks use a different clock origin. Pipe has a reply, no interactive frame or per-key metric. Key response waits for Ω in application output with PTY echo disabled. Event-loop samples cover the instrumented process lifetime and can miss work before the first observation cycle; Node and compiled runtime histograms are not assumed equivalent. Complex-stream blocking and 1000-item list response are not measured here.",
  },
  report,
};
const target = process.env.BENCH_OUTPUT?.trim();
if (target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
