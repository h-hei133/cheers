import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { renderedKeyAfter } from "./bench/observation.mjs";
import { processSettlement } from "./bench/process.mjs";

function child() {
  return Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: () => true });
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
    await lifetime.stop();
    assert.throws(() => globalThis.process.kill(pid, 0), { code: "ESRCH" });
    assert.ok(process.stdout.readableEnded);
  } finally { await lifetime.stop(); }
});
