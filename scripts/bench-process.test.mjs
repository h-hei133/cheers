import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { renderedKeyAfter } from "./bench/observation.mjs";
import { processSettlement } from "./bench/process.mjs";

function child() {
  return Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: () => true });
}

function targetIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return { state: fields[0], started: fields[19] };
  } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}

async function assertTargetStopped(pid, started) {
  const deadline = Date.now() + 2_000;
  let current;
  do {
    current = targetIdentity(pid);
    // kill(pid, 0) also succeeds for exited zombies and a reused PID.
    if (!current || current.started !== started || current.state === "Z") return;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.fail(`PTY target remains active after wrapper close (${current?.state ?? "unknown"}).`);
}

test("process settlement waits for stream close, including a signal exit", async () => {
  const process = child(), lifetime = processSettlement(process);
  let settled = false;
  const waiting = lifetime.wait().then(result => { settled = true; return result; });
  process.signalCode = "SIGTERM"; process.emit("exit", null, "SIGTERM");
  await Promise.resolve(); assert.equal(settled, false);
  assert.throws(() => lifetime.assertRunning(), /ended/);
  process.emit("close", null, "SIGTERM");
  assert.deepEqual(await waiting, { code: null, signal: "SIGTERM", launchError: undefined, interrupted: false });
  assert.equal(process.listenerCount("error"), 0);
  assert.equal(process.listenerCount("close"), 0);
});

test("launch errors are retained until close and remain observable", async () => {
  const process = child(), lifetime = processSettlement(process);
  const error = new Error("launch refused"); process.emit("error", error);
  assert.throws(() => lifetime.assertRunning(), /launch refused/);
  process.emit("close", -2, null);
  assert.equal((await lifetime.wait()).launchError, error);
});

test("an observation timeout does not settle or relaunch the live process", async () => {
  const process = child(), lifetime = processSettlement(process);
  await assert.rejects(lifetime.wait(5), /close is unconfirmed/);
  lifetime.assertRunning();
  process.exitCode = 0; process.emit("close", 0, null);
  assert.equal((await lifetime.wait()).code, 0);
});

test("cleanup forwards termination and waits for actual close", async () => {
  const process = child(), signals = [], lifetime = processSettlement(process);
  process.kill = signal => {
    signals.push(signal);
    setImmediate(() => process.emit("close", null, signal));
    return true;
  };
  await lifetime.stop();
  assert.deepEqual(signals, ["SIGTERM"]);
  await lifetime.stop(); assert.deepEqual(signals, ["SIGTERM"]);
});

test("hard timeout cannot look successful even if the wrapper closes with zero", async () => {
  const process = child(), lifetime = processSettlement(process, 5);
  process.kill = () => { setImmediate(() => process.emit("close", 0, null)); return true; };
  const result = await lifetime.wait();
  assert.equal(result.code, 0);
  assert.equal(result.interrupted, true);
});

test("Linux PTY termination closes the wrapper and its actual target", { skip: process.platform !== "linux" }, async () => {
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const program = 'process.on("SIGTERM",()=>process.exit(0)); console.log("target-ready:"+process.pid); setInterval(()=>{},1000);';
  const process = spawn("script", ["-E", "never", "-qec",
    `exec ${[globalThis.process.execPath, "-e", program].map(quote).join(" ")}`, "/dev/null"]);
  const lifetime = processSettlement(process);
  let output = "";
  process.stdout.on("data", data => { output += data.toString(); });
  process.stderr.resume();
  try {
    await renderedKeyAfter(process.stdout, () => {}, "target-ready:");
    const pid = Number(/target-ready:(\d+)/.exec(output)?.[1]);
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    const identity = targetIdentity(pid);
    assert.ok(identity?.started);
    await lifetime.stop();
    await assertTargetStopped(pid, identity.started);
    assert.ok(process.stdout.readableEnded);
  } finally { await lifetime.stop(); }
});

test("Linux target observation distinguishes a zombie from a running process", { skip: process.platform !== "linux" }, async () => {
  const program = String.raw`import os, time, signal
child = os.fork()
if child == 0:
    os._exit(0)
def stop(signum, frame):
    os.waitpid(child, 0)
    raise SystemExit(0)
signal.signal(signal.SIGTERM, stop)
print("zombie-ready:" + str(child), flush=True)
while True:
    time.sleep(1)
`;
  const wrapper = spawn("python3", ["-c", program]), lifetime = processSettlement(wrapper);
  let output = ""; wrapper.stdout.on("data", data => { output += data.toString(); }); wrapper.stderr.resume();
  try {
    await renderedKeyAfter(wrapper.stdout, () => {}, "zombie-ready:");
    const pid = Number(/zombie-ready:(\d+)/.exec(output)?.[1]);
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    await assertTargetStopped(pid, targetIdentity(pid)?.started);
    assert.equal(targetIdentity(pid)?.state, "Z");
    assert.doesNotThrow(() => process.kill(pid, 0));
    const live = targetIdentity(wrapper.pid);
    assert.ok(live?.started && live.state !== "Z");
    await assert.rejects(assertTargetStopped(wrapper.pid, live.started), /remains active/);
  } finally { await lifetime.stop(); }
});
