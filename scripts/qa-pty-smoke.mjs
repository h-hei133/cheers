#!/usr/bin/env node
/**
 * Linux/macOS terminal and cross-platform line/pipe CLI smoke for both shipped
 * launch forms; Windows is intentionally limited to line-stream and print-batch.
 *
 * The harness is synthetic and isolated. It proves platform CLI/PTY wiring and
 * business chains; Windows interactive terminal, IME, system-copy, and real-model
 * quality remain outside this matrix.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createQaPtyEnvironment } from "./qa-pty-env.mjs";
import { seedRecoverySession, seedSavedSession, extractSessionId, currentSessionFromStore, assertTranscript } from "./qa/session.mjs";
import { seedRestoreSnapshot, assertRestoreUnchanged, runRestorePreview } from './qa/restore.mjs';
import { terminalSpawnSpec } from './qa/terminal.mjs';
import { checkBuild } from './start-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "packages", "ts-shell", "package.json"), "utf8"));
const requestedTarget = process.env.QA_PTY_TARGET?.trim();
if (requestedTarget && requestedTarget !== "node" && requestedTarget !== "exe") {
  console.error(`Unknown QA_PTY_TARGET: ${requestedTarget}`);
  process.exit(2);
}
const verified = checkBuild({ root, dist: path.join(root, "packages", "ts-shell", "dist"),
  version: pkg.version, executablePolicy: requestedTarget === "node" ? "ignore" : "required" });
if (!verified.ok) {
  console.error(`Build first: ${verified.reason}`);
  process.exit(2);
}
const qaOutputDir = process.env.QA_PTY_OUTPUT_DIR?.trim();
const executableDigest = verified.executable
  ? createHash("sha256").update(fs.readFileSync(path.join(root, verified.executable.path))).digest("hex")
  : null;
const buildEvidence = {
  buildId: verified.manifest.buildId,
  inputsDigest: verified.manifest.inputsDigest,
  artifactDigest: verified.manifest.artifactDigest,
  executableSha256: executableDigest,
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
};
const targetCandidates = [
  { name: "node", command: process.execPath, args: [path.join(root, "dist/cli.js")] },
  ...(verified.executable
    ? [{ name: "exe", command: path.join(root, verified.executable.path), args: [] }]
    : []),
];

const targets = targetCandidates.filter(target => !requestedTarget || target.name === requestedTarget);
const modes = process.env.QA_PTY_MODE ? [process.env.QA_PTY_MODE] : ["regular", "fullscreen", "line", "pipe"];
const terminalModes = new Set(["regular", "fullscreen"]);
const allModes = new Set([...terminalModes, "line", "pipe"]);
if (targets.length === 0) {
  console.error(`Unknown QA_PTY_TARGET: ${requestedTarget}`);
  process.exit(2);
}
if (modes.some(mode => !allModes.has(mode))) {
  console.error(`Unknown QA_PTY_MODE: ${process.env.QA_PTY_MODE}`);
  process.exit(2);
}

const plain = value => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const normalized = value => plain(value)
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
  .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");

function waitForOutput(read, predicate, label, timeoutMs = 20_000, diagnostic) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      try {
        if (predicate(read())) {
          resolve();
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          const detail = diagnostic?.();
          reject(new Error(`timed out waiting for ${label}${detail ? ` (${detail})` : ""}`));
          return;
        }
        setTimeout(tick, 50);
      } catch (error) { reject(error); }
    };
    tick();
  });
}

function waitForExit(child, timeoutMs = 15_000) {
  if (child.probeError) return Promise.reject(child.probeError);
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const onError = error => { clearTimeout(timer); child.off("exit", onExit); reject(error); };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      child.off("error", onError);
      reject(new Error("timed out waiting for process exit"));
    }, timeoutMs);
    const onExit = code => {
      clearTimeout(timer);
      child.off("error", onError);
      resolve(code);
    };
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function createFixture(mode) {
  // macOS reports /var/... from mkdtemp but the runtime canonicalizes the same
  // directory to /private/var/...; seed and live session identities must match.
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "qa-cli-home-")));
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "qa-cli project '$`-")));
  fs.mkdirSync(path.join(project, ".git"));
  fs.mkdirSync(path.join(project, ".agents", "skills", "qa-discovery"), { recursive: true });
  fs.writeFileSync(
    path.join(project, ".agents", "skills", "qa-discovery", "SKILL.md"),
    "---\nname: qa-discovery\ndescription: Local discovery fixture\n---\n\nqa-skill-body\n",
  );
  fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cheers", "config.json"), JSON.stringify({
    tuiMode: mode === "fullscreen" ? "fullscreen" : "regular",
  }));
  const restore = seedRestoreSnapshot(project);
  return { home, project, restore };
}

function removeFixture(home, project) {
  for (const target of [home, project]) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // A killed script wrapper can outlive one cleanup attempt; the next run
      // uses a fresh temporary root, so cleanup failure must not mask the result.
    }
  }
}

function recordResult(target, mode, state, status, exitCode, detail) {
  if (!qaOutputDir) return;
  fs.mkdirSync(qaOutputDir, { recursive: true });
  const stem = `${target.name}-${mode}`;
  fs.writeFileSync(path.join(qaOutputDir, `${stem}.txt`), state.output, "utf8");
  fs.writeFileSync(path.join(qaOutputDir, `${stem}.json`), `${JSON.stringify({
    target: target.name,
    mode,
    command: { executable: target.command, args: target.args },
    build: buildEvidence,
    status,
    exitCode,
    bytes: Buffer.byteLength(state.output, "utf8"),
    ...(detail ? { detail } : {}),
  }, null, 2)}\n`, "utf8");
}

function qaEnvironment(home, project) {
  return {
    ...createQaPtyEnvironment(home, project),
    CHEERS_SYNTHETIC_TOOLS: "1",
  };
}

async function assertFixtureSkillDiscovery(project) {
  const buildRoot = path.join(root, "packages", "ts-shell", "dist", "builds", verified.manifest.buildId);
  const modulePath = path.join(buildRoot, "core", "skills", "skillLoader.js");
  const { SkillLoader } = await import(pathToFileURL(modulePath).href);
  const sources = [];
  let discoveryError;
  let loaded = { skills: new Map(), diagnostics: [], failures: [] };
  try {
    loaded = await new SkillLoader(project, { onSource: target => sources.push(target) }).loadDetailed();
  } catch (error) {
    discoveryError = describeError(error);
  }
  if (loaded.skills.has("qa-discovery")) return;
  const skillDirectory = path.join(project, ".agents", "skills", "qa-discovery");
  const manifest = path.join(project, ".agents", "skills", "qa-discovery", "SKILL.md");
  const workspaceRoot = fs.realpathSync(project);
  let directoryEntries;
  let directoryError;
  let manifestBytes;
  let manifestError;
  let containment;
  let realpaths;
  let stats;
  try {
    const { readDirectory } = await import(pathToFileURL(path.join(buildRoot, "runtime", "execution", "directory.js")).href);
    directoryEntries = (await readDirectory(workspaceRoot, skillDirectory)).map(entry => entry.name);
  } catch (error) {
    directoryError = describeError(error);
  }
  try {
    const { readBinarySnapshot } = await import(pathToFileURL(path.join(buildRoot, "runtime", "execution", "snapshot.js")).href);
    manifestBytes = (await readBinarySnapshot({ absolutePath: manifest, workspaceRoot }, 512 * 1024)).length;
  } catch (error) {
    manifestError = describeError(error);
  }
  try {
    const { verifyPathContainment } = await import(pathToFileURL(path.join(buildRoot, "core", "security", "pathJail.js")).href);
    containment = verifyPathContainment(manifest, workspaceRoot);
    realpaths = {
      workspace: fs.realpathSync(workspaceRoot),
      workspaceNative: fs.realpathSync.native(workspaceRoot),
      manifest: fs.realpathSync(manifest),
      manifestNative: fs.realpathSync.native(manifest),
    };
  } catch (error) {
    containment = { error: describeError(error) };
  }
  try {
    const before = fs.statSync(manifest, { bigint: true });
    const handle = await fs.promises.open(manifest, "r");
    const opened = await handle.stat({ bigint: true });
    await handle.close();
    const after = fs.statSync(manifest, { bigint: true });
    stats = { before: describeStats(before), opened: describeStats(opened), after: describeStats(after) };
  } catch (error) {
    stats = { error: describeError(error) };
  }
  throw new Error(`fixture skill discovery failed (${JSON.stringify({
    project,
    workspaceRoot,
    manifest,
    manifestExists: fs.existsSync(manifest),
    directoryEntries,
    directoryError,
    manifestBytes,
    manifestError,
    containment,
    realpaths,
    stats,
    discoveryError,
    sources,
    diagnostics: loaded.diagnostics,
    failures: loaded.failures,
  })})`);
}

function describeStats(stats) {
  return {
    dev: String(stats.dev),
    ino: String(stats.ino),
    size: String(stats.size),
    mtimeNs: String(stats.mtimeNs),
    ctimeNs: String(stats.ctimeNs),
  };
}

function describeError(error) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
  };
}


async function runInteractivePrompt(state, child, prompt, expected, timeoutMs = 30_000) {
  const start = state.output.length;
  child.stdin.write(`${prompt}\r`);
  const started = Date.now();
  let previewClosed = false;
  let lastApproved = "";
  while (Date.now() - started < timeoutMs) {
    const tail = normalized(state.output.slice(start));
    if (expected.every(item => tail.includes(item))) return;
    if (!previewClosed && tail.includes("close to choose approval")) {
      previewClosed = true;
      child.stdin.write("\x1b");
    }
    const approvals = [...tail.matchAll(/Permission:\s+([^\s(]+)/g)];
    const currentTool = approvals.at(-1)?.[1] ?? "";
    if (currentTool && currentTool !== lastApproved) {
      lastApproved = currentTool;
      child.stdin.write("y");
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for prompt completion: ${prompt}`);
}

async function saveMaxTurns(state, child, home) {
  let start = state.output.length;
  child.stdin.write("/settings\r");
  await waitForOutput(
    () => normalized(state.output.slice(start)),
    value => value.includes("Settings") && value.includes("user configuration"),
    "settings panel",
  );
  start = state.output.length;
  child.stdin.write("maxTurns");
  await waitForOutput(
    () => normalized(state.output.slice(start)),
    value => value.includes("Maximum turns"),
    "settings search",
  );
  start = state.output.length;
  child.stdin.write("\r");
  await waitForOutput(
    () => normalized(state.output.slice(start)),
    value => value.includes("Maximum turns") && value.includes("save to user"),
    "settings detail",
  );
  start = state.output.length;
  child.stdin.write("\r");
  await waitForOutput(
    () => normalized(state.output.slice(start)),
    value => value.includes("Edit Maximum turns"),
    "settings editor",
  );
  start = state.output.length;
  child.stdin.write("\x157\r");
  await waitForOutput(
    () => normalized(state.output.slice(start)),
    value => value.includes("Pending: 7"),
    "settings staged value",
  );
  start = state.output.length;
  child.stdin.write("\r");
  await waitForOutput(
    () => normalized(state.output.slice(start)),
    value => value.includes("Saved to your user configuration"),
    "settings save",
  );
  const config = JSON.parse(fs.readFileSync(path.join(home, ".cheers", "config.json"), "utf8"));
  if (config.maxTurns !== 7) throw new Error(`settings save persisted maxTurns=${String(config.maxTurns)}`);
}

async function runTerminalSmoke(target, mode) {
  const { home, project, restore } = createFixture(mode);
  const recoverySession = seedRecoverySession(home, project);
  const savedSession = seedSavedSession(home, project);
  const terminal = terminalSpawnSpec({ command: target.command, args: target.args, platform: process.platform });
  const child = spawn(terminal.command, terminal.args, {
    cwd: project,
    env: qaEnvironment(home, project),
  });
  child.on("error", error => { child.probeError = error; });
  const state = { output: "" };
  child.stdout.on("data", chunk => { state.output += chunk.toString("utf8"); });
  child.stderr.on("data", chunk => { state.output += chunk.toString("utf8"); });
  const read = () => {
    if (child.probeError) throw child.probeError;
    return plain(state.output);
  };
  const hardTimeout = setTimeout(() => child.kill("SIGKILL"), 90_000);
  try {
    await assertFixtureSkillDiscovery(project);
    await waitForOutput(read, value => value.includes("Cheers") && value.includes(recoverySession) && value.includes("Recovery hint"),
      "first frame and recovery hint", 20_000);
    const sessionId = extractSessionId(state.output, recoverySession);
    if (!sessionId) throw new Error("startup output did not expose the current session id");

    let start = state.output.length;
    child.stdin.write(`/resume fork ${recoverySession}\r`);
    await waitForOutput(() => currentSessionFromStore(home, project),
      value => Boolean(value) && value !== sessionId,
      "fork current session");
    const activeSessionId = currentSessionFromStore(home, project);
    if (!activeSessionId) throw new Error("fork output did not expose the new session id");

    start = state.output.length;
    child.stdin.write(`/resume ${savedSession}\r`);
    await waitForOutput(() => currentSessionFromStore(home, project),
      value => value === savedSession,
      "resume saved session");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("Ask anything, or / for commands"),
      "saved session prompt");
    start = state.output.length;
    child.stdin.write(`/resume ${activeSessionId}\r`);
    await waitForOutput(() => currentSessionFromStore(home, project),
      value => value === activeSessionId,
      "resume forked session");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("Ask anything, or / for commands"),
      "forked session prompt");

    start = state.output.length;
    child.stdin.write(`/resume delete ${recoverySession}\r`);
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("Permanently delete this session"),
      "delete session confirmation");
    child.stdin.write("\x1b[B");
    await new Promise(resolve => setTimeout(resolve, 100));
    child.stdin.write("\r");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes(`Deleted session ${recoverySession}`),
      "delete session result");
    if (fs.existsSync(path.join(home, ".cheers", "sessions", recoverySession))) {
      throw new Error("deleted session directory still exists");
    }

    start = state.output.length;
    child.stdin.write("/resume panel\r");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("esc close") && value.includes("type to filter"),
      "resume panel");
    const resumeCloseStart = state.output.length;
    child.stdin.write("\x1b");
    await new Promise(resolve => setTimeout(resolve, 250));
    child.stdin.write("/sessions current\r");
    await waitForOutput(() => normalized(state.output.slice(resumeCloseStart)), value => value.includes("show full command guide"),
      "resume panel close");
    if (extractSessionId(state.output.slice(resumeCloseStart), recoverySession) !== activeSessionId) {
      throw new Error("resume panel close returned to a different current session");
    }
    child.stdin.write("\x1b");
    await new Promise(resolve => setTimeout(resolve, 250));

    start = state.output.length;
    child.stdin.write("/tools\r");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("Tools") && value.includes("bash") && /Esc\s+to\s+close/i.test(value),
      "tools report reader", 25_000);
    const closeStart = state.output.length;
    child.stdin.write("\x1b");
    await new Promise(resolve => setTimeout(resolve, 250));
    child.stdin.write("/sessions current\r");
    await waitForOutput(() => normalized(state.output.slice(closeStart)),
      value => value.includes("show full command guide"),
      "tools report close");
    child.stdin.write("\x1b");
    await new Promise(resolve => setTimeout(resolve, 250));

    const transcriptPath = path.join(home, ".cheers", "sessions", activeSessionId, "transcript.jsonl");
    const assistantMessages = () => fs.readFileSync(transcriptPath, "utf8").trim().split("\n")
      .map(line => JSON.parse(line)).filter(event => event.type === "message" && event.role === "assistant").length;
    const assistantMessagesBeforePanels = assistantMessages();

    start = state.output.length;
    child.stdin.write("/advisor on\r");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("Advisor no-model; enabled setting."),
      "advisor enable");

    for (const [command, expected, marker] of [
      ["/hub", "Jobs", "No jobs, agents or workflows in this session."],
      ["/agents", "Agents", "Enter inspects a live agent or effective definition."],
      ["/plan-review", "Plan review", "Show current plan"],
      ["/btw", "Side questions", "No side questions have been retained."],
      ["/advisor", "Advisor", "esc cancel"],
    ]) {
      start = state.output.length;
      child.stdin.write(`${command}\r`);
      await waitForOutput(() => normalized(state.output.slice(start)),
        value => value.includes(expected) && value.toLowerCase().includes(marker.toLowerCase()),
        `${command} read-only panel`, 25_000);
      child.stdin.write("\x1b");
      await new Promise(resolve => setTimeout(resolve, 250));
      child.stdin.write("/sessions current\r");
      await waitForOutput(() => normalized(state.output.slice(start)),
        value => value.includes("Current session"),
        `${command} panel close`);
      child.stdin.write("\x1b");
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    start = state.output.length;
    child.stdin.write("/advisor off\r");
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => value.includes("Advisor off; off."),
      "advisor disable");
    if (assistantMessages() !== assistantMessagesBeforePanels) {
      throw new Error("read-only panel sequence appended an assistant/model message");
    }

    await runRestorePreview(state, child, restore, normalized, waitForOutput);

    await runInteractivePrompt(
      state,
      child,
      "run echo qa-approval-ok",
      ["qa-approval-ok", "Synthetic reply: run echo qa-approval-ok"],
    );
    await runInteractivePrompt(
      state,
      child,
      "delegate task inspect qa fixture",
      ["Synthetic reply: delegate task inspect qa fixture"],
    );

    await runInteractivePrompt(
      state,
      child,
      "discover and load skill qa-discovery",
      ["Synthetic reply: discover and load skill qa-discovery"],
    );

    await saveMaxTurns(state, child, home);

    start = state.output.length;
    child.stdin.write("/profile create work\r");
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes("Profile work: created"), "profile create");
    start = state.output.length;
    child.stdin.write("/profile switch work\r");
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes("Confirm digest:"), "profile switch preview");
    const digest = /Confirm digest:\s*([a-f0-9]{64})/.exec(normalized(state.output.slice(start)))?.[1];
    if (!digest) throw new Error("profile switch preview did not expose a full digest");

    start = state.output.length;
    child.stdin.write(`/profile switch work --confirm ${digest}\r`);
    await waitForOutput(() => normalized(state.output.slice(start)),
      value => fs.existsSync(path.join(home, ".cheers", "profiles", "work", "current-session.json"))
        && value.includes("Ask anything"),
      "profile switch target startup", 30_000);
    start = state.output.length;
    child.stdin.write("/profile status\r");
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes("Active profile: work"),
      "switched profile status");
    start = state.output.length;
    child.stdin.write("/sessions current\r");
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes("Current session"),
      "switched profile current session");
    const switchedSession = extractSessionId(state.output.slice(start), sessionId);
    if (!switchedSession) throw new Error("profile switch target did not expose a fresh session id");

    child.stdin.write("/exit\r");
    const code = await waitForExit(child, 20_000);
    if (code !== 0) throw new Error(`process exited ${code}`);
    const clean = normalized(state.output);
    if (!clean.includes("Profile target startup was read back in fresh session")) {
      throw new Error("profile switch did not report verified target startup");
    }
    if (!fs.existsSync(path.join(home, ".cheers", "profiles", "work", "sessions", switchedSession))) {
      throw new Error(`switched profile session was not stored under the named profile: ${switchedSession}`);
    }
    assertTranscript(home, activeSessionId, [
      "\"name\":\"bash\"",
      "\"name\":\"task\"",
      "\"name\":\"tool_search\"",
      "\"name\":\"tool_load\"",
      "\"name\":\"skill\"",
      "\"type\":\"approval.resolved\"",
      "qa-approval-ok",
      "qa-skill-body",
    ], qaOutputDir);
    recordResult(target, mode, state, "pass", code);
    process.stdout.write(`PASS ${target.name}/${mode} settings profile task discovery approval (exit ${code}, ${state.output.length} bytes)\n`);
  } catch (error) {
    const clean = normalized(state.output);
    recordResult(target, mode, state, "fail", child.exitCode, error instanceof Error ? error.message : String(error));
    process.stdout.write(`FAIL ${target.name}/${mode} business chains (${error instanceof Error ? error.message : String(error)})\n`);
    process.stdout.write(clean.slice(-4000));
    process.exitCode = 1;
    child.kill("SIGKILL");
    await waitForExit(child, 2_000).catch(() => undefined);
  } finally {
    clearTimeout(hardTimeout);
    removeFixture(home, project);
  }
}

async function runLineSmoke(target) {
  const { home, project, restore } = createFixture("regular");
  const configBefore = fs.readFileSync(path.join(home, ".cheers", "config.json"), "utf8");
  const child = spawn(target.command, [...target.args, "--non-interactive-approval", "allow-once"], {
    cwd: project,
    env: qaEnvironment(home, project),
  });
  child.on("error", error => { child.probeError = error; });
  const state = { output: "" };
  child.stdout.on("data", chunk => { state.output += chunk.toString("utf8"); });
  child.stderr.on("data", chunk => { state.output += chunk.toString("utf8"); });
  const hardTimeout = setTimeout(() => child.kill("SIGKILL"), 90_000);
  try {
    await assertFixtureSkillDiscovery(project);
    await waitForOutput(() => {
      if (child.probeError) throw child.probeError;
      return normalized(state.output);
    }, value => value.includes("Cheers") && value.includes("Session: sess_"),
      "line startup", 20_000);
    const sessionId = extractSessionId(state.output);
    if (!sessionId) throw new Error("line startup did not expose the current session id");

    for (const step of [
      { command: "/sessions current", expected: "Current session" },
      { command: "/tools", expected: "Tools" },
      { command: "run echo qa-approval-ok", expected: "qa-approval-ok" },
      { command: "delegate task inspect qa fixture", expected: "Synthetic reply: delegate task inspect qa fixture" },
      { command: "discover and load skill qa-discovery", expected: "Synthetic reply: discover and load skill qa-discovery" },
      { command: "/settings", expected: "bare command and field details are read-only" },
      { command: "/profile create work", expected: "Profile work: created" },
      { command: "/profile switch work", expected: "requires an interactive terminal" },
      { command: "/settings set maxTurns 7", expected: "Saved to your user configuration" },
      { command: '/restore preview --authority-id qa-restore --record qa-record', expected: ['Would restore', 'qa-restore.txt', 'Nothing was written.'] },
    ]) {
      const start = state.output.length;
      child.stdin.write(`${step.command}\n`);
      await waitForOutput(() => normalized(state.output.slice(start)), value =>
        (Array.isArray(step.expected) ? step.expected : [step.expected]).every(expected => value.includes(expected)),
        `line ${step.command}`, 25_000);
    }
    child.stdin.write("/exit\n");
    const code = await waitForExit(child, 20_000);
    if (code !== 0) throw new Error(`process exited ${code}`);
    const config = JSON.parse(fs.readFileSync(path.join(home, ".cheers", "config.json"), "utf8"));
    if (config.maxTurns !== 7) throw new Error(`line settings save persisted maxTurns=${String(config.maxTurns)}`);
    if (config.tuiMode !== JSON.parse(configBefore).tuiMode) throw new Error("line settings save changed the launch preference");
    if (!fs.existsSync(path.join(home, ".cheers", "profiles", "work"))) throw new Error("line profile create did not persist the profile");
    await assertNamedProfileRestart(target, home, project, "line", state);
    assertRestoreUnchanged(restore);
    assertTranscript(home, sessionId, [
      "\"name\":\"bash\"",
      "\"name\":\"task\"",
      "\"name\":\"tool_search\"",
      "\"name\":\"tool_load\"",
      "\"name\":\"skill\"",
      "\"type\":\"approval.resolved\"",
      "qa-approval-ok",
      "qa-skill-body",
    ], qaOutputDir);
    recordResult(target, "line", state, "pass", code);
    process.stdout.write(`PASS ${target.name}/line task discovery approval settings boundary (exit ${code}, ${state.output.length} bytes)\n`);
  } catch (error) {
    recordResult(target, "line", state, "fail", child.exitCode, error instanceof Error ? error.message : String(error));
    process.stdout.write(`FAIL ${target.name}/line business chains (${error instanceof Error ? error.message : String(error)})\n`);
    process.stdout.write(normalized(state.output).slice(-4000));
    process.exitCode = 1;
    child.kill("SIGKILL");
    await waitForExit(child, 2_000).catch(() => undefined);
  } finally {
    clearTimeout(hardTimeout);
    removeFixture(home, project);
  }
}

async function runPipeSmoke(target) {
  const { home, project, restore } = createFixture("regular");
  const configBefore = fs.readFileSync(path.join(home, ".cheers", "config.json"), "utf8");
  const input = [
    "/sessions current",
    "/tools",
    "run echo qa-approval-ok",
    "delegate task inspect qa fixture",
    "discover and load skill qa-discovery",
    "/settings",
    "/profile create work",
    "/profile switch work",
    "/settings set maxTurns 7",
    '/restore preview --authority-id qa-restore --record qa-record',
    "/exit",
  ].join("\n") + "\n";
  const child = spawn(target.command, [...target.args, "--print", "--non-interactive-approval", "allow-once"], {
    cwd: project,
    env: qaEnvironment(home, project),
  });
  child.on("error", error => { child.probeError = error; });
  const state = { output: "" };
  child.stdout.on("data", chunk => { state.output += chunk.toString("utf8"); });
  child.stderr.on("data", chunk => { state.output += chunk.toString("utf8"); });
  child.stdin.end(input);
  const hardTimeout = setTimeout(() => child.kill("SIGKILL"), 90_000);
  try {
    await assertFixtureSkillDiscovery(project);
    const code = await waitForExit(child, 60_000);
    if (code !== 0) throw new Error(`process exited ${code}`);
    const config = JSON.parse(fs.readFileSync(path.join(home, ".cheers", "config.json"), "utf8"));
    if (config.maxTurns !== 7) throw new Error(`pipe settings save persisted maxTurns=${String(config.maxTurns)}`);
    if (config.tuiMode !== JSON.parse(configBefore).tuiMode) throw new Error("pipe settings save changed the launch preference");
    if (!fs.existsSync(path.join(home, ".cheers", "profiles", "work"))) throw new Error("pipe profile create did not persist the profile");
    await assertNamedProfileRestart(target, home, project, "pipe", state);
    const output = normalized(state.output);
    for (const expected of [
      "Current session",
      "Tools",
      "qa-approval-ok",
      "Synthetic reply: delegate task inspect qa fixture",
      "Synthetic reply: discover and load skill qa-discovery",
      "bare command and field details are read-only",
      "Profile work: created",
      "requires an interactive terminal",
      "Saved to your user configuration",
      'Would restore',
      'qa-restore.txt',
      'Nothing was written.',
    ]) {
      if (!output.includes(expected)) throw new Error(`pipe output missing ${expected}`);
    }
    assertRestoreUnchanged(restore);
    const sessionId = extractSessionId(state.output);
    if (!sessionId) throw new Error("pipe output did not expose the current session id");
    assertTranscript(home, sessionId, [
      "\"name\":\"bash\"",
      "\"name\":\"task\"",
      "\"name\":\"tool_search\"",
      "\"name\":\"tool_load\"",
      "\"name\":\"skill\"",
      "\"type\":\"approval.resolved\"",
      "qa-approval-ok",
      "qa-skill-body",
    ], qaOutputDir);
    recordResult(target, "pipe", state, "pass", code);
    process.stdout.write(`PASS ${target.name}/pipe task discovery approval settings boundary (exit ${code}, ${state.output.length} bytes)\n`);
  } catch (error) {
    recordResult(target, "pipe", state, "fail", child.exitCode, error instanceof Error ? error.message : String(error));
    process.stdout.write(`FAIL ${target.name}/pipe business chains (${error instanceof Error ? error.message : String(error)})\n`);
    process.stdout.write(normalized(state.output).slice(-4000));
    process.exitCode = 1;
    child.kill("SIGKILL");
    await waitForExit(child, 2_000).catch(() => undefined);
  } finally {
    clearTimeout(hardTimeout);
    removeFixture(home, project);
  }
}

async function assertNamedProfileRestart(target, home, project, mode, state) {
  const child = spawn(target.command, [...target.args, "--profile", "work", "--print"], {
    cwd: project,
    env: qaEnvironment(home, project),
  });
  child.on("error", error => { child.probeError = error; });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString("utf8"); });
  child.stderr.on("data", chunk => { output += chunk.toString("utf8"); });
  child.stdin.end("/sessions current\n/exit\n");
  try {
    const code = await waitForExit(child, 30_000);
    if (code !== 0) throw new Error(`profile follow-up exited ${code}`);
    const clean = normalized(output);
    if (!clean.includes("Current session")) throw new Error(`${mode} profile follow-up did not report a current session`);
    const sessionId = extractSessionId(output);
    if (!sessionId) throw new Error(`${mode} profile follow-up did not expose a session id`);
    const sessionDir = path.join(home, ".cheers", "profiles", "work", "sessions", sessionId);
    if (!fs.existsSync(path.join(sessionDir, "metadata.json")) || !fs.existsSync(path.join(sessionDir, "state.json"))
      || !fs.existsSync(path.join(sessionDir, "transcript.jsonl"))) {
      throw new Error(`${mode} profile follow-up session was not stored under the named profile: ${sessionId}`);
    }
    state.output += `\n--- named profile restart (${mode}) ---\n${output}`;
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, 2_000).catch(() => undefined);
    }
  }
}

for (const target of targets) {
  for (const mode of modes) {
    if (terminalModes.has(mode)) await runTerminalSmoke(target, mode);
    else if (mode === "line") await runLineSmoke(target);
    else await runPipeSmoke(target);
  }
}
