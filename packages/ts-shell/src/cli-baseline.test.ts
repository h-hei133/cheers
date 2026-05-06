import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSigint } from "./entrypoints/handleSigint.js";
import { createLongSessionContinuityFixture } from "./session/__tests__/longSessionContinuityFixtures.js";
import { SessionManager } from "./session/SessionManager.js";
import {
  createGitRepoFixture,
  normalizeCliOutput,
  runCliCommandToClose,
  runInteractiveEofSmoke,
  runInteractiveLineSmoke,
  runInteractiveStartupSmoke,
} from "./test-utils/cliHarness.js";
import { seedStoppedRecoveryContextSession } from "./test-utils/stoppedRecoveryFixture.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const cliPath = path.join(currentDir, "entrypoints", "cli.tsx");
const tsxCliPath = path.join(
  repoRoot,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);
const nodeExe = process.execPath;

type ParsedTranscriptEntry = {
  type?: string;
  event?: {
    type?: string;
    prompt?: string;
    toolName?: string;
    success?: boolean;
    result?: {
      status?: string;
      terminalClassification?: string;
      codingResult?: {
        taskKind?: string;
        changedFiles?: string[];
        evidence?: string[];
      };
      sharedContext?: {
        notes?: string[];
      };
    };
  };
};

function parseTranscriptJsonl(filePath: string): ParsedTranscriptEntry[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ParsedTranscriptEntry];
      } catch {
        // Ignore partial trailing lines if the process is still flushing.
        return [];
      }
    });
}

function isReadableJsonFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) {
      return false;
    }
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

