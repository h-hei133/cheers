import assert from "node:assert/strict";
import { test } from "node:test";
import { terminalSpawnSpec } from "./qa/terminal.mjs";

test("uses Linux script options for a real terminal", () => {
  assert.deepEqual(terminalSpawnSpec({ command: "/bin/cli", args: ["--profile", "a'b"], platform: "linux" }), {
    command: "script",
    args: ["-qec", "stty rows 60 cols 120; exec '/bin/cli' '--profile' 'a'\\''b'", "/dev/null"],
  });
});

test("uses BSD script syntax on macOS", () => {
  assert.deepEqual(terminalSpawnSpec({ command: "/bin/cli", args: [], platform: "darwin" }), {
    command: "script",
    args: ["-q", "/dev/null", "/bin/sh", "-c", "stty rows 60 cols 120; exec '/bin/cli'"],
  });
});

test("refuses terminal modes on Windows instead of faking a PTY", () => {
  assert.throws(() => terminalSpawnSpec({ command: "cli.exe", platform: "win32" }), /use line or pipe modes/);
});
