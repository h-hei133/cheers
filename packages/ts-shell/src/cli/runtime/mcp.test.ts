import { EventEmitter } from "node:events";
import { createCliShutdown } from "./shutdown.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "../../core/mcp/gateway.js";
import { runCliRuntimeInvocation, type CliRuntimeInvocationInput } from "../../entrypoints/cliRuntimeInvocation.js";
import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";

let root: string;
let log: string;
let gateway: CoreMcpGateway;
function starts(): number[] {
  return fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line))
    .filter(event => event.event === "start").map(event => event.pid);
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function input(): CliRuntimeInvocationInput {
  return {
    sessionId: "sess_mcp_lifetime",
    prompt: "hello",
    workspaceRoot: root,
    signal: new AbortController().signal,
    maxTurns: 1,
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: "deny", respondedAt: 1 }),
    providerCredentialResolution: { provider: "openai", expectedEnvVarName: "OPENAI_API_KEY" },
    agentMode: "build",
    providerModeEnv: "synthetic",
    runtimeConfig: { ...getRuntimeConfig(root), enableMcpTools: true },
  };
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-mcp-prompts-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  log = path.join(root, "protocol.jsonl");
  fs.writeFileSync(path.join(root, ".cheers.mcp.json"), JSON.stringify({
    mcpServers: { local: { transport: "stdio", command: process.execPath,
      args: [path.resolve("src/core/mcp/fixtures/mockMcpServer.mjs"), "--log", log] } },
  }));
  gateway = new CoreMcpGateway(root);
});
afterEach(async () => {
  await gateway.close();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it("shares the command gateway across two prompt bridges without per-turn shutdown", async () => {
  await gateway.snapshot();
  for (const prompt of ["one", "two"]) {
    const run = streamCliRuntimePrompt({
      ...input(), prompt, mcpGateway: gateway,
      providerRuntimeBridge: { providerModeEnv: () => "synthetic" } as never,
    });
    const events = [];
    for await (const event of run.events) events.push(event);
    expect(events.at(-1)?.type).toBe("query.completed");
    expect(starts()).toHaveLength(1);
    expect(alive(starts()[0]!)).toBe(true);
  }
  await gateway.close();
  expect(alive(starts()[0]!)).toBe(false);
});

it("closes an invocation-owned gateway when consumption ends early", async () => {
  const run = await runCliRuntimeInvocation(input());
  for await (const _event of run.events) break;
  expect(starts()).toHaveLength(1);
  expect(alive(starts()[0]!)).toBe(false);
});

it("closes an invocation-owned gateway if turn setup throws after discovery", async () => {
  await expect(runCliRuntimeInvocation(input(), {
    tools: () => { throw new Error("setup failed"); },
  })).rejects.toThrow("setup failed");
  expect(starts()).toHaveLength(1);
  expect(alive(starts()[0]!)).toBe(false);
});


it.each([["SIGTERM", 143], ["SIGHUP", 129], ["SIGINT", 130]] as const)(
  "observes child exit before completing %s and removes signal handlers", async (signal, code) => {
    await gateway.snapshot();
    const events = new EventEmitter();
    const exits: number[] = [];
    const done = new Promise<void>(resolve => {
      createCliShutdown({
        close: () => gateway.close(), process: events as NodeJS.Process, handleInterrupt: true,
        writeError: message => { throw new Error(message); },
        exit: status => {
          expect(alive(starts()[0]!)).toBe(false);
          exits.push(status);
          resolve();
        },
      });
    });
    events.emit(signal);
    events.emit(signal);
    await done;
    expect(exits).toEqual([code]);
    expect(events.listenerCount(signal)).toBe(0);
  },
);


it.each([false, true])("keeps output errors authoritative while cleanup is pending (clean exit first: %s)", async (cleanFirst) => {
  await gateway.snapshot();
  const events = new EventEmitter();
  const output = new EventEmitter();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const statuses: number[] = [];
  let shutdown!: ReturnType<typeof createCliShutdown>;
  const done = new Promise<void>(resolve => {
    shutdown = createCliShutdown({
      close: async () => { await held; await gateway.close(); },
      process: events as NodeJS.Process, streams: [output],
      writeError: () => {}, exit: code => {
        expect(alive(starts()[0]!)).toBe(false);
        statuses.push(code); resolve();
      },
    });
  });
  if (cleanFirst) shutdown.exit(0);
  output.emit("error", Object.assign(new Error("device gone"), { code: "EIO" }));
  output.emit("error", Object.assign(new Error("pipe gone"), { code: "EPIPE" }));
  expect(statuses).toEqual([]);
  release();
  await done;
  expect(statuses).toEqual([1]);
  expect(output.listenerCount("error")).toBe(0);
});
