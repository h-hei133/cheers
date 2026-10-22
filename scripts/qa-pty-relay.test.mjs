import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const relay = fileURLToPath(new URL("./qa/relay.py", import.meta.url));

test("relays terminal input and output without a parent TTY", { skip: process.platform === "win32" }, async () => {
  const child = spawn("python3", [relay, "--", process.execPath, "-e", `
    process.stdout.write("ready\\n");
    process.stdin.once("data", data => {
      process.stdout.write("got:" + data.toString().trim() + "\\n");
      process.exit(0);
    });
  `], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`PTY relay did not become ready: ${output}`)), 5_000);
    child.stdout.on("data", () => {
      if (!output.includes("ready")) return;
      clearTimeout(timer);
      child.stdin.write("hello\r");
      resolve();
    });
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0);
  assert.match(output, /got:hello/);
});
