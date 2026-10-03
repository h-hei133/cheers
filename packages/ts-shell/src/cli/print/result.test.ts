import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { TranscriptEvent } from "../../session/sessionEventCodec.js";

const run = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
type Scenario = "print-read" | "replay-read" | "approved-write" | "denied-write" | "readiness-rejected";
type RequestBody = { messages: Array<{ role: string; content?: unknown }> };

function childEnvironment(home: string, tmp: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    CHEERS_TEST_ROOT: tmp, CHEERS_SYNTHETIC_HOME: home, CHEERS_REAL_HOME: "",
    // Use the HTTP transport against the loopback fixture, with no inherited credentials.
    CHEERS_PROVIDER_MODE: "real", NO_COLOR: "1" };
}

async function transcripts(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await transcripts(file));
    else if (entry.name === "transcript.jsonl") found.push(file);
  }
  return found;
}

async function scenario(kind: Scenario): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-result-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const tmp = path.join(root, "tmp");
  const marker = `FILE_EVIDENCE_${randomUUID()}`;
  const fixture = path.join(workspace, "fixture.txt");
  const written = path.join(workspace, "written.txt");
  const writing = kind === "approved-write" || kind === "denied-write";
  const denied = kind === "denied-write";
  const rejected = kind === "readiness-rejected";
  const requests: RequestBody[] = [];
  const serverErrors: unknown[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      response.setHeader("content-type", "application/json");
      if (request.method === "GET" && request.url === "/v1/models") {
        response.statusCode = rejected ? 403 : 200;
        response.end(JSON.stringify(rejected ? { error: { message: "fixture auth refusal" } } : { data: [{ id: "fixture-model" }] }));
        return;
      }
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
        throw new Error(`Unexpected fixture request: ${request.method} ${request.url}`);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as RequestBody;
      requests.push(body);
      const done = body.messages.some(message => message.role === "tool");
      const message = done ? { role: "assistant", content: "MODEL_CLAIMS_SUCCESS" } : {
        role: "assistant", content: null,
        tool_calls: [{ id: "fixture-call", type: "function", function: {
          name: writing ? "write" : "read",
          arguments: JSON.stringify(writing ? { path: written, content: `${marker}\n` } : { path: fixture }),
        } }],
      };
      response.end(JSON.stringify({ id: "fixture", model: "fixture-model", object: "chat.completion",
        choices: [{ index: 0, message, finish_reason: done ? "stop" : "tool_calls" }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
    })().catch(error => { serverErrors.push(error); response.statusCode = 500; response.end("fixture failed"); });
  });
  try {
    await Promise.all([fs.mkdir(path.join(home, ".cheers"), { recursive: true }), fs.mkdir(workspace), fs.mkdir(tmp)]);
    await fs.writeFile(fixture, `${marker}\n`);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture address");
    await fs.writeFile(path.join(home, ".cheers", "config.json"), JSON.stringify({ provider: "openai", agentMode: "build",
      providerCredentials: { openai: { apiKey: "test-only-local", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "fixture-model" } } }));
    const prompt = writing ? `Write the requested fixture to ${written}.` : `Read ${fixture}.`;
    const replay = path.join(workspace, "replay.txt");
    await fs.writeFile(replay, `${prompt}\n`);
    const child = run(process.execPath, [path.join(repo, "node_modules/tsx/dist/cli.mjs"),
      path.join(repo, "packages/ts-shell/src/entrypoints/cli.tsx"), "--project", workspace,
      "--non-interactive-approval", denied ? "deny" : "allow-once",
      ...(kind === "replay-read" ? ["--replay-file", replay] : ["--print", prompt]),
    ], { cwd: workspace, env: childEnvironment(home, tmp), timeout: 30000, maxBuffer: 1024 * 1024 });
    child.child.stdin?.end();
    const { stdout, stderr } = await child;
    expect(serverErrors).toEqual([]);
    const files = await transcripts(home);
    expect(files).toHaveLength(1);
    const entries = (await fs.readFile(files[0]!, "utf8")).trim().split("\n").map(line => JSON.parse(line) as TranscriptEvent);
    const events = entries.filter((entry): entry is Extract<TranscriptEvent, { type: "query-event" }> => entry.type === "query-event");
    const terminals = events.filter(entry => entry.event.type === "query.completed");
    expect(terminals).toHaveLength(1);
    const terminal = terminals[0]!;
    if (terminal.event.type !== "query.completed") throw new Error("Missing terminal event");
    expect(terminal.event.result.status).toBe(denied || rejected ? "stopped_error" : "completed");
    expect(terminal.event.result.terminalClassification).toBe(rejected ? "error" : denied ? "stopped" : "success");
    const tools = events.flatMap(entry => entry.event.type === "tool.result" ? [entry.event] : []);
    const decisions = events.flatMap(entry => entry.event.type === "approval.resolved" ? [entry.event.outcome] : []);
    const output = stdout + stderr;
    if (rejected) {
      expect(requests).toHaveLength(0);
      expect(tools).toHaveLength(0);
      expect(decisions).toEqual([]);
      expect(terminal.event.result.stopReason).toContain("provider-readiness:auth");
    } else {
      expect(requests).toHaveLength(2);
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({ toolName: writing ? "write" : "read", success: !denied });
      expect(decisions).toEqual(writing ? [denied ? "denied" : "approved"] : []);
      const assistant = entries.filter(entry => entry.type === "message" && entry.role === "assistant").at(-1);
      expect(assistant).toBeDefined();
      expect(assistant!.id).toEqual(expect.any(String));
      expect(assistant!.id).not.toBe("");
      expect(terminal.sourceEntryId).toBe(assistant!.id);
      expect(terminal.event.result.finalOutput).toContain("MODEL_CLAIMS_SUCCESS");
      if (!denied) expect(output).toContain("MODEL_CLAIMS_SUCCESS");
      if (!writing) {
        expect(tools[0]!.output).toContain(marker);
        expect(JSON.stringify(requests[1]!.messages.filter(message => message.role === "tool"))).toContain(marker);
      }
    }
    if (denied || rejected) {
      expect(output).toContain(rejected ? "Outcome: error" : "Outcome: stopped");
      expect(output).not.toContain("Outcome: success");
    } else expect(output).toContain("Outcome: success");
    if (kind === "replay-read") expect(output).toContain("Replay mode: running 1 prompt(s)");
    expect(await fs.readFile(fixture, "utf8")).toBe(`${marker}\n`);
    if (kind === "approved-write") expect(await fs.readFile(written, "utf8")).toBe(`${marker}\n`);
    else await expect(fs.stat(written)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe("CLI result contract with local protocol evidence", () => {
  it.each<Scenario>(["print-read", "replay-read", "approved-write", "denied-write", "readiness-rejected"])(
    "%s preserves tool, approval, disk and terminal facts", scenario, 40000,
  );
});
