import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { renderedKeyAfter, StartupObservation, terminalStartupTimes } from "./bench/observation.mjs";

test("early frame requires the real Loading editor and keeps readiness separate", () => {
  for (const mode of ["regular", "fullscreen"]) {
    const state = new StartupObservation(mode);
    state.feed("stdout", Buffer.from("openai relay · runtime ready"), 10);
    assert.equal(state.firstFrameAt, undefined);
    state.feed("stdout", Buffer.from("\x1b[32mLoading runtime\x1b[0m"), 20);
    assert.equal(state.firstFrameAt, undefined);
    const editor = Buffer.from("❯ Loading · type a draft");
    state.feed("stdout", editor.subarray(0, 1), 30);
    state.feed("stderr", Buffer.from("diagnostic"), 35);
    state.feed("stdout", editor.subarray(1), 40);
    assert.equal(state.firstFrameAt, 40);
    assert.equal(state.firstByteAt, 10);
    assert.equal(state.inputAnnouncementAt, undefined);
    state.feed("stdout", Buffer.from("Ask anything, or / for commands"), 60);
    assert.equal(state.inputAnnouncementAt, 60);
    state.feed("stdout", Buffer.from("❯ Loading · type a draft"), 80);
    assert.equal(state.firstFrameAt, 40);
  }
});

test("line and pipe retain their own surfaces without inventing an interactive frame", () => {
  const line = new StartupObservation("line"), pipe = new StartupObservation("pipe");
  for (const state of [line, pipe]) {
    state.feed("stdout", Buffer.from("Cheers Shell\nwaiting for newline-delimited prompts.\nSynthetic reply: hello"), 10);
    assert.equal(state.firstReplyAt, 10);
  }
  assert.equal(line.firstFrameAt, 10);
  assert.equal(line.inputAnnouncementAt, 10);
  assert.equal(pipe.firstFrameAt, undefined);
  assert.equal(pipe.inputAnnouncementAt, undefined);
});

test("startup output acquisition is bounded", () => {
  const state = new StartupObservation("regular");
  assert.throws(() => state.feed("stdout", Buffer.alloc(2 * 1024 * 1024 + 1, 120), 10), /output limit/);
});

const phaseLabels = ["input listener ready", "first frame layout", "first frame write completed",
  "runtime ready", "runtime input adopted", "runtime frame write completed"];
const phaseMarks = () => phaseLabels.map((label, index) => ({ label, elapsedMs: (index + 1) * 10 }));

test("process timing distinguishes early input and write from runtime adoption and write", () => {
  const times = terminalStartupTimes(phaseMarks());
  assert.deepEqual(times, { inputListenerReadyProcessMs: 10, firstFrameLayoutProcessMs: 20,
    firstFrameWriteProcessMs: 30, runtimeReadyProcessMs: 40, runtimeInputAdoptedProcessMs: 50,
    runtimeFrameWriteProcessMs: 60 });
});

test("missing, duplicated, invalid or out-of-order startup evidence is rejected", () => {
  for (let index = 0; index < phaseLabels.length; index++) {
    const marks = phaseMarks();
    assert.throws(() => terminalStartupTimes(marks.filter((_, slot) => slot !== index)), /requires one valid/);
    assert.throws(() => terminalStartupTimes([...marks, marks[index]]), /requires one valid/);
    for (const elapsedMs of [NaN, -1, undefined]) {
      assert.throws(() => terminalStartupTimes(marks.map((mark, slot) => slot === index ? { ...mark, elapsedMs } : mark)), /requires one valid/);
    }
  }
  assert.throws(() => terminalStartupTimes(phaseMarks().map(mark => mark.label === "runtime ready"
    ? { ...mark, elapsedMs: 25 } : mark)), /lifecycle order/);
});

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
