import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertTranscript } from "./qa/session.mjs";

test("session acceptance requires persisted successful results for every tool call", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "qa-session-test-"));
  const directory = path.join(home, ".cheers", "sessions", "test");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "transcript.jsonl");
  const events = ["bash", "task", "tool_search", "tool_load", "skill"].flatMap(name => [
    { type: "message", role: "assistant", tool_calls: [{ id: name, type: "function", function: { name, arguments: "{}" } }] },
    { type: "query-event", event: { type: "tool.result", toolName: name, taskId: name, success: true } },
  ]);
  const write = entries => fs.writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  try {
    write(events);
    assert.doesNotThrow(() => assertTranscript(home, "test", []));
    for (const change of [
      event => ({ ...event, success: false }),
      event => ({ ...event, taskId: "different-call" }),
      event => ({ ...event, toolName: "different-tool" }),
    ]) {
      write(events.map((entry, index) => index === 1 ? { ...entry, event: change(entry.event) } : entry));
      assert.throws(() => assertTranscript(home, "test", []), /no successful result for bash/);
    }
    write([...events, { type: "message", role: "assistant", tool_calls: [
      { id: "bash-second", type: "function", function: { name: "bash", arguments: "{}" } },
    ] }]);
    assert.throws(() => assertTranscript(home, "test", []), /no successful result for bash/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