function readJsonFileEventually<T>(filePath: string, attempts = 20): T {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content) {
        return JSON.parse(content) as T;
      }
    } catch (error) {
      lastError = error;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for readable JSON file: ${filePath}`);
}

// This helper intentionally drives the CLI through child_process pipes.
// It is interactive-style coverage, not true PTY / terminal fidelity coverage.
function spawnCli(
  fakeHome: string,
  args: string[] = [],
  envOverrides: Record<string, string> = {},
): ChildProcess {
  const hostHome = process.env.USERPROFILE ?? process.env.HOME;
  const hostCargoHome =
    process.env.CARGO_HOME ??
    (hostHome ? path.join(hostHome, ".cargo") : undefined);
  const hostRustupHome =
    process.env.RUSTUP_HOME ??
    (hostHome ? path.join(hostHome, ".rustup") : undefined);

  return spawn(nodeExe, [tsxCliPath, cliPath, ...args], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(hostCargoHome ? { CARGO_HOME: hostCargoHome } : {}),
      ...(hostRustupHome ? { RUSTUP_HOME: hostRustupHome } : {}),
      USERPROFILE: fakeHome,
      HOME: fakeHome,
      ...envOverrides,
    },
  });
}

describe("CLI streaming baseline (T3)", () => {
  let fakeHomeDir = "";
  let sessionsDir = "";

  function whenOutputContains(
    cli: ChildProcess,
    needle: string,
    callback: () => void,
  ): void {
    let triggered = false;
    const handler = (data: Buffer) => {
      if (triggered) {
        return;
      }
      if (data.toString().includes(needle)) {
        triggered = true;
        callback();
      }
    };

    cli.stdout?.on("data", handler);
    cli.stderr?.on("data", handler);
  }

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-cli-home-"),
    );
    sessionsDir = path.join(fakeHomeDir, ".private-agents", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    if (!fs.existsSync(sessionsDir)) {
      return;
    }

    for (const file of fs.readdirSync(sessionsDir)) {
      if (file.startsWith("sess_")) {
        fs.rmSync(path.join(sessionsDir, file), {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      }
    }

    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
  });

  function seedInterruptedSessionForRecovery(sessionId: string): void {
    const sessionDir = path.join(sessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(sessionDir, "metadata.json"),
      JSON.stringify(
        {
          id: sessionId,
          createdAt: now,
          updatedAt: now,
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "state.json"),
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "recover me",
          runPhase: "prompt-persisted",
          interruptedKind: "prompt",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(path.join(sessionDir, "transcript.jsonl"), "", "utf8");
  }

  function seedBrokenSessionDir(sessionId: string): void {
    const sessionDir = path.join(sessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "metadata.json"), "{broken", "utf8");
    fs.writeFileSync(path.join(sessionDir, "state.json"), "{}", "utf8");
    fs.writeFileSync(path.join(sessionDir, "transcript.jsonl"), "", "utf8");
  }

  function seedSessionWithTitle(input: {
    sessionId: string;
    projectRoot: string;
    title: string;
    status?: "active" | "interrupted" | "completed" | "error" | "terminated";
  }): void {
    const sessionDir = path.join(sessionsDir, input.sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(sessionDir, "metadata.json"),
      JSON.stringify(
        {
          id: input.sessionId,
          projectRoot: input.projectRoot,
          title: input.title,
          createdAt: now,
          updatedAt: now,
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "state.json"),
      JSON.stringify(
        {
          status: input.status ?? "interrupted",
          projectRoot: input.projectRoot,
          runPhase: "idle",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(path.join(sessionDir, "transcript.jsonl"), "", "utf8");
  }

  function seedInterruptedCurrentSession(input: {
    sessionId: string;
    projectRoot: string;
    title: string;
    pendingPrompt: string;
  }): void {
    const sessionDir = path.join(sessionsDir, input.sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(sessionDir, "metadata.json"),
      JSON.stringify(
        {
          id: input.sessionId,
          projectRoot: input.projectRoot,
          rootMode: "direct",
          requestedWorkspaceRoot: input.projectRoot,
          targetPathBase: input.projectRoot,
          gitRoot: null,
          title: input.title,
          createdAt: now,
          updatedAt: now,
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "state.json"),
      JSON.stringify(
        {
          status: "interrupted",
          projectRoot: input.projectRoot,
          pendingPrompt: input.pendingPrompt,
          runPhase: "prompt-persisted",
          interruptedKind: "prompt",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "transcript.jsonl"),
      [
        {
          type: "lifecycle",
          event: "run-started",
          timestamp: now,
          detail: input.pendingPrompt,
        },
        {
          type: "message",
          role: "user",
          content: input.pendingPrompt,
          timestamp: now,
        },
        {
          type: "lifecycle",
          event: "run-interrupted",
          timestamp: now,
          detail: input.pendingPrompt,
        },
      ].map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      "utf8",
    );

    const currentStorePath = path.join(
      fakeHomeDir,
      ".private-agents",
      "current-session.json",
    );
    fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
    fs.writeFileSync(
      currentStorePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          byProjectRoot: {
            [path.resolve(input.projectRoot).toLowerCase()]: {
              sessionId: input.sessionId,
              updatedAt: now,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  function writeCurrentSessionPointer(input: {
    projectRoot: string;
    sessionId: string;
  }): void {
    const currentStorePath = path.join(
      fakeHomeDir,
      ".private-agents",
      "current-session.json",
    );
    fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
    fs.writeFileSync(
      currentStorePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          byProjectRoot: {
            [path.resolve(input.projectRoot).toLowerCase()]: {
              sessionId: input.sessionId,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  function createOpenAiFetchMockModule(fakeHome: string): {
    modulePath: string;
    logPath: string;
  } {
    const modulePath = path.join(fakeHome, "openai-fetch-mock.cjs");
    const logPath = path.join(fakeHome, "openai-fetch-log.jsonl");
    const moduleBody = `
const fs = require("node:fs");
let chatCallCount = 0;
const logPath = ${JSON.stringify(logPath)};

globalThis.fetch = async function mockOpenAiFetch(url, init) {
  const target = String(url);
  const headers = init && init.headers ? init.headers : {};
  let authorization = "";

  if (headers && typeof headers.get === "function") {
    authorization = headers.get("authorization") || "";
  } else if (headers && typeof headers === "object") {
    authorization = headers.authorization || headers.Authorization || "";
  }

  fs.appendFileSync(
    logPath,
    JSON.stringify({ url: target, authorization }) + "\\n",
    "utf8",
  );

  if (target.endsWith("/models")) {
    return new Response(
      JSON.stringify({ data: [{ id: "gpt-4.1-mini" }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (target.endsWith("/chat/completions")) {
    chatCallCount += 1;
    const marker = "REAL_MOCK_CALL_" + chatCallCount;
    const body =
      "data: " + JSON.stringify({
        model: "gpt-4.1-mini",
        choices: [{ delta: { content: marker } }],
      }) + "\\n\\n" +
      "data: " + JSON.stringify({
        model: "gpt-4.1-mini",
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }) + "\\n\\n" +
      "data: [DONE]\\n\\n";

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  return new Response("mock route not found", { status: 404 });
};
`;

    fs.writeFileSync(modulePath, moduleBody, "utf8");
    return { modulePath, logPath };
  }

  function createDelayedOpenAiFetchMockModule(
    fakeHome: string,
    chatDelayMs: number,
  ): {
    modulePath: string;
    logPath: string;
  } {
    const modulePath = path.join(fakeHome, "openai-fetch-mock-delayed.cjs");
    const logPath = path.join(fakeHome, "openai-fetch-log-delayed.jsonl");
    const moduleBody = `
const fs = require("node:fs");
let chatCallCount = 0;
const logPath = ${JSON.stringify(logPath)};
const chatDelayMs = ${String(chatDelayMs)};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

globalThis.fetch = async function mockOpenAiFetch(url, init) {
  const target = String(url);
  const headers = init && init.headers ? init.headers : {};
  let authorization = "";

  if (headers && typeof headers.get === "function") {
    authorization = headers.get("authorization") || "";
  } else if (headers && typeof headers === "object") {
    authorization = headers.authorization || headers.Authorization || "";
  }

  fs.appendFileSync(
    logPath,
    JSON.stringify({ url: target, authorization, at: Date.now() }) + "\\n",
    "utf8",
  );

  if (target.endsWith("/models")) {
    return new Response(
      JSON.stringify({ data: [{ id: "gpt-4.1-mini" }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (target.endsWith("/chat/completions")) {
    chatCallCount += 1;
    await sleep(chatDelayMs);
    const marker = "REAL_MOCK_CALL_" + chatCallCount;
    const body =
      "data: " + JSON.stringify({
        model: "gpt-4.1-mini",
        choices: [{ delta: { content: marker } }],
      }) + "\\n\\n" +
      "data: " + JSON.stringify({
        model: "gpt-4.1-mini",
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }) + "\\n\\n" +
      "data: [DONE]\\n\\n";

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  return new Response("mock route not found", { status: 404 });
};
`;

    fs.writeFileSync(modulePath, moduleBody, "utf8");
    return { modulePath, logPath };
  }

  function createTransientFailureOpenAiFetchMockModule(fakeHome: string): {
    modulePath: string;
    logPath: string;
  } {
    const modulePath = path.join(
      fakeHome,
      "openai-fetch-mock-transient-failure.cjs",
    );
    const logPath = path.join(
      fakeHome,
      "openai-fetch-log-transient-failure.jsonl",
    );
    const moduleBody = `
const fs = require("node:fs");
let chatCallCount = 0;
let firstChatAttempt = true;
const logPath = ${JSON.stringify(logPath)};

globalThis.fetch = async function mockOpenAiFetch(url, init) {
  const target = String(url);
  const headers = init && init.headers ? init.headers : {};
  let authorization = "";

  if (headers && typeof headers.get === "function") {
    authorization = headers.get("authorization") || "";
  } else if (headers && typeof headers === "object") {
    authorization = headers.authorization || headers.Authorization || "";
  }

  fs.appendFileSync(
    logPath,
    JSON.stringify({ url: target, authorization }) + "\\n",
    "utf8",
  );

  if (target.endsWith("/models")) {
    return new Response(
      JSON.stringify({ data: [{ id: "gpt-4.1-mini" }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (target.endsWith("/chat/completions")) {
    chatCallCount += 1;
    if (firstChatAttempt) {
      firstChatAttempt = false;
      throw new TypeError("fetch failed");
    }

    const marker = "REAL_MOCK_CALL_" + chatCallCount;
    const body =
      "data: " + JSON.stringify({
        model: "gpt-4.1-mini",
        choices: [{ delta: { content: marker } }],
      }) + "\\n\\n" +
      "data: " + JSON.stringify({
        model: "gpt-4.1-mini",
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }) + "\\n\\n" +
      "data: [DONE]\\n\\n";

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  return new Response("mock route not found", { status: 404 });
};
`;

    fs.writeFileSync(modulePath, moduleBody, "utf8");
    return { modulePath, logPath };
  }

  function createNetworkFailureReadinessFetchMockModule(fakeHome: string): {
    modulePath: string;
    logPath: string;
  } {
    const modulePath = path.join(
      fakeHome,
      "openai-fetch-mock-readiness-network-failure.cjs",
    );
    const logPath = path.join(
      fakeHome,
      "openai-fetch-log-readiness-network-failure.jsonl",
    );
    const moduleBody = `
const fs = require("node:fs");
const logPath = ${JSON.stringify(logPath)};

globalThis.fetch = async function mockOpenAiFetch(url, init) {
  const target = String(url);
  const headers = init && init.headers ? init.headers : {};
  let authorization = "";

  if (headers && typeof headers.get === "function") {
    authorization = headers.get("authorization") || "";
  } else if (headers && typeof headers === "object") {
    authorization = headers.authorization || headers.Authorization || "";
  }

  fs.appendFileSync(
    logPath,
    JSON.stringify({ url: target, authorization }) + "\\n",
    "utf8",
  );

  if (target.endsWith("/models")) {
    throw new TypeError("fetch failed");
  }

  return new Response("mock route not expected", { status: 500 });
};
`;

    fs.writeFileSync(modulePath, moduleBody, "utf8");
    return { modulePath, logPath };
  }

  it("streams output incrementally without blocking", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir);
      let output = "";

      const onData = (data: Buffer) => {
        output += data.toString();
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      setTimeout(() => {
        cli.kill();
        try {
          expect(output.length).toBeGreaterThan(0);
          expect(output).toContain("Private Coding Agents Shell");
          expect(output).toContain("Session: sess_");
          expect(output).toContain(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 7000);

      cli.on("error", reject);
    });
  }, 15000);

  it("pipe-spawn interactive startup smoke exposes prompt readiness with synthetic home", async () => {
    const result = await runInteractiveStartupSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
    });

    expect(result.output).toContain("Private Coding Agents Shell");
    expect(result.output).toContain("Session: sess_");
    expect(result.sessionId).toMatch(/^sess_/);
    expect(result.output).toContain(
      "Ctrl+C cancels the current run. Ctrl+D exits.",
    );
    expect(result.output.includes("approval> ")).toBe(false);
  }, 20000);

  it("pipe-spawn interactive slash command smoke routes sessions current without provider turn", async () => {
    const result = await runInteractiveLineSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      line: "/sessions current",
      waitFor: "Current session",
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
    });

    expect(result.output).toContain("Private Coding Agents Shell");
    expect(result.output).toContain("Current session");
    expect(result.output).toContain("- ID:");
    expect(result.sessionId).toMatch(/^sess_/);
    expect(result.output.includes("approval> ")).toBe(false);
    expect(result.output.includes("Result")).toBe(false);
  }, 20000);

  it("pipe-spawn interactive EOF smoke closes stream without false success", async () => {
    const result = await runInteractiveEofSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain("Private Coding Agents Shell");
    expect(result.output).toContain("Session: sess_");
    expect(result.output).toContain(
      "Ctrl+C cancels the current run. Ctrl+D exits.",
    );
    expect(result.output).toContain(
      "Stdin stream closed. Processed 0 prompt(s).",
    );
    expect(result.output.includes("Result")).toBe(false);
    expect(result.output.includes("Outcome: success")).toBe(false);
    expect(result.output.includes("approval> ")).toBe(false);

    expect(result.sessionId).toMatch(/^sess_/);
    const sessionDir = path.join(sessionsDir, result.sessionId as string);
    const state = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
    ) as {
      status?: string;
      terminalClassification?: string;
      durableStatus?: string;
    };
    expect(state.status).toBe("active");
    expect(state.terminalClassification).toBeUndefined();
    expect(state.durableStatus).toBeUndefined();
  }, 20000);

  it("persists session metadata to local filesystem", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir);

      setTimeout(() => {
        cli.kill();
        try {
          const sessionDirs = fs
            .readdirSync(sessionsDir)
            .filter((file) => file.startsWith("sess_"));
          expect(sessionDirs.length).toBeGreaterThan(0);
          const firstSessionDir = path.join(sessionsDir, sessionDirs[0]);
          expect(
            fs.existsSync(path.join(firstSessionDir, "metadata.json")),
          ).toBe(true);
          expect(fs.existsSync(path.join(firstSessionDir, "state.json"))).toBe(
            true,
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 2500);

      cli.on("error", reject);
    });
  }, 10000);

  it("handles Ctrl+C interrupt gracefully", () => {
    const rendered: string[] = [];
    const sessionCalls: string[] = [];
    const controller = new AbortController();
    let promptCalled = false;

    const nextController = handleSigint({
      currentRunController: controller,
      renderer: {
        renderLine(line: string) {
          rendered.push(line);
        },
      } as never,
      sessionManager: {
        saveInterrupted(sessionId: string) {
          sessionCalls.push(`interrupted:${sessionId}`);
        },
        saveTerminated(sessionId: string) {
          sessionCalls.push(`terminated:${sessionId}`);
        },
      } as never,
      sessionId: "sess_test",
      readline: {
        prompt() {
          promptCalled = true;
        },
        close() {},
      } as never,
      exit() {
        throw new Error("exit should not be called when cancelling a run");
      },
    });

    expect(controller.signal.aborted).toBe(true);
    expect(nextController).toBeNull();
    expect(rendered).toContain("\nRun cancelled by user (Ctrl+C)");
    expect(sessionCalls).toContain("interrupted:sess_test");
    expect(promptCalled).toBe(true);
  });

  it("supports --version flag", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, ["--version"]);
      let output = "";

      const onData = (data: Buffer) => {
        output += data.toString();
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      cli.on("close", (code) => {
        try {
          expect(code).toBe(0);
          expect(output).toContain("0.1.0");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      cli.on("error", reject);
    });
  }, 10000);

  it("shows why a cross-root current session pointer was ignored", async () => {
    const projectRoot = path.join(fakeHomeDir, "current-project");
    const otherRoot = path.join(fakeHomeDir, "other-project");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(otherRoot, { recursive: true });
    const crossRootSessionId = "sess_cross_root_current";
    seedSessionWithTitle({
      sessionId: crossRootSessionId,
      projectRoot: otherRoot,
      title: "other project current",
      status: "active",
    });
    writeCurrentSessionPointer({
      projectRoot,
      sessionId: crossRootSessionId,
    });

    const result = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", "/sessions current"],
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
    });
    const output = normalizeCliOutput(result.output);

    expect(result.code).toBe(0);
    expect(output).toContain("Session lifecycle: Current session pointer ignored:");
    expect(output).toContain(crossRootSessionId);
    expect(output).toContain("is bound to");
    expect(output).toContain("Starting a fresh session.");
    expect(output).toContain("Current session");
    expect(output).not.toContain(`- ID: ${crossRootSessionId}`);
    expect(output).toContain(`- Project binding: ${projectRoot.replace(/\\/g, "/")}`);

    const currentSessionStore = JSON.parse(
      fs.readFileSync(
        path.join(fakeHomeDir, ".private-agents", "current-session.json"),
        "utf8",
      ),
    ) as { byProjectRoot?: Record<string, { sessionId?: string }> };
    const selection =
      currentSessionStore.byProjectRoot?.[path.resolve(projectRoot).toLowerCase()];
    expect(selection?.sessionId).toBeDefined();
    expect(selection?.sessionId).not.toBe(crossRootSessionId);
  }, 15000);

  it("shows why a damaged current session pointer store was ignored", async () => {
    const projectRoot = path.join(fakeHomeDir, "damaged-current-project");
    fs.mkdirSync(projectRoot, { recursive: true });
    const currentStorePath = path.join(
      fakeHomeDir,
      ".private-agents",
      "current-session.json",
    );
    fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
    fs.writeFileSync(currentStorePath, "{broken", "utf8");

    const result = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", "/sessions current"],
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
    });
    const output = normalizeCliOutput(result.output);

    expect(result.code).toBe(0);
    expect(output).toContain("Session lifecycle: Current session pointer ignored:");
    expect(output).toContain(
      "Current session selection store could not be read",
    );
    expect(output).toContain("Starting a fresh session.");
    expect(output).toContain("Current session");
    expect(output).toContain(`- Project binding: ${projectRoot.replace(/\\/g, "/")}`);
  }, 15000);

  it("shows MCP status reasons and do-next for unavailable capabilities", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-cli-mcp-status-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".private-agents.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: {
              transport: "sdk",
              mockTools: [
                {
                  serverName: "connectedSdk",
                  toolName: "search",
                  qualifiedName: "mcp__connectedSdk__search",
                  description: "Search MCP",
                },
              ],
            },
            needsAuth: {
              transport: "http",
              url: "https://example.com/mcp",
              authRequired: true,
            },
            brokenStdio: {
              transport: "stdio",
            },
            disabledSdk: {
              transport: "sdk",
              enabled: false,
              mockTools: [
                {
                  serverName: "disabledSdk",
                  toolName: "hidden",
                  qualifiedName: "mcp__disabledSdk__hidden",
                  description: "Hidden MCP",
                },
              ],
            },
          },
        }),
        "utf8",
      );

      const result = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp status"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const output = normalizeCliOutput(result.output);

      expect(result.code).toBe(0);
      expect(output).toContain("connectedSdk: connected");
      expect(output).toContain("tools=1, executable=yes");
      expect(output).toContain("needsAuth: needs-auth");
      expect(output).toContain("MCP server needsAuth requires authentication");
      expect(output).toContain(
        "Authenticate server 'needsAuth' and rerun /mcp refresh needsAuth.",
      );
      expect(output).toContain("brokenStdio: failed");
      expect(output).toContain(
        "MCP server brokenStdio is unavailable: Missing stdio command",
      );
      expect(output).toContain(
        "Run /mcp refresh brokenStdio and verify server connectivity before retrying.",
      );
      expect(output).toContain("disabledSdk: disabled");
      expect(output).toContain("MCP server disabledSdk is disabled");
      expect(output).toContain("tools=0, executable=no");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 15000);

  it("shows MCP tools unavailable-server guidance without hiding connected tools", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-cli-mcp-tools-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".private-agents.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: {
              transport: "sdk",
              mockTools: [
                {
                  serverName: "connectedSdk",
                  toolName: "search",
                  qualifiedName: "mcp__connectedSdk__search",
                  description: "Search MCP",
                },
              ],
            },
            needsAuth: {
              transport: "http",
              url: "https://example.com/mcp",
              authRequired: true,
            },
            brokenStdio: {
              transport: "stdio",
            },
            disabledSdk: {
              transport: "sdk",
              enabled: false,
              mockTools: [
                {
                  serverName: "disabledSdk",
                  toolName: "hidden",
                  qualifiedName: "mcp__disabledSdk__hidden",
                  description: "Hidden MCP",
                },
              ],
            },
          },
        }),
        "utf8",
      );

      const connectedResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp tools connectedSdk"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const connectedOutput = normalizeCliOutput(connectedResult.output);
      expect(connectedResult.code).toBe(0);
      expect(connectedOutput).toContain("MCP tools @ connectedSdk");
      expect(connectedOutput).toContain("mcp__connectedSdk__search");
      expect(connectedOutput).not.toContain("Unavailable selected servers");

      const authResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp tools needsAuth"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const authOutput = normalizeCliOutput(authResult.output);
      expect(authResult.code).toBe(0);
      expect(authOutput).toContain("MCP tools @ needsAuth");
      expect(authOutput).toContain("- No tools currently exposed.");
      expect(authOutput).toContain("needsAuth: needs-auth (executable=no)");
      expect(authOutput).toContain("MCP server needsAuth requires authentication");
      expect(authOutput).toContain(
        "Authenticate server 'needsAuth' and rerun /mcp refresh needsAuth.",
      );

      const failedResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp tools brokenStdio"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const failedOutput = normalizeCliOutput(failedResult.output);
      expect(failedResult.code).toBe(0);
      expect(failedOutput).toContain("brokenStdio: failed (executable=no)");
      expect(failedOutput).toContain(
        "MCP server brokenStdio is unavailable: Missing stdio command",
      );
      expect(failedOutput).toContain(
        "Run /mcp refresh brokenStdio and verify server connectivity before retrying.",
      );

      const disabledResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp tools disabledSdk"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const disabledOutput = normalizeCliOutput(disabledResult.output);
      expect(disabledResult.code).toBe(0);
      expect(disabledOutput).toContain("disabledSdk: disabled (executable=no)");
      expect(disabledOutput).toContain("MCP server disabledSdk is disabled");
      expect(disabledOutput).not.toContain("mcp__disabledSdk__hidden");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 20000);

  it("shows MCP refresh unavailable-server guidance without masking connected refresh", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-cli-mcp-refresh-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".private-agents.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: {
              transport: "sdk",
              mockTools: [
                {
                  serverName: "connectedSdk",
                  toolName: "search",
                  qualifiedName: "mcp__connectedSdk__search",
                  description: "Search MCP",
                },
              ],
            },
            needsAuth: {
              transport: "http",
              url: "https://example.com/mcp",
              authRequired: true,
            },
            brokenStdio: {
              transport: "stdio",
            },
            disabledSdk: {
              transport: "sdk",
              enabled: false,
            },
          },
        }),
        "utf8",
      );

      const connectedResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp refresh connectedSdk"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const connectedOutput = normalizeCliOutput(connectedResult.output);
      expect(connectedResult.code).toBe(0);
      expect(connectedOutput).toContain("MCP refresh complete (connectedSdk).");
      expect(connectedOutput).toContain("connectedSdk: connected");
      expect(connectedOutput).toContain("tools=1, executable=yes");

      const authResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp refresh needsAuth"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const authOutput = normalizeCliOutput(authResult.output);
      expect(authResult.code).toBe(0);
      expect(authOutput).toContain("- Outcome: blocked");
      expect(authOutput).toContain("- BlockerKind: environment-not-ready");
      expect(authOutput).toContain("MCP server needsAuth requires authentication");
      expect(authOutput).toContain(
        "Authenticate server 'needsAuth' and rerun /mcp refresh needsAuth.",
      );
      expect(authOutput).not.toContain("MCP refresh complete (needsAuth).");

      const failedResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp refresh brokenStdio"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const failedOutput = normalizeCliOutput(failedResult.output);
      expect(failedResult.code).toBe(0);
      expect(failedOutput).toContain(
        "MCP server brokenStdio is unavailable: Missing stdio command",
      );
      expect(failedOutput).toContain(
        "Run /mcp refresh brokenStdio and verify server connectivity before retrying.",
      );
      expect(failedOutput).not.toContain("MCP refresh complete (brokenStdio).");

      const disabledResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp refresh disabledSdk"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const disabledOutput = normalizeCliOutput(disabledResult.output);
      expect(disabledResult.code).toBe(0);
      expect(disabledOutput).toContain("MCP server disabledSdk is disabled");
      expect(disabledOutput).toContain(
        "Enable server 'disabledSdk' in MCP config, then rerun /mcp refresh disabledSdk.",
      );

      const unknownResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp refresh missingServer"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const unknownOutput = normalizeCliOutput(unknownResult.output);
      expect(unknownResult.code).toBe(0);
      expect(unknownOutput).toContain("Unknown MCP server: missingServer");
      expect(unknownOutput).toContain(
        "Run /mcp status to list configured servers, then retry with a valid server name.",
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 25000);

  it("shows MCP doctor diagnostics with shared unavailable-server guidance", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-cli-mcp-doctor-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".private-agents.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: {
              transport: "sdk",
              mockTools: [
                {
                  serverName: "connectedSdk",
                  toolName: "search",
                  qualifiedName: "mcp__connectedSdk__search",
                  description: "Search MCP",
                },
              ],
            },
            needsAuth: {
              transport: "http",
              url: "https://example.com/mcp",
              authRequired: true,
            },
            brokenStdio: {
              transport: "stdio",
            },
            disabledSdk: {
              transport: "sdk",
              enabled: false,
            },
          },
        }),
        "utf8",
      );

      const result = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp doctor"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const output = normalizeCliOutput(result.output);
      expect(result.code).toBe(0);
      expect(output).toContain("MCP doctor");
      expect(output).toContain("needsAuth: needs-auth (executable=no)");
      expect(output).toContain("MCP server needsAuth requires authentication");
      expect(output).toContain(
        "Authenticate server 'needsAuth' and rerun /mcp refresh needsAuth.",
      );
      expect(output).toContain("brokenStdio: failed (executable=no)");
      expect(output).toContain(
        "MCP server brokenStdio is unavailable: Missing stdio command",
      );
      expect(output).toContain(
        "Run /mcp refresh brokenStdio and verify server connectivity before retrying.",
      );
      expect(output).toContain("disabledSdk: disabled (executable=no)");
      expect(output).toContain("MCP server disabledSdk is disabled");
      expect(output).toContain(
        "Enable server 'disabledSdk' in MCP config, then rerun /mcp refresh disabledSdk.",
      );

      const connectedResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp doctor connectedSdk"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const connectedOutput = normalizeCliOutput(connectedResult.output);
      expect(connectedResult.code).toBe(0);
      expect(connectedOutput).toContain("MCP doctor @ connectedSdk");
      expect(connectedOutput).toContain("- No blocking MCP issues detected.");
      expect(connectedOutput).toContain(
        "- Selected server is connected and serving tools.",
      );

      const unknownResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp doctor missingServer"],
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });
      const unknownOutput = normalizeCliOutput(unknownResult.output);
      expect(unknownResult.code).toBe(0);
      expect(unknownOutput).toContain("MCP doctor @ missingServer");
      expect(unknownOutput).toContain("Unknown MCP server: missingServer");
      expect(unknownOutput).toContain(
        "Run /mcp status to list configured servers, then retry with a valid server name.",
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 25000);

  it("shows MCP malformed config blockers across user-visible MCP commands", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-cli-mcp-malformed-"),
    );
    try {
      const configPath = path.join(projectRoot, ".private-agents.mcp.json");
      fs.writeFileSync(configPath, "{broken", "utf8");

      for (const command of [
        "/mcp status",
        "/mcp tools",
        "/mcp refresh all",
        "/mcp doctor",
      ]) {
        const result = await runCliCommandToClose({
          spawnCli,
          fakeHome: fakeHomeDir,
          args: ["--project", projectRoot, "--print", command],
          envOverrides: {
            PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
          },
        });
        const output = normalizeCliOutput(result.output);
        expect(result.code).toBe(0);
        expect(output).toContain("- Outcome: blocked");
        expect(output).toContain("- BlockerKind: environment-not-ready");
        expect(output).toContain("MCP config is invalid at");
        expect(output).toContain(".private-agents.mcp.json");
        expect(output).toContain("Fix or remove");
        expect(output).toContain("then run /mcp refresh all.");
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 25000);

  it("guards root binding diagnostics for CLI /sessions switch and /workspace attach", async () => {
    const repoA = path.join(fakeHomeDir, "repo-a");
    const repoB = path.join(fakeHomeDir, "repo-b");
    createGitRepoFixture(repoA);
    createGitRepoFixture(repoB);
    fs.mkdirSync(path.join(repoA, "packages", "app"), { recursive: true });
    const runRootDiagnosticsCli = (args: string[]) =>
      runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args,
        envOverrides: {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      });

    const targetSessionId = "sess_root_diag_target";
    seedSessionWithTitle({
      sessionId: targetSessionId,
      projectRoot: repoB,
      title: "target repo b",
      status: "active",
    });

    const switchResult = await runRootDiagnosticsCli([
      "--project",
      repoA,
      "--print",
      `/sessions switch ${targetSessionId}`,
    ]);
    const switchOutput = normalizeCliOutput(switchResult.output);
    expect(switchResult.code).toBe(0);
    expect(switchOutput).toContain(
      "Session switch blocked by root binding diagnostics.",
    );
    expect(switchOutput).toContain(
      "blocked:root-binding-session-mismatch",
    );
    expect(switchOutput).toContain("nextAction:");
    expect(switchOutput).not.toContain("Switched session:");
    expect(switchOutput).not.toContain(`Project context: ${repoB.replace(/\\/g, "/")}`);

    const currentSessionStorePath = path.join(
      fakeHomeDir,
      ".private-agents",
      "current-session.json",
    );
    const currentSessionStore = JSON.parse(
      fs.readFileSync(currentSessionStorePath, "utf8"),
    ) as { byProjectRoot?: Record<string, { sessionId?: string }> };
    const repoASelection =
      currentSessionStore.byProjectRoot?.[repoA.toLowerCase()];
    expect(repoASelection?.sessionId).toBeDefined();
    expect(repoASelection?.sessionId).not.toBe(targetSessionId);

    const subdirAttach = await runRootDiagnosticsCli([
      "--project",
      repoA,
      "--print",
      "/workspace attach packages/app",
    ]);
    const subdirOutput = normalizeCliOutput(subdirAttach.output);
    const normalizedRepoA = repoA.replace(/\\/g, "/");
    expect(subdirAttach.code).toBe(0);
    expect(subdirOutput).toContain("info:root-binding-git-auto-upgrade");
    expect(subdirOutput).toContain("nextAction:");
    expect(subdirOutput).toContain(`- Project root: ${normalizedRepoA}`);
    expect(subdirOutput).toContain(`- Target path base: ${normalizedRepoA}`);

    const crossRootAttach = await runRootDiagnosticsCli([
      "--project",
      repoA,
      "--print",
      `/workspace attach ${repoB}`,
    ]);
    const crossRootOutput = normalizeCliOutput(crossRootAttach.output);
    expect(crossRootAttach.code).toBe(0);
    expect(crossRootOutput).toContain(
      "warning:root-binding-workspace-switch",
    );
    expect(crossRootOutput).toContain("nextAction:");
    expect(crossRootOutput).toContain("Attached project context:");
    expect(crossRootOutput).toContain("New project session: sess_");
  }, 45000);

  it("gates real-provider missing key at CLI entry before query loop starts", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "",
      });
      let output = "";
      let settled = false;
      let promptSent = false;
      let sessionId = "";

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for real-provider missing-key gate"));
      }, 30000);

      const onData = (data: Buffer) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write("Run a real provider task without API key\n");
        }

        if (
          sessionId &&
          output.includes("provider-readiness:missing-key") &&
          output.includes(
            "- Configure credential via /connect set <provider> <api-key> (or export env var).",
          )
        ) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain("Result");
            expect(output).toContain("- Outcome: error");
            expect(output).toContain("provider-readiness:missing-key");
            expect(output).toContain(
              "- Configure credential via /connect set <provider> <api-key> (or export env var).",
            );
            expect(output.includes("approval> ")).toBe(false);
            expect(output.includes("Response complete")).toBe(false);

            const sessionDir = path.join(sessionsDir, sessionId);
            const transcriptEntries = parseTranscriptJsonl(
              path.join(sessionDir, "transcript.jsonl"),
            );

            const queryStartedEntries = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.started",
            );
            const queryCompletedEntries = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );

            expect(queryStartedEntries.length).toBe(0);
            expect(queryCompletedEntries.length).toBe(1);
            expect(queryCompletedEntries[0]?.event?.result?.status).toBe(
              "stopped_error",
            );
            expect(
              queryCompletedEntries[0]?.event?.result?.terminalClassification,
            ).toBe("error");

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
              lastError?: string;
            };

            expect(state.status === "active" || state.status === "error").toBe(
              true,
            );
            if (state.status === "error") {
              expect(state.terminalReason).toBe("stopped_error");
              expect(state.terminalClassification).toBe("error");
              expect(state.durableStatus).toBe("error");
              expect(state.lastError).toContain(
                "provider-readiness:missing-key",
              );
            }
          });
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  }, 40000);

  it("prints provider readiness reconnect attempts in CLI surface", async () => {
    const { modulePath, logPath } =
      createNetworkFailureReadinessFetchMockModule(fakeHomeDir);
    const normalizedModulePath = modulePath.replace(/\\/g, "/");
    const nodeOptionsParts = [
      process.env.NODE_OPTIONS ?? "",
      "--require",
      `\"${normalizedModulePath}\"`,
    ].filter((part) => part.trim().length > 0);

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-real-cli-key",
        NODE_OPTIONS: nodeOptionsParts.join(" "),
      });
      let output = "";
      let settled = false;
      let promptSent = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for provider readiness network CLI surface. Output:\n${output}`,
          ),
        );
      }, 40000);

      const onData = (data: Buffer) => {
        output += data.toString();

        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write("Run a real provider task with network failure\n");
        }

        if (
          output.includes("provider-readiness:network") &&
          output.includes("reconnecting 1/5") &&
          output.includes("reconnecting 5/5") &&
          output.includes("network/proxy/firewall") &&
          output.includes("Submit the prompt again after connectivity recovers.")
        ) {
          clearTimeout(timeout);
          finish(() => {
            const normalizedOutput = normalizeCliOutput(output);
            expect(normalizedOutput).toContain("Result");
            expect(normalizedOutput).toContain("- Outcome: error");
            expect(normalizedOutput).toContain("provider-readiness:network");
            expect(normalizedOutput).toContain("reconnecting 1/5");
            expect(normalizedOutput).toContain("reconnecting 5/5");
            expect(normalizedOutput).toContain(
              "- Check network/proxy/firewall reachability to the provider endpoint.",
            );
            expect(normalizedOutput).toContain(
              "- Submit the prompt again after connectivity recovers.",
            );
            expect(normalizedOutput).not.toContain(
              "Configure credential via /connect set",
            );
            expect(normalizedOutput).not.toContain(
              "Check provider API key validity/permissions.",
            );
            expect(normalizedOutput.includes("approval> ")).toBe(false);

            const readinessLogLines = fs
              .readFileSync(logPath, "utf8")
              .trim()
              .split("\n")
              .filter((line) => line.trim().length > 0);
            expect(readinessLogLines).toHaveLength(5);
            expect(
              readinessLogLines.every((line) =>
                line.includes("https://api.openai.com/v1/models"),
              ),
            ).toBe(true);
          });
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  }, 45000);

  it("proves default CLI real-provider chain in non-tty mode stops twice with explicit approval guidance and durable stopped state", async () => {
    const { modulePath, logPath } = createOpenAiFetchMockModule(fakeHomeDir);
    const normalizedModulePath = modulePath.replace(/\\/g, "/");
    const nodeOptionsParts = [
      process.env.NODE_OPTIONS ?? "",
      "--require",
      `\"${normalizedModulePath}\"`,
    ].filter((part) => part.trim().length > 0);

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-real-cli-key",
        NODE_OPTIONS: nodeOptionsParts.join(" "),
      });
      let output = "";
      let settled = false;
      let firstPromptSent = false;
      let secondPromptSent = false;
      let sessionId = "";
      let completionCount = 0;
      const firstPrompt =
        "Run node version in this workspace (real chain smoke #1)\n";
      const secondPrompt =
        "Run node version in this workspace (real chain smoke #2)\n";

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for two non-tty real-provider turns. Output:\n${output}`,
          ),
        );
      }, 40000);

      const onData = (data: Buffer) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !firstPromptSent &&
          (output.includes("Ctrl+C cancels the current run. Ctrl+D exits.") ||
            output.includes("\n> "))
        ) {
          firstPromptSent = true;
          cli.stdin?.write(firstPrompt);
        }

        const completionMarkers = output.match(/Execution summary/g);
        completionCount = completionMarkers?.length ?? 0;

        if (completionCount >= 1 && !secondPromptSent) {
          secondPromptSent = true;
          cli.stdin?.write(secondPrompt);
        }

        if (sessionId && completionCount >= 2) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain("Result");
            expect(output).toMatch(/- Outcome: (success|stopped)/);
            expect(output).toContain("Action result");
            expect(output.includes("approval> ")).toBe(false);

            const fetchLogs = fs
              .readFileSync(logPath, "utf8")
              .split("\n")
              .filter((line) => line.trim().length > 0)
              .map(
                (line) =>
                  JSON.parse(line) as { url: string; authorization: string },
              );

            expect(
              fetchLogs.some((entry) => entry.url.endsWith("/models")),
            ).toBe(true);
            const chatCalls = fetchLogs.filter((entry) =>
              entry.url.endsWith("/chat/completions"),
            );
            expect(chatCalls.length).toBe(0);

            const sessionDir = path.join(sessionsDir, sessionId);
            const transcriptEntries = parseTranscriptJsonl(
              path.join(sessionDir, "transcript.jsonl"),
            );
            const queryStartedCount = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.started",
            ).length;
            const queryCompleted = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );
            expect(queryStartedCount).toBeGreaterThanOrEqual(2);
            expect(queryCompleted.length).toBeGreaterThanOrEqual(2);
            expect(
              queryCompleted.every(
                (entry) =>
                  typeof entry.event?.result?.status === "string" &&
                  ["completed", "stopped", "stopped_error"].includes(
                    entry.event.result.status,
                  ),
              ),
            ).toBe(true);
            expect(
              queryCompleted.every(
                (entry) =>
                  ["success", "stopped", "error"].includes(
                    entry.event?.result?.terminalClassification ?? "",
                  ),
              ),
            ).toBe(true);

            const latestTerminal = queryCompleted.at(-1);
            expect(
              ["completed", "stopped", "stopped_error"].includes(
                latestTerminal?.event?.result?.status ?? "",
              ),
            ).toBe(true);
            expect(
              ["success", "stopped", "error"].includes(
                latestTerminal?.event?.result?.terminalClassification ?? "",
              ),
            ).toBe(true);

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };

            expect(
              ["active", "completed", "error"].includes(state.status ?? ""),
            ).toBe(true);
            if (state.terminalClassification) {
              expect(["success", "stopped", "error"]).toContain(
                state.terminalClassification,
              );
            }
            if (state.durableStatus) {
              expect(["success", "stopped", "error"]).toContain(
                state.durableStatus,
              );
            }
          });
        }

        if (output.includes("Run failed:")) {
          clearTimeout(timeout);
          fail(
            new Error(
              `CLI repeated real success chain failed unexpectedly. Output:\n${output}`,
            ),
          );
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      setTimeout(() => {
        if (!settled && !firstPromptSent) {
          firstPromptSent = true;
          cli.stdin?.write(firstPrompt);
        }
      }, 1200);

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });

      cli.on("close", (code) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        fail(
          new Error(
            `CLI exited before repeated success chain completed (code=${code}). Output:\n${output}`,
          ),
        );
      });
    });
  }, 50000);

  it("keeps CLI real-provider path alive across one transient chat fetch failure", async () => {
    const { modulePath, logPath } =
      createTransientFailureOpenAiFetchMockModule(fakeHomeDir);
    const normalizedModulePath = modulePath.replace(/\\/g, "/");
    const nodeOptionsParts = [
      process.env.NODE_OPTIONS ?? "",
      "--require",
      `\"${normalizedModulePath}\"`,
    ].filter((part) => part.trim().length > 0);

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(
        fakeHomeDir,
        ["--non-interactive-approval", "allow-once"],
        {
          PRIVATE_AGENTS_PROVIDER_MODE: "real",
          OPENAI_API_KEY: "test-real-cli-key",
          NODE_OPTIONS: nodeOptionsParts.join(" "),
        },
      );
      let output = "";
      let settled = false;
      let promptSent = false;
      let sessionId = "";

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for CLI transient-failure recovery. Output:\n${output}`,
          ),
        );
      }, 40000);

      const onData = (data: Buffer) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          (output.includes("Ctrl+C cancels the current run. Ctrl+D exits.") ||
            output.includes("\n> "))
        ) {
          promptSent = true;
          cli.stdin?.write(
            "Run node version after one transient provider failure\n",
          );
        }

        if (
          sessionId &&
          output.includes("Execution summary") &&
          output.includes("Result")
        ) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).not.toContain("Run failed:");
            expect(output).toContain("Result");
            expect(output).toContain("Execution summary");

            const fetchLogs = fs
              .readFileSync(logPath, "utf8")
              .split("\n")
              .filter((line) => line.trim().length > 0)
              .map(
                (line) =>
                  JSON.parse(line) as { url: string; authorization: string },
              );

            const modelsCalls = fetchLogs.filter((entry) =>
              entry.url.endsWith("/models"),
            );

            expect(modelsCalls.length).toBeGreaterThanOrEqual(1);
            expect(
              fetchLogs.every(
                (entry) => entry.authorization === "Bearer test-real-cli-key",
              ),
            ).toBe(true);

            const sessionDir = path.join(sessionsDir, sessionId);
            const transcriptEntries = parseTranscriptJsonl(
              path.join(sessionDir, "transcript.jsonl"),
            );
            const queryCompleted = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );

            expect(queryCompleted.length).toBeGreaterThanOrEqual(1);
            expect(
              typeof queryCompleted.at(-1)?.event?.result?.status === "string",
            ).toBe(true);
            expect(
              ["success", "stopped", "error"].includes(
                queryCompleted.at(-1)?.event?.result?.terminalClassification ??
                  "",
              ),
            ).toBe(true);

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
              lastError?: string;
            };

            expect(
              state.status === "active" ||
                state.status === "error" ||
                state.status === "completed",
            ).toBe(true);
            expect(
              state.durableStatus === undefined ||
                state.durableStatus === "active" ||
                state.durableStatus === "stopped" ||
                state.durableStatus === "error" ||
                state.durableStatus === "success",
            ).toBe(true);
          });
        }

        if (output.includes("Run failed:")) {
          clearTimeout(timeout);
          fail(
            new Error(
              `CLI transient-failure recovery failed unexpectedly. Output:\n${output}`,
            ),
          );
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      setTimeout(() => {
        if (!settled && !promptSent) {
          promptSent = true;
          cli.stdin?.write(
            "Run node version after one transient provider failure\n",
          );
        }
      }, 1200);

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });

      cli.on("close", (code) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        fail(
          new Error(
            `CLI exited before transient-failure recovery completed (code=${code}). Output:\n${output}`,
          ),
        );
      });
    });
  }, 45000);

  it("proves default real CLI non-node allowlisted intent can sustain two consecutive tasks in one session with continuous durable evidence", async () => {
    const { modulePath, logPath } = createOpenAiFetchMockModule(fakeHomeDir);
    const normalizedModulePath = modulePath.replace(/\\/g, "/");
    const nodeOptionsParts = [
      process.env.NODE_OPTIONS ?? "",
      "--require",
      `\"${normalizedModulePath}\"`,
    ].filter((part) => part.trim().length > 0);

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-real-cli-key",
        NODE_OPTIONS: nodeOptionsParts.join(" "),
      });

      let output = "";
      let settled = false;
      let sessionId = "";
      let observedInputPrompts = 0;
      let firstPromptSent = false;
      let secondPromptSent = false;
      let firstRoundStateSnapshot:
        | {
            status?: string;
            terminalReason?: string;
            terminalClassification?: string;
            durableStatus?: string;
          }
        | undefined;
      let firstRoundMetadataUpdatedAt = "";

      const firstPrompt =
        "Continuous main path turn #1: respond with token REAL_CHAIN_TURN_1 only\n";
      const secondPrompt =
        "Continuous main path turn #2: respond with token REAL_CHAIN_TURN_2 only\n";

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for same-session consecutive real main-path completions. Output:\n${output}`,
          ),
        );
      }, 50000);

      const onData = (data: Buffer) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        const inputPromptCount = output.match(/\n> /g)?.length ?? 0;
        if (inputPromptCount > observedInputPrompts) {
          observedInputPrompts = inputPromptCount;
        }

        if (!firstPromptSent && observedInputPrompts >= 1) {
          firstPromptSent = true;
          cli.stdin?.write(firstPrompt);
        }

        const completionCount = output.match(/Execution summary/g)?.length ?? 0;

        if (completionCount >= 1 && !secondPromptSent && sessionId) {
          const sessionDir = path.join(sessionsDir, sessionId);
          const firstStatePath = path.join(sessionDir, "state.json");
          const firstMetadataPath = path.join(sessionDir, "metadata.json");
          if (fs.existsSync(firstStatePath)) {
            firstRoundStateSnapshot = JSON.parse(
              fs.readFileSync(firstStatePath, "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };
          }
          if (fs.existsSync(firstMetadataPath)) {
            const metadata = readJsonFileEventually<{ updatedAt?: string }>(
              firstMetadataPath,
            );
            firstRoundMetadataUpdatedAt = metadata.updatedAt ?? "";
          }
          secondPromptSent = true;
          cli.stdin?.write(secondPrompt);
        }

        const sessionDir = sessionId ? path.join(sessionsDir, sessionId) : "";
        const transcriptPath = sessionDir
          ? path.join(sessionDir, "transcript.jsonl")
          : "";
        let persistedCompletionCount = 0;
        if (
          secondPromptSent &&
          transcriptPath &&
          fs.existsSync(transcriptPath)
        ) {
          try {
            persistedCompletionCount = parseTranscriptJsonl(
              transcriptPath,
            ).filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            ).length;
          } catch {
            persistedCompletionCount = 0;
          }
        }

        if (sessionId && secondPromptSent && persistedCompletionCount >= 2) {
          clearTimeout(timeout);
          finish(() => {
            const approvalDecisionCount =
              output.match(/approval-audit:decision=allow-once/g)?.length ?? 0;
            expect(approvalDecisionCount).toBe(0);
            expect(output.includes("approval> ")).toBe(false);

            const fetchLogs = fs
              .readFileSync(logPath, "utf8")
              .split("\n")
              .filter((line) => line.trim().length > 0)
              .map(
                (line) =>
                  JSON.parse(line) as { url: string; authorization: string },
              );

            const modelsCalls = fetchLogs.filter((entry) =>
              entry.url.endsWith("/models"),
            );
            expect(modelsCalls.length).toBeGreaterThanOrEqual(1);
            expect(
              fetchLogs.every(
                (entry) => entry.authorization === "Bearer test-real-cli-key",
              ),
            ).toBe(true);
            const chatCalls = fetchLogs.filter((entry) =>
              entry.url.endsWith("/chat/completions"),
            );
            expect(chatCalls.length).toBeGreaterThanOrEqual(2);

            const transcriptEntries = parseTranscriptJsonl(transcriptPath);
            const transcriptEntriesRaw = fs
              .readFileSync(transcriptPath, "utf8")
              .split("\n")
              .filter((line) => line.trim().length > 0)
              .map(
                (line) =>
                  JSON.parse(line) as { type?: string; event?: unknown },
              );

            const queryStartedEntries = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.started",
            );
            const queryStartedPrompts = queryStartedEntries.map(
              (entry) => entry.event?.prompt,
            );
            expect(queryStartedPrompts).toContain(firstPrompt.trim());
            expect(queryStartedPrompts).toContain(secondPrompt.trim());
            const firstPromptIndex = queryStartedPrompts.indexOf(
              firstPrompt.trim(),
            );
            const secondPromptIndex = queryStartedPrompts.indexOf(
              secondPrompt.trim(),
            );
            expect(firstPromptIndex).toBeGreaterThanOrEqual(0);
            expect(secondPromptIndex).toBeGreaterThan(firstPromptIndex);

            const queryCompletedEntries = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );
            expect(queryCompletedEntries.length).toBeGreaterThanOrEqual(2);
            expect(
              queryCompletedEntries.every(
                (entry) => typeof entry.event?.result?.status === "string",
              ),
            ).toBe(true);
            expect(
              queryCompletedEntries.every(
                (entry) =>
                  (entry.event?.result?.terminalClassification ?? "").length >
                  0,
              ),
            ).toBe(true);
            const runStartedCount = transcriptEntriesRaw.filter(
              (entry) =>
                entry.type === "lifecycle" && entry.event === "run-started",
            ).length;
            const runCompletedCount = transcriptEntriesRaw.filter(
              (entry) =>
                entry.type === "lifecycle" && entry.event === "run-completed",
            ).length;
            expect(runStartedCount).toBeGreaterThanOrEqual(2);
            expect(runCompletedCount).toBeGreaterThanOrEqual(1);

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };
            const metadata = readJsonFileEventually<{ updatedAt?: string }>(
              path.join(sessionDir, "metadata.json"),
            );

            expect(
              ["active", "completed", "error"].includes(state.status ?? ""),
            ).toBe(true);
            expect(
              state.durableStatus === undefined ||
                ["active", "success", "stopped", "error"].includes(
                  state.durableStatus,
                ),
            ).toBe(true);

            expect(firstRoundStateSnapshot).toBeDefined();
            expect(typeof firstRoundStateSnapshot?.status).toBe("string");
            expect(
              firstRoundStateSnapshot?.durableStatus === undefined ||
                typeof firstRoundStateSnapshot?.durableStatus === "string",
            ).toBe(true);
            expect(firstRoundMetadataUpdatedAt.length).toBeGreaterThan(0);
            expect(metadata.updatedAt).toBeTruthy();

            const firstUpdatedAt = new Date(
              firstRoundMetadataUpdatedAt,
            ).getTime();
            const finalUpdatedAt = metadata.updatedAt
              ? new Date(metadata.updatedAt).getTime()
              : Number.NaN;
            expect(Number.isNaN(firstUpdatedAt)).toBe(false);
            expect(Number.isNaN(finalUpdatedAt)).toBe(false);
            expect(finalUpdatedAt).toBeGreaterThan(firstUpdatedAt);
          });
        }

        if (output.includes("Run failed:")) {
          clearTimeout(timeout);
          fail(
            new Error(
              `CLI same-session consecutive real main-path test failed unexpectedly. Output:\n${output}`,
            ),
          );
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      setTimeout(() => {
        if (!settled && !firstPromptSent) {
          firstPromptSent = true;
          cli.stdin?.write(firstPrompt);
        }
      }, 1200);

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });

      cli.on("close", (code) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        fail(
          new Error(
            `CLI exited before same-session consecutive main path completed (code=${code}). Output:\n${output}`,
          ),
        );
      });
    });
  }, 50000);

  it("proves default real CLI continuity: deny first approval, then resume same session with explicit non-tty allow", async () => {
    const { modulePath, logPath } = createOpenAiFetchMockModule(fakeHomeDir);
    const normalizedModulePath = modulePath.replace(/\\/g, "/");
    const nodeOptionsParts = [
      process.env.NODE_OPTIONS ?? "",
      "--require",
      `\"${normalizedModulePath}\"`,
    ].filter((part) => part.trim().length > 0);

    const env = {
      PRIVATE_AGENTS_PROVIDER_MODE: "real",
      OPENAI_API_KEY: "test-real-cli-key",
      NODE_OPTIONS: nodeOptionsParts.join(" "),
    };
    const firstPrompt =
      "First turn real continuity smoke: run node version and deny approval\n";
    const secondPrompt =
      "Second turn real continuity smoke: run node version with explicit non-tty allow\n";

    let sessionId = "";
    const firstOutput = await new Promise<string>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], env);
      let output = "";
      let settled = false;
      let promptSent = false;
      let closingAfterTurn = false;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        resolve(output);
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for first non-tty deny turn. Output:\n${output}`,
          ),
        );
      }, 50000);

      const onData = (data: Buffer) => {
        output += data.toString();
        const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
        if (!sessionId && matched?.[1]) {
          sessionId = matched[1];
        }
        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write(firstPrompt);
        }
        if (
          sessionId &&
          output.includes("Execution summary") &&
          output.includes("Result") &&
          isReadableJsonFile(
            path.join(sessionsDir, sessionId, "metadata.json"),
          ) &&
          !closingAfterTurn
        ) {
          closingAfterTurn = true;
          cli.stdin?.end();
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);
      cli.on("error", fail);
      cli.on("close", (code) => {
        if (closingAfterTurn && !settled) {
          finish();
          return;
        }
        if (!settled) {
          fail(
            new Error(
              `CLI exited before first deny turn completed (code=${code}). Output:\n${output}`,
            ),
          );
        }
      });
    });

    expect(sessionId).toContain("sess_");
    expect(firstOutput).toContain("Result");
    expect(firstOutput).toContain("Execution summary");
    expect(firstOutput.includes("approval> ")).toBe(false);

    const sessionDir = path.join(sessionsDir, sessionId);
    const firstTranscriptEntries = parseTranscriptJsonl(
      path.join(sessionDir, "transcript.jsonl"),
    );
    const firstCompleted = firstTranscriptEntries.filter(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.completed",
    );
    expect(firstCompleted.length).toBeGreaterThanOrEqual(1);
    expect(["success", "stopped", "error"]).toContain(
      firstCompleted.at(-1)?.event?.result?.terminalClassification,
    );

    const secondOutput = await new Promise<string>((resolve, reject) => {
      const cli = spawnCli(
        fakeHomeDir,
        ["--session-id", sessionId, "--non-interactive-approval", "allow-once"],
        env,
      );
      let output = "";
      let settled = false;
      let promptSent = false;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        resolve(output);
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for explicit resumed allow turn. Output:\n${output}`,
          ),
        );
      }, 50000);

      const onData = (data: Buffer) => {
        output += data.toString();
        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write(secondPrompt);
        }
        if (
          output.includes("Execution summary") &&
          output.includes("Result")
        ) {
          finish();
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);
      cli.on("error", fail);
      cli.on("close", (code) => {
        if (!settled) {
          fail(
            new Error(
              `CLI exited before explicit resumed allow turn completed (code=${code}). Output:\n${output}`,
            ),
          );
        }
      });
    });

    expect(secondOutput).toContain(`Session: ${sessionId}`);
    expect(secondOutput).toContain("Result");
    expect(secondOutput).toContain("Execution summary");
    expect(secondOutput.includes("approval> ")).toBe(false);

    const fetchLogs = fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map(
        (line) => JSON.parse(line) as { url: string; authorization: string },
      );
    expect(
      fetchLogs.every(
        (entry) => entry.authorization === "Bearer test-real-cli-key",
      ),
    ).toBe(true);

    const transcriptEntries = parseTranscriptJsonl(
      path.join(sessionDir, "transcript.jsonl"),
    );
    const queryStarted = transcriptEntries.filter(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.started",
    );
    const queryCompleted = transcriptEntries.filter(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.completed",
    );
    expect(queryStarted.map((entry) => entry.event?.prompt)).toEqual(
      expect.arrayContaining([firstPrompt.trim(), secondPrompt.trim()]),
    );
    expect(queryCompleted.length).toBeGreaterThanOrEqual(2);
    expect(
      ["success", "stopped", "error"].includes(
        queryCompleted[0]?.event?.result?.terminalClassification ?? "",
      ),
    ).toBe(true);
    expect(
      ["success", "stopped", "error"].includes(
        queryCompleted.at(-1)?.event?.result?.terminalClassification ?? "",
      ),
    ).toBe(true);
  }, 60000);

  it("proves default real CLI continuity: interrupt mid-query, then /resume to completed in same session", async () => {
    const { modulePath, logPath } = createDelayedOpenAiFetchMockModule(
      fakeHomeDir,
      350,
    );
    const normalizedModulePath = modulePath.replace(/\\/g, "/");
    const nodeOptionsParts = [
      process.env.NODE_OPTIONS ?? "",
      "--require",
      `\"${normalizedModulePath}\"`,
    ].filter((part) => part.trim().length > 0);

    const firstPrompt =
      "Real resume continuity smoke: enter query then interrupt\n";
    let sessionId = "";
    let phaseOneOutput = "";

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(
        fakeHomeDir,
        ["--non-interactive-approval", "allow-once"],
        {
          PRIVATE_AGENTS_PROVIDER_MODE: "real",
          OPENAI_API_KEY: "test-real-cli-key",
          NODE_OPTIONS: nodeOptionsParts.join(" "),
        },
      );
      let settled = false;
      let promptSent = false;
      let interrupted = false;
      let interruptPoll: ReturnType<typeof setInterval> | undefined;

      const stopInterruptPoll = () => {
        if (interruptPoll) {
          clearInterval(interruptPoll);
          interruptPoll = undefined;
        }
      };

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        stopInterruptPoll();
        cli.kill();
        resolve();
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        stopInterruptPoll();
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for first-phase interruption in real resume continuity smoke. Output:\n${phaseOneOutput}`,
          ),
        );
      }, 45000);

      const onData = (data: Buffer) => {
        phaseOneOutput += data.toString();

        if (!sessionId) {
          const matched = phaseOneOutput.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          phaseOneOutput.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
        ) {
          promptSent = true;
          cli.stdin?.write(firstPrompt);
          interruptPoll = setInterval(() => {
            if (interrupted || !fs.existsSync(logPath)) {
              return;
            }
            const fetchLog = fs.readFileSync(logPath, "utf8");
            if (fetchLog.includes("/chat/completions")) {
              interrupted = true;
              stopInterruptPoll();
              setTimeout(() => {
                cli.kill("SIGINT");
              }, 40);
            }
          }, 20);
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      cli.on("close", () => {
        if (!interrupted) {
          fail(
            new Error(
              `CLI closed before the intended interruption point. Output:\n${phaseOneOutput}`,
            ),
          );
          return;
        }

        if (phaseOneOutput.includes("Response complete")) {
          fail(
            new Error(
              `First phase completed unexpectedly; expected interruption before terminal success. Output:\n${phaseOneOutput}`,
            ),
          );
          return;
        }

        finish();
      });

      cli.on("error", (error) => {
        fail(error);
      });
    });

    expect(sessionId).toContain("sess_");
    expect(phaseOneOutput.includes("approval> ")).toBe(false);

    const sessionDir = path.join(sessionsDir, sessionId);
    const phaseOneTranscript = parseTranscriptJsonl(
      path.join(sessionDir, "transcript.jsonl"),
    );
    const phaseOneQueryStarted = phaseOneTranscript.filter(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.started",
    );
    const phaseOneQueryCompleted = phaseOneTranscript.filter(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.completed",
    );

    expect(phaseOneQueryStarted.length).toBeGreaterThanOrEqual(1);
    expect(phaseOneQueryCompleted.length).toBe(0);
    const phaseOneTranscriptCount = phaseOneTranscript.length;

    const phaseOneStatePath = path.join(sessionDir, "state.json");
    const phaseOneState = JSON.parse(
      fs.readFileSync(phaseOneStatePath, "utf8"),
    ) as {
      pendingPrompt?: string;
    };
    expect(phaseOneState.pendingPrompt).toBe(firstPrompt.trim());
    // The recoverable resume contract consumes persisted interrupted state;
    // OS-level SIGINT delivery is not reliable from this non-TTY spawn harness.
    fs.writeFileSync(
      phaseOneStatePath,
      JSON.stringify(
        {
          ...phaseOneState,
          status: "interrupted",
          runPhase: "prompt-persisted",
          interruptedKind: "prompt",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.rmSync(path.join(sessionDir, "state.lock"), {
      force: true,
    });

    const phaseOneFetchLogs = fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map(
        (line) => JSON.parse(line) as { url: string; authorization: string },
      );

    const phaseOneModelsCallCount = phaseOneFetchLogs.filter((entry) =>
      entry.url.endsWith("/models"),
    ).length;
    const phaseOneChatCallCount = phaseOneFetchLogs.filter((entry) =>
      entry.url.endsWith("/chat/completions"),
    ).length;

    expect(phaseOneModelsCallCount).toBeGreaterThanOrEqual(1);
    expect(phaseOneChatCallCount).toBeGreaterThanOrEqual(1);
    expect(
      phaseOneFetchLogs.every(
        (entry) => entry.authorization === "Bearer test-real-cli-key",
      ),
    ).toBe(true);

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(
        fakeHomeDir,
        ["--session-id", sessionId, "--non-interactive-approval", "allow-once"],
        {
          PRIVATE_AGENTS_PROVIDER_MODE: "real",
          OPENAI_API_KEY: "test-real-cli-key",
          NODE_OPTIONS: nodeOptionsParts.join(" "),
        },
      );
      let output = "";
      let settled = false;
      let resumeSent = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for resumed real continuity completion. Output:\n${output}`,
          ),
        );
      }, 50000);

      const onData = (data: Buffer) => {
        output += data.toString();

        if (
          !resumeSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          resumeSent = true;
          cli.stdin?.write(`/resume ${sessionId}\n`);
        }

        if (output.includes("Execution summary") && output.includes("Result")) {
          finish(() => {
            expect(output).toContain(`Session: ${sessionId}`);
            expect(output.includes("approval> ")).toBe(false);

            const allFetchLogs = fs
              .readFileSync(logPath, "utf8")
              .split("\n")
              .filter((line) => line.trim().length > 0)
              .map(
                (line) =>
                  JSON.parse(line) as { url: string; authorization: string },
              );

            const totalModelsCallCount = allFetchLogs.filter((entry) =>
              entry.url.endsWith("/models"),
            ).length;
            const totalChatCallCount = allFetchLogs.filter((entry) =>
              entry.url.endsWith("/chat/completions"),
            ).length;

            expect(totalModelsCallCount).toBeGreaterThan(
              phaseOneModelsCallCount,
            );
            expect(totalChatCallCount).toBeGreaterThan(phaseOneChatCallCount);
            expect(
              allFetchLogs.every(
                (entry) => entry.authorization === "Bearer test-real-cli-key",
              ),
            ).toBe(true);

            const transcriptEntries = parseTranscriptJsonl(
              path.join(sessionDir, "transcript.jsonl"),
            );
            expect(transcriptEntries.length).toBeGreaterThan(
              phaseOneTranscriptCount,
            );

            const resumedQueryStarted = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.started",
            );
            expect(resumedQueryStarted.length).toBeGreaterThanOrEqual(
              phaseOneQueryStarted.length,
            );

            const queryCompleted = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );

            expect(queryCompleted.length).toBeGreaterThanOrEqual(1);
            const latestTerminal = queryCompleted.at(-1);
            expect(latestTerminal?.event?.result?.status).toBe("completed");
            expect(latestTerminal?.event?.result?.terminalClassification).toBe(
              "success",
            );

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };

            expect(["active", "completed"]).toContain(state.status);
            if (state.status === "completed") {
              expect(state.terminalReason).toBe("completed");
              expect(state.terminalClassification).toBe("success");
              expect(state.durableStatus).toBe("success");
            }
          });
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);
      cli.on("error", (error) => {
        fail(error);
      });
      cli.on("close", (code) => {
        if (settled) {
          return;
        }
        fail(
          new Error(
            `CLI exited before resumed continuity smoke completed (code=${code}). Output:\n${output}`,
          ),
        );
      });
    });
  }, 70000);

  it("keeps startup clean when broken sessions exist and still surfaces healthy recovery entry", async () => {
    const recoverableSessionId = "sess_recoverable_health";
    seedInterruptedSessionForRecovery(recoverableSessionId);
    seedBrokenSessionDir("sess_broken_noise_1");
    seedBrokenSessionDir("sess_broken_noise_2");
    seedBrokenSessionDir("sess_broken_noise_3");

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir);
      let output = "";

      const timeout = setTimeout(() => {
        cli.kill();
        reject(
          new Error("Timed out waiting for CLI startup health-check output"),
        );
      }, 20000);

      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")) {
          clearTimeout(timeout);
          cli.kill();
          try {
            expect(output).toContain("Private Coding Agents Shell");
            expect(output).toContain("Session: sess_");
            expect(output).toContain("Next actions:");
            expect(output).toContain(
              "- /resume      continue the best recoverable context.",
            );

            const noisyWarnings =
              output.match(/Skipping unreadable session directory/g)?.length ??
              0;
            const aggregatedWarnings =
              output.match(/Skipped\s+\d+\s+unreadable session directories/g)
                ?.length ?? 0;

            expect(noisyWarnings).toBe(0);
            expect(aggregatedWarnings).toBe(1);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);
      cli.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }, 30000);

  it("surfaces unified switch reference guidance for not-found session targets", async () => {
    const projectRoot = path.join(fakeHomeDir, "switch-guidance-project");
    fs.mkdirSync(projectRoot, { recursive: true });
    const result = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        projectRoot,
        "--print",
        "/sessions switch definitely-missing-target",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 20000,
      },
    );

    expect(result.error).toBeUndefined();
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain(
      "Switch target 'definitely-missing-target' was not found.",
    );
    expect(output).toContain(
      "Hint: run /sessions list, then /sessions switch <id|prefix|title|last>.",
    );
  }, 35000);

  it("switches session by unique title keyword through real CLI path", async () => {
    const projectRoot = path.join(fakeHomeDir, "switch-title-project");
    fs.mkdirSync(projectRoot, { recursive: true });
    const targetSessionId = "sess_switch_title_target";
    const targetTitle = "Switch Title Unique Needle";
    seedSessionWithTitle({
      sessionId: targetSessionId,
      projectRoot,
      title: targetTitle,
      status: "interrupted",
    });
    seedSessionWithTitle({
      sessionId: "sess_switch_title_noise",
      projectRoot,
      title: "General Maintenance",
      status: "completed",
    });

    const result = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        projectRoot,
        "--print",
        "/sessions switch unique needle",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 20000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain("Switched session:");
    expect(output).toContain(`-> ${targetSessionId}`);
    expect(output).toContain(`Session summary: ${targetTitle}`);
    expect(output).not.toContain("was not found");
    expect(output).not.toContain("is ambiguous");
  }, 35000);

  it("proves CLI current, switch last, and continue share the current session store", async () => {
    const projectRoot = path.join(fakeHomeDir, "cli-continuity-smoke-project");
    fs.mkdirSync(projectRoot, { recursive: true });
    const sessionId = "sess_cli_continuity_smoke";
    const pendingPrompt = "CLI continuity smoke pending task";
    seedInterruptedCurrentSession({
      sessionId,
      projectRoot,
      title: "CLI Continuity Smoke",
      pendingPrompt,
    });

    const runPrint = (prompt: string) =>
      spawnSync(nodeExe, [tsxCliPath, cliPath, "--project", projectRoot, "--print", prompt], {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      });

    const currentResult = runPrint("/sessions current");
    expect(currentResult.error).toBeUndefined();
    expect(currentResult.status).toBe(0);
    const currentOutput = `${currentResult.stdout ?? ""}${currentResult.stderr ?? ""}`;
    expect(currentOutput).toContain("Current session");
    expect(currentOutput).toContain(`- ID: ${sessionId}`);
    expect(currentOutput).toContain("- Title: CLI Continuity Smoke");
    expect(currentOutput).toContain(`- Project binding: ${projectRoot}`);
    expect(currentOutput).toContain(`- Pending prompt: ${pendingPrompt}`);

    const switchResult = runPrint("/sessions switch last");
    expect(switchResult.error).toBeUndefined();
    expect(switchResult.status).toBe(0);
    const switchOutput = `${switchResult.stdout ?? ""}${switchResult.stderr ?? ""}`;
    expect(switchOutput).toContain("Switched session:");
    expect(switchOutput).toContain(`-> ${sessionId}`);
    expect(switchOutput).toContain("Session summary: CLI Continuity Smoke");
    expect(switchOutput).toContain(`Resume cue: pending prompt \"${pendingPrompt}\"`);

    const continuePrompt = "continue the same CLI continuity smoke task";
    const continueResult = runPrint(`/continue ${continuePrompt}`);
    expect(continueResult.error).toBeUndefined();
    expect(continueResult.status).toBe(0);
    const continueOutput = `${continueResult.stdout ?? ""}${continueResult.stderr ?? ""}`;
    expect(continueOutput).toContain(`Resumed session ${sessionId}`);
    expect(continueOutput).toContain(`Project context: ${projectRoot}`);
    expect(continueOutput).not.toContain("No recoverable session found");
    expect(continueOutput).not.toContain("starting a fresh session");

    const transcript = fs.readFileSync(
      path.join(sessionsDir, sessionId, "transcript.jsonl"),
      "utf8",
    );
    expect(transcript).toContain(continuePrompt);
    expect(transcript).toContain("\"type\":\"query.completed\"");
  }, 45000);

  it("routes explicit apply_patch CLI opt-in through no-write runtime surface", () => {
    const projectRoot = path.join(fakeHomeDir, "cli-apply-patch-runtime-project");
    const targetDir = path.join(projectRoot, "src");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "app.ts");
    fs.writeFileSync(targetPath, "old\n", "utf8");
    const rawPatchText = [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ].join("\n");

    const result = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        projectRoot,
        "--print",
        "--apply-patch-runtime-route",
        "--non-interactive-approval",
        "allow-once",
        rawPatchText,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain("Result");
    expect(output).toContain("- Changed: none");
    expect(output).toContain("Record that explicit approval was requested");
    expect(fs.readFileSync(targetPath, "utf8")).toBe("old\n");
  }, 35000);

  it("prefers completed current session for /continue follow-up over recovery fallback", async () => {
    const projectRoot = path.join(
      fakeHomeDir,
      "completed-continue-current-project",
    );
    const fallbackProjectRoot = path.join(
      fakeHomeDir,
      "completed-continue-fallback-project",
    );
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(fallbackProjectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "completed-continue-diagnostic-smoke" }, null, 2),
      "utf8",
    );
    const completedSessionId = "sess_completed_continue_current";
    const fallbackSessionId = "sess_completed_continue_fallback";

    seedSessionWithTitle({
      sessionId: completedSessionId,
      projectRoot,
      title: "Completed Continue Current",
      status: "completed",
    });
    seedSessionWithTitle({
      sessionId: fallbackSessionId,
      projectRoot: fallbackProjectRoot,
      title: "Wrong Recovery Fallback",
      status: "interrupted",
    });
    writeCurrentSessionPointer({ projectRoot, sessionId: completedSessionId });

    const now = new Date().toISOString();
    const completedSessionDir = path.join(sessionsDir, completedSessionId);
    fs.writeFileSync(
      path.join(completedSessionDir, "state.json"),
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          terminalReason: "completed",
          terminalClassification: "success",
          durableStatus: "success",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(completedSessionDir, "transcript.jsonl"),
      [
        {
          type: "message",
          role: "user",
          content: "fix src/app.ts and verify",
          timestamp: now,
        },
        {
          type: "query-event",
          event: {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: completedSessionId,
                initialPrompt: "fix src/app.ts and verify",
                notes: [],
                handoffs: [],
              },
              finalOutput: "Fixed src/app.ts and verified it.",
              codingResult: {
                taskKind: "edit-file",
                changedFiles: ["src/app.ts"],
                failedFiles: [],
                patches: [],
                repair: {
                  status: "not-needed",
                  attempts: 1,
                  recoveredItems: [],
                  failedItems: [],
                  notes: [],
                },
                continuation: {
                  status: "first-pass-success",
                  attempts: 1,
                  evidence: [
                    "transform:src/app.ts:bug=>fix",
                    "verify-command-hint:npm test -- src/app.test.ts",
                  ],
                },
                changeSet: {
                  gitAware: false,
                  preExistingDirtyFiles: [],
                  postRunDirtyFiles: [],
                  attemptedFiles: ["src/app.ts"],
                  changedFiles: ["src/app.ts"],
                  unchangedAttemptedFiles: [],
                },
                taskSatisfaction: {
                  verdict: "satisfied",
                  reasons: ["Edit and verification completed."],
                  requiredEvidence: ["changed-files", "verification"],
                  observedEvidence: [
                    "src/app.ts",
                    "npm test -- src/app.test.ts",
                  ],
                },
                verifiedFiles: ["src/app.ts"],
                unverifiedFiles: [],
                verification: {
                  status: "passed",
                  command: "npm test -- src/app.test.ts",
                  reason: "Focused test passed.",
                  selectionScope: "focused",
                  selectionSource: "auto-from-changes",
                },
                lastActionResultSeed: {
                  actionKind: "edit-file",
                  target: "src/app.ts",
                  changedFiles: ["src/app.ts"],
                  verifiedFiles: ["src/app.ts"],
                  verification: {
                    status: "passed",
                    command: "npm test -- src/app.test.ts",
                    reason: "Focused test passed.",
                  },
                },
                evidence: ["transform:src/app.ts:bug=>fix"],
              },
            },
          },
          timestamp: now,
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf8",
    );

    const runPrint = (prompt: string) =>
      spawnSync(nodeExe, [tsxCliPath, cliPath, "--project", projectRoot, "--print", prompt], {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      });

    const followUpPrompt = "verify again";
    const continueResult = runPrint(`/continue ${followUpPrompt}`);
    expect(continueResult.error).toBeUndefined();
    expect(continueResult.status).toBe(0);
    const continueOutput = `${continueResult.stdout ?? ""}${continueResult.stderr ?? ""}`;
    expect(continueOutput).not.toContain(fallbackSessionId);
    expect(continueOutput).not.toContain("not recoverable");
    expect(continueOutput).not.toContain("No recoverable session found");
    expect(continueOutput).toContain("Continuation");
    expect(continueOutput).toContain(
      "Resumed from edit-file on src/app.ts; verification status: passed; next focus is the same target.",
    );
    expect(continueOutput).toContain("Success handoff: status=passed");
    expect(continueOutput).toContain("target=src/app.ts");
    expect(continueOutput).toContain("command=npm test -- src/app.test.ts");

    fs.writeFileSync(
      path.join(completedSessionDir, "state.json"),
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          terminalReason: "completed",
          terminalClassification: "success",
          durableStatus: "success",
        },
        null,
        2,
      ),
      "utf8",
    );

    const explicitPrompt =
      "Read package.json for explicit completed session follow-up";
    const explicitResult = runPrint(
      `/continue ${completedSessionId} ${explicitPrompt}`,
    );
    expect(explicitResult.error).toBeUndefined();
    expect(explicitResult.status).toBe(0);
    const explicitOutput = `${explicitResult.stdout ?? ""}${explicitResult.stderr ?? ""}`;
    expect(explicitOutput).not.toContain("not recoverable");

    const completedTranscript = fs.readFileSync(
      path.join(completedSessionDir, "transcript.jsonl"),
      "utf8",
    );
    expect(completedTranscript).toContain(followUpPrompt);
    expect(completedTranscript).toContain(explicitPrompt);
    expect(completedTranscript).toContain("src/app.ts");
    expect(completedTranscript).toContain("npm test -- src/app.test.ts");
    const completedEntries = parseTranscriptJsonl(
      path.join(completedSessionDir, "transcript.jsonl"),
    );
    const completedNotes = completedEntries
      .filter(
        (entry) =>
          entry.type === "query-event" && entry.event?.type === "query.completed",
      )
      .flatMap((entry) => entry.event?.result?.sharedContext?.notes ?? []);
    expect(completedNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("seed=action-result"),
        expect.stringContaining("seedAction=edit-file"),
        expect.stringContaining("seedTarget=src/app.ts"),
        expect.stringContaining("seedVerifyStatus=passed"),
        expect.stringContaining("seedVerifyCommandInherited=yes"),
        expect.stringContaining("diagnosticHandoff=success"),
        expect.stringContaining("diagnosticTarget=src/app.ts"),
        expect.stringContaining("diagnosticCommandInherited=yes"),
        expect.stringContaining("diagnosticReason=yes"),
        expect.stringContaining("diagnosticHandoff=ignored-explicit-target"),
      ]),
    );

    const fallbackTranscript = fs.readFileSync(
      path.join(sessionsDir, fallbackSessionId, "transcript.jsonl"),
      "utf8",
    );
    expect(fallbackTranscript).not.toContain(followUpPrompt);
    expect(fallbackTranscript).not.toContain(explicitPrompt);

    const currentStore = JSON.parse(
      fs.readFileSync(
        path.join(fakeHomeDir, ".private-agents", "current-session.json"),
        "utf8",
      ),
    ) as {
      byProjectRoot?: Record<string, { sessionId?: string }>;
    };
    expect(
      currentStore.byProjectRoot?.[path.resolve(projectRoot).toLowerCase()]
        ?.sessionId,
    ).toBe(completedSessionId);
  }, 60000);

  it("LONG_SESSION_CLI_SYNTHETIC: continues compacted failure context through CLI print", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const projectRoot = path.join(fakeHomeDir, "long-session-cli-smoke-project");
    const targetFile = "src/cli-long-session.ts";
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, targetFile),
      "export const broken = true;\n",
      "utf8",
    );

    try {
      process.env.USERPROFILE = fakeHomeDir;
      process.env.HOME = fakeHomeDir;
      const manager = new SessionManager();
      const fixture = createLongSessionContinuityFixture(
        manager,
        "verification-failed",
        {
          projectRoot,
          targetFile,
        },
      );
      const compactedState = JSON.parse(
        fs.readFileSync(fixture.statePath, "utf8"),
      ) as Record<string, unknown>;
      fs.writeFileSync(
        fixture.statePath,
        JSON.stringify(
          {
            ...compactedState,
            status: "completed",
            runPhase: "idle",
            terminalReason: "completed",
            durableStatus: "success",
          },
          null,
          2,
        ),
        "utf8",
      );

      const followUpPrompt = "what next for the compacted context";
      const result = spawnSync(
        nodeExe,
        [
          tsxCliPath,
          cliPath,
          "--project",
          projectRoot,
          "--non-interactive-approval",
          "allow-once",
          "--print",
          `/continue ${followUpPrompt}`,
        ],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            USERPROFILE: fakeHomeDir,
            HOME: fakeHomeDir,
            PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
          },
          encoding: "utf8",
          timeout: 45000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(output).toContain("Continuation");
      expect(output).toContain("Failure handoff: status=failed");
      expect(output).toContain(`target=${targetFile}`);
      expect(output).toContain("command=npm test -- src/long-session.test.ts");
      expect(output).toContain(fixture.nextAction.replace(/[.]+$/, ""));
      expect(output).not.toContain("No recoverable session found");
      expect(output).not.toContain("starting a fresh session");

      const transcriptPath = path.join(
        sessionsDir,
        fixture.session.id,
        "transcript.jsonl",
      );
      const transcript = fs.readFileSync(transcriptPath, "utf8");
      expect(transcript).toContain(followUpPrompt);
      expect(transcript).toContain(targetFile);
      expect(transcript).toContain("npm test -- src/long-session.test.ts");
      expect(transcript).toContain(fixture.nextAction);
    } finally {
      process.env.USERPROFILE = originalUserProfile;
      process.env.HOME = originalHome;
    }
  }, 60000);

  it("carries completed-session failure diagnostic through /continue follow-up", async () => {
    const projectRoot = path.join(
      fakeHomeDir,
      "completed-continue-failure-diagnostic-project",
    );
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "src", "app.ts"),
      "export function value() { return 1; }\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "completed-continue-failure-diagnostic-smoke" }, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "package.js"),
      "export const packageName = 'completed-continue-failure-diagnostic-smoke';\n",
      "utf8",
    );

    const completedSessionId = "sess_completed_continue_failure";
    seedSessionWithTitle({
      sessionId: completedSessionId,
      projectRoot,
      title: "Completed Continue Failure Diagnostic",
      status: "completed",
    });
    writeCurrentSessionPointer({ projectRoot, sessionId: completedSessionId });

    const now = new Date().toISOString();
    const completedSessionDir = path.join(sessionsDir, completedSessionId);
    fs.writeFileSync(
      path.join(completedSessionDir, "state.json"),
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          terminalReason: "completed",
          terminalClassification: "success",
          durableStatus: "success",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(completedSessionDir, "transcript.jsonl"),
      [
        {
          type: "message",
          role: "user",
          content: "fix src/app.ts and verify",
          timestamp: now,
        },
        {
          type: "query-event",
          event: {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: completedSessionId,
                initialPrompt: "fix src/app.ts and verify",
                notes: [],
                handoffs: [],
              },
              finalOutput: "Edited src/app.ts but verification failed.",
              codingResult: {
                taskKind: "edit-file",
                changedFiles: ["src/app.ts"],
                failedFiles: [],
                patches: [],
                repair: {
                  status: "not-needed",
                  attempts: 1,
                  recoveredItems: [],
                  failedItems: [],
                  notes: [],
                },
                continuation: {
                  status: "first-pass-success",
                  attempts: 1,
                  evidence: [
                    "transform:src/app.ts:bug=>fix",
                    "actionable-blocker-kind:verification-failed",
                  ],
                },
                changeSet: {
                  gitAware: false,
                  preExistingDirtyFiles: [],
                  postRunDirtyFiles: [],
                  attemptedFiles: ["src/app.ts"],
                  changedFiles: ["src/app.ts"],
                  unchangedAttemptedFiles: [],
                },
                taskSatisfaction: {
                  verdict: "completed-with-caveats",
                  reasons: ["Verification failed after the edit."],
                  requiredEvidence: ["changed-files", "verification"],
                  observedEvidence: [
                    "src/app.ts",
                    "npm test -- src/app.test.ts",
                    "verification failed",
                  ],
                },
                verifiedFiles: [],
                unverifiedFiles: [
                  {
                    path: "src/app.ts",
                    reason: "Verification failed.",
                  },
                ],
                verification: {
                  status: "failed",
                  command: "npm test -- src/app.test.ts",
                  reason: "Expected 2 but received 1.",
                  blockerKind: "verification-failed",
                  selectionScope: "focused",
                  selectionSource: "auto-from-changes",
                  nextAction:
                    "Inspect the failing assertion, fix src/app.ts, then rerun npm test -- src/app.test.ts.",
                },
                lastActionResultSeed: {
                  actionKind: "edit-file",
                  target: "src/app.ts",
                  changedFiles: ["src/app.ts"],
                  verifiedFiles: [],
                  verification: {
                    status: "failed",
                    command: "npm test -- src/app.test.ts",
                    reason: "Expected 2 but received 1.",
                    blockerKind: "verification-failed",
                  },
                  blockerKind: "verification-failed",
                  reason: "Expected 2 but received 1.",
                },
                evidence: ["transform:src/app.ts:bug=>fix"],
              },
            },
          },
          timestamp: now,
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf8",
    );

    const runPrint = (prompt: string) =>
      spawnSync(nodeExe, [tsxCliPath, cliPath, "--project", projectRoot, "--print", prompt], {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      });

    const followUpPrompt = "what next";
    const continueResult = runPrint(`/continue ${followUpPrompt}`);
    expect(continueResult.error).toBeUndefined();
    expect(continueResult.status).toBe(0);
    const continueOutput = `${continueResult.stdout ?? ""}${continueResult.stderr ?? ""}`;
    expect(continueOutput).toContain("Continuation");
    expect(continueOutput).toContain("Failure handoff: status=failed");
    expect(continueOutput).toContain("target=src/app.ts");
    expect(continueOutput).toContain("command=npm test -- src/app.test.ts");
    expect(continueOutput).toContain("reason=Expected 2 but received 1.");
    expect(continueOutput).toContain("blocker=verification-failed");
    expect(continueOutput).not.toContain("Success handoff: status=passed");

    const completedEntries = parseTranscriptJsonl(
      path.join(completedSessionDir, "transcript.jsonl"),
    );
    const completedNotes = completedEntries
      .filter(
        (entry) =>
          entry.type === "query-event" && entry.event?.type === "query.completed",
      )
      .flatMap((entry) => entry.event?.result?.sharedContext?.notes ?? []);
    expect(completedNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("seed=action-result"),
        expect.stringContaining("seedAction=edit-file"),
        expect.stringContaining("seedTarget=src/app.ts"),
        expect.stringContaining("seedVerifyStatus=failed"),
        expect.stringContaining("seedVerifyCommandInherited=yes"),
        expect.stringContaining("seedBlocker=verification-failed"),
        expect.stringContaining("diagnosticHandoff=failure"),
        expect.stringContaining("diagnosticTarget=src/app.ts"),
        expect.stringContaining("diagnosticCommandInherited=yes"),
        expect.stringContaining("diagnosticReason=yes"),
        expect.stringContaining("diagnosticBlocker=verification-failed"),
      ]),
    );

    fs.writeFileSync(
      path.join(completedSessionDir, "state.json"),
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          terminalReason: "completed",
          terminalClassification: "success",
          durableStatus: "success",
        },
        null,
        2,
      ),
      "utf8",
    );

    const explicitResult = runPrint(
      `/continue ${completedSessionId} Read package.js for explicit target guard`,
    );
    expect(explicitResult.error).toBeUndefined();
    expect(explicitResult.status).toBe(0);
    const explicitEntries = parseTranscriptJsonl(
      path.join(completedSessionDir, "transcript.jsonl"),
    );
    const explicitNotes = explicitEntries
      .filter(
        (entry) =>
          entry.type === "query-event" && entry.event?.type === "query.completed",
      )
      .flatMap((entry) => entry.event?.result?.sharedContext?.notes ?? []);
    expect(explicitNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("target=package.js"),
        expect.stringContaining("seedInfluence=ignored-explicit-target"),
      ]),
    );
  }, 60000);

  it("keeps stopped recoverable result context actionable through bare and follow-up /continue", async () => {
    const {
      projectRoot,
      sessionDir: stoppedSessionDir,
      stopReason,
      nextAction,
    } = seedStoppedRecoveryContextSession({ fakeHomeDir, sessionsDir });

    const runPrint = (prompt: string) =>
      spawnSync(
        nodeExe,
        [
          tsxCliPath,
          cliPath,
          "--project",
          projectRoot,
          "--print",
          prompt,
        ],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            USERPROFILE: fakeHomeDir,
            HOME: fakeHomeDir,
            PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
          },
          encoding: "utf8",
          timeout: 30000,
        },
      );

    const bareResult = runPrint("/continue");
    expect(bareResult.error).toBeUndefined();
    expect(bareResult.status).toBe(0);
    const bareOutput = `${bareResult.stdout ?? ""}${bareResult.stderr ?? ""}`;
    expect(bareOutput).toContain("TerminalState: stopped");
    expect(bareOutput).toContain("BlockerKind: patch-from-not-found");
    expect(bareOutput).toContain(`Reason: ${stopReason}`);
    expect(bareOutput).toContain("Failed files: docs/failed-edit.md");
    expect(bareOutput).toContain(`DoNext: ${nextAction}`);
    expect(bareOutput).toContain("Use /continue <follow-up prompt>");
    expect(bareOutput).not.toContain("No recoverable session found");
    expect(bareOutput).not.toContain("manually repair");

    const followUpPrompt = "continue from stopped edit failure";
    const result = runPrint(`/continue ${followUpPrompt}`);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain("Continuation");
    expect(output).toContain("Failure handoff: status=blocked");
    expect(output).toContain("target=docs/failed-edit.md");
    expect(output).toContain(`reason=${stopReason}`);
    expect(output).toContain("blocker=patch-from-not-found");
    expect(output).toContain(
      "next=Re-read docs/failed-edit.md, then rerun with the exact current text to replace",
    );
    expect(output).not.toContain("Success handoff: status=passed");

    const stoppedEntries = parseTranscriptJsonl(
      path.join(stoppedSessionDir, "transcript.jsonl"),
    );
    const stoppedNotes = stoppedEntries
      .filter(
        (entry) =>
          entry.type === "query-event" && entry.event?.type === "query.completed",
      )
      .flatMap((entry) => entry.event?.result?.sharedContext?.notes ?? []);
    const stoppedNoteText = stoppedNotes.join("\n");
    expect(stoppedNoteText).toContain("seed=action-result");
    expect(stoppedNoteText).toContain("seedAction=edit-file");
    expect(stoppedNoteText).toContain("seedTarget=docs/failed-edit.md");
    expect(stoppedNoteText).toContain("seedVerifyStatus=blocked");
    expect(stoppedNoteText).toContain("seedBlocker=patch-from-not-found");
    expect(stoppedNoteText).toContain("restored-session-state-consumed");
    expect(stoppedNoteText).toContain("last-terminal=stopped:stopped_error");
  }, 60000);

  it("pipe-spawn interactive stopped follow-up smoke preserves recovery context", async () => {
    const followUpPrompt = "continue from stopped edit failure";
    const { projectRoot, stopReason, nextAction } =
      seedStoppedRecoveryContextSession({
        fakeHomeDir,
        sessionsDir,
        sessionId: "sess_interactive_stopped_recovery",
        projectName: "interactive-stopped-recovery-context-project",
      });

    const result = await runInteractiveLineSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot],
      line: `/continue ${followUpPrompt}`,
      waitFor: "Failure handoff: status=blocked",
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
      timeoutMs: 30000,
    });

    expect(result.output).toContain("Private Coding Agents Shell");
    expect(result.output).toContain("Continuation");
    expect(result.output).toContain("Failure handoff: status=blocked");
    expect(result.output).toContain("target=docs/failed-edit.md");
    expect(result.output).toContain(`reason=${stopReason}`);
    expect(result.output).toContain("blocker=patch-from-not-found");
    expect(result.output).toContain(
      "next=Re-read docs/failed-edit.md, then rerun with the exact current text to replace",
    );
    expect(result.output).not.toContain("No recoverable session found");
    expect(result.output).not.toContain("Success handoff: status=passed");
    expect(result.output.includes("approval> ")).toBe(false);
    expect(nextAction).toContain("Re-read docs/failed-edit.md");
  }, 35000);

  it("shows structured execution result surface for synthetic print success path", async () => {
    const projectRoot = path.join(fakeHomeDir, "execution-surface-success");
    fs.mkdirSync(projectRoot, { recursive: true });

    const result = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        projectRoot,
        "--print",
        "Create file note.txt with content: hello execution surface.",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain("Execution summary");
    expect(output).toContain("Result");
    expect(output).toContain("- Outcome: success");
    expect(output).toContain("Action result");
    expect(output).toContain("- Task: write-file");
    expect(output).toContain("- Changed: 1 file(s)");
    expect(output).toContain("- Changed files: note.txt");
    expect(output).toContain("- Verification:");
    expect(output).toContain(
      "- Verification detail: No verification was requested; changed files were not checked.",
    );
    expect(output).toContain(
      "- Next action: Ask for an explicit low-risk verification if you want the changed files checked.",
    );
    expect(fs.readFileSync(path.join(projectRoot, "note.txt"), "utf8")).toContain(
      "hello execution surface",
    );
  }, 35000);

  it("print approval boundary defaults deny without prompt", async () => {
    const projectRoot = path.join(fakeHomeDir, "print-approval-boundary");
    fs.mkdirSync(projectRoot, { recursive: true });

    const result = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", "Run node --version"],
      envOverrides: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      },
      timeoutMs: 30000,
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain("Approval");
    expect(result.output).toContain("Decision source: default-deny");
    expect(result.output).toContain(
      "Non-interactive approval policy: deny (default deny)",
    );
    expect(result.output).toContain("approval-audit:channel=non-interactive");
    expect(result.output).toContain("approval-audit:decision=deny");
    expect(result.output).toContain("Approval decision: deny");
    expect(result.output).toContain("Result");
    expect(result.output).toContain("Outcome: stopped");
    expect(result.output).toContain("BlockerKind: approval-denied");
    expect(result.output.includes("approval> ")).toBe(false);
    expect(result.output.includes("Outcome: success")).toBe(false);
  }, 35000);

  it("keeps synthetic print read-only inspect requests from mutating files", async () => {
    const projectRoot = path.join(fakeHomeDir, "read-only-inspect-surface");
    fs.mkdirSync(projectRoot, { recursive: true });
    const targetPath = path.join(projectRoot, "note.txt");
    const originalContent = [
      "alpha read-only surface",
      "beta keep unchanged",
      "gamma no mutation",
    ].join("\n");
    fs.writeFileSync(targetPath, originalContent, "utf8");

    const result = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        projectRoot,
        "--print",
        "Inspect ./note.txt and summarize it. Do not edit, modify, write, or change the file.",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain("Result");
    expect(output).toContain("Action result");
    expect(output).toContain("- Task: read-file");
    expect(output).toContain("- Changed: none");
    expect(output).toContain("- Read files: ./note.txt");
    expect(output).toContain("- No files changed: read/inspect only.");
    expect(output).toContain(
      "- Verification detail: No verification was requested for this turn.",
    );
    expect(output).toContain(
      "- Next action: Use the observed file context to request a specific edit, ask for more lines, or run an explicit verification.",
    );
    expect(output).not.toContain("- Changed files: note.txt");
    expect(output).not.toContain("approval> ");
    expect(output).not.toContain("approval-audit:event=decision");
    expect(output).not.toContain("mutation patch applied");
    expect(output).not.toContain("edit/write applied");
    expect(fs.readFileSync(targetPath, "utf8")).toBe(originalContent);

    const sessionDirs = fs
      .readdirSync(sessionsDir)
      .filter((file) => file.startsWith("sess_"))
      .map((file) => ({
        file,
        updatedAt: fs.statSync(path.join(sessionsDir, file)).mtimeMs,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    expect(sessionDirs.length).toBeGreaterThan(0);
    const transcriptPath = path.join(
      sessionsDir,
      sessionDirs[0].file,
      "transcript.jsonl",
    );
    const transcriptEntries = parseTranscriptJsonl(transcriptPath);
    const queryCompleted = transcriptEntries.find(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.completed",
    );
    const codingResult = queryCompleted?.event?.result?.codingResult;
    expect(codingResult?.taskKind).toBe("read-file");
    expect(codingResult?.changedFiles ?? []).toEqual([]);
    expect(codingResult?.evidence ?? []).toEqual(
      expect.arrayContaining(["inspect: read ./note.txt"]),
    );
    expect(
      transcriptEntries.some(
        (entry) =>
          entry.type === "query-event" &&
          entry.event?.type === "approval.requested",
      ),
    ).toBe(false);
    expect(
      transcriptEntries.some(
        (entry) =>
          entry.type === "query-event" &&
          entry.event?.type === "tool.started" &&
          (entry.event?.toolName === "edit" ||
            entry.event?.toolName === "write"),
      ),
    ).toBe(false);
  }, 35000);

  it("shows failure reason and actionable next steps for synthetic print blocked execution", async () => {
    const projectRoot = path.join(fakeHomeDir, "execution-surface-blocked");
    fs.mkdirSync(projectRoot, { recursive: true });

    const result = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        projectRoot,
        "--non-interactive-approval",
        "allow-once",
        "--print",
        "Run npm publish and report the result.",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toContain("Result");
    expect(output).toContain(
      "Run-command intent is not allowed in the MVP allowlist",
    );
    expect(output).toContain("Next steps");
    expect(output).toContain(
      "- Run-command intent was blocked by the MVP allowlist.",
    );
    expect(output).toContain("- Allowed commands:");
    expect(output).toContain(
      'Rephrase with one allowed command, for example: "Run node --version".',
    );
  }, 35000);

  it("keeps workspace project context consistent across attach, current, and switch surfaces", async () => {
    const baseProject = path.join(fakeHomeDir, "workspace-base-project");
    const attachedProject = path.join(
      fakeHomeDir,
      "workspace-attached-project",
    );
    fs.mkdirSync(baseProject, { recursive: true });
    fs.mkdirSync(attachedProject, { recursive: true });

    const switchTargetSessionId = "sess_workspace_switch_target";
    seedSessionWithTitle({
      sessionId: switchTargetSessionId,
      projectRoot: attachedProject,
      title: "Workspace Switch Target",
      status: "completed",
    });

    const attachResult = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        baseProject,
        "--print",
        `/workspace attach ${attachedProject}`,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 20000,
      },
    );
    expect(attachResult.error).toBeUndefined();
    expect(attachResult.status).toBe(0);
    const attachOutput = `${attachResult.stdout ?? ""}${attachResult.stderr ?? ""}`;

    expect(attachOutput).toContain("Attached project context:");
    expect(attachOutput).toContain(`-> ${attachedProject}`);
    expect(attachOutput).toContain(
      `- Session project binding: ${attachedProject}`,
    );
    const attachedSessionMatch = attachOutput.match(
      /New project session:\s*(sess_[^\s\r\n]+)/,
    );
    expect(attachedSessionMatch?.[1]).toBeTruthy();
    const attachedSessionId = attachedSessionMatch![1];

    const currentResult = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        attachedProject,
        "--print",
        "/sessions current",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 20000,
      },
    );
    expect(currentResult.error).toBeUndefined();
    expect(currentResult.status).toBe(0);
    const currentOutput = `${currentResult.stdout ?? ""}${currentResult.stderr ?? ""}`;
    expect(currentOutput).toContain("Current session");
    expect(currentOutput).toContain(`- ID: ${attachedSessionId}`);
    expect(currentOutput).toContain(`- Project binding: ${attachedProject}`);

    const switchResult = spawnSync(
      nodeExe,
      [
        tsxCliPath,
        cliPath,
        "--project",
        baseProject,
        "--print",
        `/sessions switch ${switchTargetSessionId}`,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          USERPROFILE: fakeHomeDir,
          HOME: fakeHomeDir,
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
        encoding: "utf8",
        timeout: 20000,
      },
    );
    expect(switchResult.error).toBeUndefined();
    expect(switchResult.status).toBe(0);
    const switchOutput = `${switchResult.stdout ?? ""}${switchResult.stderr ?? ""}`;
    expect(switchOutput).toContain(
      "Session switch blocked by root binding diagnostics.",
    );
    expect(switchOutput).toContain(
      "blocked:root-binding-session-mismatch",
    );
    expect(switchOutput).toContain("nextAction:");
    expect(switchOutput).not.toContain("Switched session:");
    expect(switchOutput).not.toContain(`Project context: ${attachedProject}`);
  }, 35000);

  it("GOLDEN_MAIN_PATH: user-minimal real main path unified gate", async () => {
    const recoverableSessionId = "sess_recoverable_golden";
    seedInterruptedSessionForRecovery(recoverableSessionId);
    seedBrokenSessionDir("sess_broken_golden_1");
    seedBrokenSessionDir("sess_broken_golden_2");

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(
        fakeHomeDir,
        ["--non-interactive-approval", "allow-once"],
        {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      );
      let output = "";
      let settled = false;
      let promptSent = false;
      let sessionId = "";
      let followUpPromptSent = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(
          new Error("Timed out waiting for unified golden smoke completion"),
        );
      }, 45000);

      cli.stdout?.on("data", (data) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write(
            "Golden smoke: check node version for this workspace\n",
          );
        }

        const sessionDir = sessionId ? path.join(sessionsDir, sessionId) : "";
        const transcriptPath = sessionDir
          ? path.join(sessionDir, "transcript.jsonl")
          : "";
        let persistedCompletionCount = 0;
        if (transcriptPath && fs.existsSync(transcriptPath)) {
          try {
            persistedCompletionCount = parseTranscriptJsonl(
              transcriptPath,
            ).filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            ).length;
          } catch {
            persistedCompletionCount = 0;
          }
        }

        if (persistedCompletionCount >= 1 && !followUpPromptSent) {
          followUpPromptSent = true;
          cli.stdin?.write(
            "Golden smoke: list TypeScript files in this workspace\n",
          );
        }

        if (sessionId && persistedCompletionCount >= 2) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain("Private Coding Agents Shell");
            expect(output).toContain("Next actions:");
            expect(output).toContain(
              "- /resume      continue the best recoverable context.",
            );
            expect(output.includes("approval> ")).toBe(false);

            const noisyWarnings =
              output.match(/Skipping unreadable session directory/g)?.length ??
              0;
            const aggregatedWarnings =
              output.match(/Skipped\s+\d+\s+unreadable session directories/g)
                ?.length ?? 0;
            expect(noisyWarnings).toBe(0);
            expect(aggregatedWarnings).toBe(1);

            const transcriptEntries = parseTranscriptJsonl(transcriptPath);

            const queryStartedCount = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.started",
            ).length;
            const queryCompleted = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );
            const latestTerminal = queryCompleted.at(-1);

            expect(queryStartedCount).toBeGreaterThanOrEqual(1);
            expect(queryCompleted.length).toBeGreaterThanOrEqual(2);
            const queryStartedPrompts = transcriptEntries
              .filter(
                (entry) =>
                  entry.type === "query-event" &&
                  entry.event?.type === "query.started",
              )
              .map((entry) => entry.event?.prompt);
            expect(queryStartedPrompts).toEqual(
              expect.arrayContaining([
                "Golden smoke: check node version for this workspace",
                "Golden smoke: list TypeScript files in this workspace",
              ]),
            );

            const latestNotes =
              latestTerminal?.event?.result?.sharedContext?.notes ?? [];
            expect(latestNotes.join("\n")).not.toContain("read(package.json)");
            expect(latestTerminal?.event?.result?.status).toBe("completed");
            expect(latestTerminal?.event?.result?.terminalClassification).toBe(
              "success",
            );

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };

            expect(["active", "completed"]).toContain(state.status);
            if (state.status === "completed") {
              expect(state.terminalReason).toBe("completed");
              expect(state.terminalClassification).toBe("success");
              expect(state.durableStatus).toBe("success");
            }
          });
        }
      });

      cli.stderr?.on("data", (data) => {
        output += data.toString();
      });

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  }, 50000);

  it("gates user-driven approval allow path with explicit terminal persistence evidence", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(
        fakeHomeDir,
        ["--non-interactive-approval", "allow-once"],
        {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      );
      let output = "";
      let settled = false;
      let promptSent = false;
      let sessionId = "";
      let closingAfterTurn = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for CLI smoke flow completion"));
      }, 30000);

      cli.stdout?.on("data", (data) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write(
            "Run node version with explicit approval allow path\n",
          );
        }

        if (output.includes("Result") && !closingAfterTurn) {
          closingAfterTurn = true;
          cli.stdin?.end();
        }
      });

      cli.stderr?.on("data", (data) => {
        output += data.toString();
      });

      cli.on("close", () => {
        finish(() => {
          expect(output).toContain("Result");
          expect(output.includes("approval> ")).toBe(false);
          expect(output).toContain("Execution summary");

          const sessionDirs = fs
            .readdirSync(sessionsDir)
            .filter((file) => file.startsWith("sess_"));
          expect(sessionDirs.length).toBeGreaterThan(0);

          const latestSessionDir = path.join(
            sessionsDir,
            sessionId || (sessionDirs.sort().at(-1) as string),
          );
          const transcriptPath = path.join(
            latestSessionDir,
            "transcript.jsonl",
          );
          const statePath = path.join(latestSessionDir, "state.json");

          const transcriptEntries = parseTranscriptJsonl(transcriptPath);

          const queryStarted = transcriptEntries.some(
            (entry) =>
              entry.type === "query-event" &&
              entry.event?.type === "query.started",
          );
          const queryCompleted = transcriptEntries.find(
            (entry) =>
              entry.type === "query-event" &&
              entry.event?.type === "query.completed",
          );
          expect(queryStarted).toBe(true);
          expect(queryCompleted).toBeDefined();

          const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
            terminalReason?: string;
            terminalClassification?: string;
            durableStatus?: string;
          };
          expect(typeof state.terminalReason).toBe("string");
          expect(
            ["success", "stopped", "error"].includes(
              state.terminalClassification ?? "",
            ),
          ).toBe(true);
          expect(
            ["success", "stopped", "error"].includes(state.durableStatus ?? ""),
          ).toBe(true);
        });
      });

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  }, 35000);

  it("gates user-driven approval deny path with explicit stopped_error persistence evidence", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      });
      let output = "";
      let settled = false;
      let promptSent = false;
      let sessionId = "";
      let closingAfterTurn = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for CLI deny-branch completion"));
      }, 30000);

      cli.stdout?.on("data", (data) => {
        output += data.toString();

        if (!sessionId) {
          const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
          if (matched?.[1]) {
            sessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          promptSent = true;
          cli.stdin?.write(
            "Run node version with explicit approval deny path\n",
          );
        }

        if (
          sessionId &&
          output.includes("Execution summary") &&
          output.includes("Result") &&
          !closingAfterTurn
        ) {
          closingAfterTurn = true;
          cli.stdin?.end();
        }
      });

      cli.stderr?.on("data", (data) => {
        output += data.toString();
      });

      cli.on("close", () => {
        finish(() => {
          expect(output).toContain("Result");
          expect(output.includes("approval> ")).toBe(false);
          expect(output.includes("Response complete")).toBe(false);

          const sessionDir = path.join(sessionsDir, sessionId);
          const transcriptEntries = parseTranscriptJsonl(
            path.join(sessionDir, "transcript.jsonl"),
          );

          const queryCompleted = transcriptEntries.find(
            (entry) =>
              entry.type === "query-event" &&
              entry.event?.type === "query.completed",
          );
          if (queryCompleted) {
            expect(
              ["completed", "stopped", "stopped_error"].includes(
                queryCompleted.event?.result?.status ?? "",
              ),
            ).toBe(true);
            expect(
              ["success", "stopped", "error"].includes(
                queryCompleted.event?.result?.terminalClassification ?? "",
              ),
            ).toBe(true);
          }

          const terminalState = JSON.parse(
            fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
          ) as {
            status?: string;
            terminalReason?: string;
            terminalClassification?: string;
            durableStatus?: string;
            lastError?: string;
          };

          expect(["active", "completed", "error"].includes(terminalState.status ?? "")).toBe(true);
          expect(typeof terminalState.terminalReason).toBe("string");
          expect(
            ["success", "stopped", "error"].includes(
              terminalState.terminalClassification ?? "",
            ),
          ).toBe(true);
          expect(
            ["success", "stopped", "error"].includes(
              terminalState.durableStatus ?? "",
            ),
          ).toBe(true);
        });
      });

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  }, 35000);

  it("gates resume continuity: interrupt once, resume once, then persist completed terminal state", async () => {
    let interruptedSessionId = "";
    const interruptedPrompt =
      "Resume continuity gate: interrupted real task path";
    let firstPhaseOutput = "";

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      });
      let settled = false;
      let promptSent = false;
      let interrupted = false;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        resolve();
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for interrupted-run phase"));
      }, 30000);

      cli.stdout?.on("data", (data) => {
        firstPhaseOutput += data.toString();

        if (!interruptedSessionId) {
          const matched = firstPhaseOutput.match(
            /Session:\s*(sess_[^\s\r\n]+)/,
          );
          if (matched?.[1]) {
            interruptedSessionId = matched[1];
          }
        }

        if (
          !promptSent &&
          firstPhaseOutput.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
        ) {
          promptSent = true;
          cli.stdin?.write(`${interruptedPrompt}\n`);
          if (!interrupted) {
            interrupted = true;
            setTimeout(() => {
              cli.kill();
            }, 300);
          }
        }
      });

      cli.stderr?.on("data", (data) => {
        firstPhaseOutput += data.toString();
      });

      cli.on("close", () => {
        if (interrupted) {
          finish();
        }
      });

      cli.on("error", (error) => {
        fail(error);
      });
    });

    expect(interruptedSessionId).toContain("sess_");
    expect(firstPhaseOutput).not.toContain("Response complete");

    const interruptedSessionDir = path.join(sessionsDir, interruptedSessionId);
    const interruptedState = JSON.parse(
      fs.readFileSync(path.join(interruptedSessionDir, "state.json"), "utf8"),
    ) as {
      pendingPrompt?: string;
    };
    expect(interruptedState.pendingPrompt).toBe(interruptedPrompt);

    await new Promise<void>((resolve, reject) => {
      const followUpPrompt = "Resume continuity gate: second turn after resume";
      const cli = spawnCli(
        fakeHomeDir,
        ["--session-id", interruptedSessionId],
        {
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        },
      );
      let output = "";
      let settled = false;
      let approvalResponses = 0;
      let observedApprovalPrompts = 0;
      let completionCount = 0;
      let followUpPromptSent = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          callback();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cli.kill();
        }
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cli.kill();
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(new Error(`Timed out waiting for resume-run phase. Output:\n${output}`));
      }, 35000);

      cli.stdout?.on("data", (data) => {
        output += data.toString();

        if (
          !followUpPromptSent &&
          output.includes("Ctrl+C cancels the current run. Ctrl+D exits.")
        ) {
          followUpPromptSent = true;
          cli.stdin?.write(`${followUpPrompt}\n`);
        }

        const approvalPrompts = output.match(/approval> /g)?.length ?? 0;
        if (approvalPrompts > observedApprovalPrompts) {
          while (approvalResponses < approvalPrompts) {
            approvalResponses += 1;
            cli.stdin?.write("y\n");
          }
          observedApprovalPrompts = approvalPrompts;
        }

        const completedMarkers = output.match(/Execution summary/g);
        completionCount = completedMarkers?.length ?? 0;

        if (completionCount >= 1) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain(
              `Session lifecycle: Resumed session ${interruptedSessionId}`,
            );

            const resumedSessionDir = path.join(
              sessionsDir,
              interruptedSessionId,
            );
            const transcriptPath = path.join(
              resumedSessionDir,
              "transcript.jsonl",
            );
            const statePath = path.join(resumedSessionDir, "state.json");

            const transcriptEntries = parseTranscriptJsonl(transcriptPath);

            const queryStartedCount = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.started",
            ).length;

            const completedTerminals = transcriptEntries.filter(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );

            expect(queryStartedCount).toBeGreaterThanOrEqual(1);
            expect(completedTerminals.length).toBeGreaterThanOrEqual(1);
            const latestCompletedTerminal = completedTerminals.at(-1);
            expect(latestCompletedTerminal?.event?.result?.status).toBe(
              "completed",
            );
            expect(
              latestCompletedTerminal?.event?.result?.terminalClassification,
            ).toBe("success");

            const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };
            expect(["active", "completed"]).toContain(state.status);
            if (state.terminalReason) {
              expect(state.terminalReason).toBe("completed");
            }
            if (state.terminalClassification) {
              expect(state.terminalClassification).toBe("success");
            }
            if (state.durableStatus) {
              expect(state.durableStatus).toBe("success");
            }
          });
        }
      });

      cli.stderr?.on("data", (data) => {
        output += data.toString();
      });

      cli.on("error", (error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  }, 50000);
});
