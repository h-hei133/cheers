import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

it.each([["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const)("ends the JSON query stream with cancellation before %s exit", async (interrupt, exitCode) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cancellation-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const tmp = path.join(root, "tmp");
  let closed = false;
  let requests = 0;
  let child: ChildProcess | undefined;
  const server = createServer((request, response) => {
    request.resume();
    if (request.method === "GET") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
      return;
    }
    requests++;
    response.on("close", () => { closed = true; });
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write('data: {"choices":[{"delta":{"content":"PARTIAL_BEFORE_CANCEL"}}]}\n\n');
  });
  try {
    await Promise.all([fs.mkdir(path.join(home, ".cheers"), { recursive: true }), fs.mkdir(workspace), fs.mkdir(tmp)]);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture address");
    await fs.writeFile(path.join(home, ".cheers", "config.json"), JSON.stringify({ provider: "openai",
      providerCredentials: { openai: { apiKey: "test-only-local", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "fixture-model" } } }));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG"]) env[key] = process.env[key];
    // Run the built entry directly so signals reach the CLI, without a loader wrapper.
    child = spawn(process.execPath, [path.join(repo, "dist/cli.js"), "--project", workspace, "--json", "--print", "Reply briefly."], {
      cwd: workspace, env: { ...env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
        CHEERS_TEST_ROOT: tmp, CHEERS_REAL_HOME: "", CHEERS_PROVIDER_MODE: "real", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const events: Array<{ type: string; delta?: string }> = [];
    let pending = "";
    let stderr = "";
    let interrupted = false;
    child.stdout!.on("data", chunk => {
      pending += String(chunk);
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines.filter(Boolean)) {
        const { facts: event } = JSON.parse(line) as { facts: { type: string; delta?: string } };
        events.push(event);
        if (!interrupted && event.type === "message.delta" && event.delta?.includes("PARTIAL_BEFORE_CANCEL")) {
          interrupted = true;
          child!.kill(interrupt);
        }
      }
    });
    child.stderr!.on("data", chunk => { stderr += String(chunk); });
    child.stdin!.end();
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => { child!.kill("SIGKILL"); reject(new Error("CLI cancellation timed out")); }, 20000);
      child!.once("error", error => { clearTimeout(timer); reject(error); });
      child!.once("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    expect(interrupted, stderr).toBe(true);
    expect(result, stderr).toEqual({ code: exitCode, signal: null });
    expect(events.filter(event => event.type === "lifecycle.cancelled")).toHaveLength(1);
    expect(events.filter(event => event.type !== "cli.output").at(-1)?.type).toBe("lifecycle.cancelled");
    expect(events.some(event => event.type === "query.completed" || event.type === "query.failed")).toBe(false);
    expect(requests).toBe(1);
    expect(closed).toBe(true);
    const files = await transcriptFiles(home);
    expect(files).toHaveLength(1);
    const entries = (await fs.readFile(files[0]!, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const cancellation = entries.filter(entry => entry.type === "query-event" && entry.event.type === "lifecycle.cancelled");
    expect(cancellation).toHaveLength(1);
    const assistant = entries.find(entry => entry.type === "message" && entry.role === "assistant");
    expect(assistant?.content).toContain("PARTIAL_BEFORE_CANCEL");
    expect(cancellation[0].sourceEntryId).toBe(assistant?.id);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  }
}, 25000);

async function transcriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await transcriptFiles(file));
    else if (entry.name === "transcript.jsonl") files.push(file);
  }
  return files;
}
