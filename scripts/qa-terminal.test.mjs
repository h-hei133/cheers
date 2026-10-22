import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { terminalSpawnSpec } from "./qa/terminal.mjs";

test("uses Linux script options for a real terminal", () => {
  assert.deepEqual(terminalSpawnSpec({ command: "/bin/cli", args: ["--profile", "a'b"], platform: "linux" }), {
    command: "script",
    args: ["-qec", "stty rows 60 cols 120; exec '/bin/cli' '--profile' 'a'\\''b'", "/dev/null"],
  });
});

test("uses the Python PTY relay on macOS", () => {
  const relay = fileURLToPath(new URL("./qa/relay.py", import.meta.url));
  assert.deepEqual(terminalSpawnSpec({ command: "/bin/cli", args: [], platform: "darwin" }), {
    command: "python3",
    args: [relay, "--", "/bin/cli"],
  });
});

test("refuses terminal modes on Windows instead of faking a PTY", () => {
  assert.throws(() => terminalSpawnSpec({ command: "cli.exe", platform: "win32" }), /use line or pipe modes/);
});
