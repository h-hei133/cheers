import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { renderedKeyAfter } from "./bench/observation.mjs";

test("key measurement ignores unrelated output and waits for complete UTF-8 input", async () => {
  const stdout = new EventEmitter();
  let settled = false;
  const measurement = renderedKeyAfter(stdout, () => stdout.emit("data", Buffer.from("startup tail")), "Ω")
    .then(value => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  const bytes = Buffer.from("Ω");
  stdout.emit("data", bytes.subarray(0, 1));
  await Promise.resolve();
  assert.equal(settled, false);
  stdout.emit("data", bytes.subarray(1));
  assert.ok(await measurement >= 0);
  assert.equal(stdout.listenerCount("data"), 0);
  assert.equal(stdout.listenerCount("end"), 0);
});

test("key measurement fails on timeout and releases listeners", async () => {
  const stdout = new EventEmitter();
  await assert.rejects(renderedKeyAfter(stdout, () => {}, "Ω", 10), /timed out/);
  assert.equal(stdout.listenerCount("data"), 0);
  assert.equal(stdout.listenerCount("end"), 0);
});

test("key measurement fails when output closes or the input write fails", async () => {
  for (const write of [stdout => stdout.emit("end"), () => { throw new Error("write failed"); }]) {
    const stdout = new EventEmitter();
    await assert.rejects(renderedKeyAfter(stdout, () => write(stdout), "Ω"), /ended|write failed/);
    assert.equal(stdout.listenerCount("data"), 0);
    assert.equal(stdout.listenerCount("end"), 0);
  }
});
