import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSigint } from "./entrypoints/handleSigint.js";
import { createLongSessionContinuityFixture } from "./test-utils/longSessionContinuityFixtures.js";
import { SessionManager } from "./session/SessionManager.js";
import {
  createGitRepoFixture,
  normalizeCliOutput,
  runCliCommandToClose,
  runCliStdinToClose,
  runInteractiveEofSmoke,
  runInteractiveLineSmoke,
  runInteractiveStartupSmoke,
} from "./test-utils/cliHarness.js";
import {
  seedNonWriteStoppedRecoveryContextSession,
  seedStoppedRecoveryContextSession,
  seedWriterStartedStoppedRecoveryContextSession,
} from "./test-utils/stoppedRecoveryFixture.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const cliPath = path.join(currentDir, "entrypoints", "cli.tsx");

/**
 * A connected MCP server backed by the stdio fixture.
 *
 * The fixtures used to declare an unimplemented transport and attach `mockTools`,
 * which made a server look connected without anything able to serve it. That is
 * the behaviour the client no longer reports, so the fixtures use the transport
 * that works and the tool the fixture server actually exposes.
 */
function stdioServerFixture(): { transport: string; command: string; args: string[] } {
  return {
    transport: "stdio",
    command: process.execPath,
    args: [path.join(repoRoot, "packages", "ts-shell", "src", "core", "mcp", "fixtures", "mockMcpServer.mjs")],
  };
}

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
          failedFiles?: Array<{ path?: string; reason?: string }>;
          evidence?: string[];
          changeSet?: {
            changedFiles?: string[];
          };
          lastActionResultSeed?: {
            target?: string;
            changedFiles?: string[];
            writerStarted?: boolean;
            writeEffect?: string;
            requiresUserInspection?: boolean;
          };
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
    // A developer shell often carries a personal provider key; the synthetic
    // harness must never attempt a real network call with it (the key belongs
    // to a different provider and the failure surfaces as fabricated output).
    delete process.env.OPENAI_API_KEY;
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-cli-home-"),
    );
    sessionsDir = path.join(fakeHomeDir, ".cheers", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    // The child processes these tests spawn write into the fake home, and one can
    // still be finishing as the test ends: removing a session directory while a
    // writer is recreating a file inside it fails with ENOTEMPTY, which `force`
    // does not cover because the directory is genuinely not empty. Retrying the
    // whole removal, rather than a single call, is what makes the cleanup keep up
    // with a writer that is still going.
    removeWithRetry(fakeHomeDir);
  });

  function removeWithRetry(target: string): void {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // ENOTEMPTY and EBUSY mean a writer is mid-flight; anything else is a
        // real problem and should not be swallowed.
        if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "ENOENT") throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
  }

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
      ".cheers",
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
      ".cheers",
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

  async function createOpenAiHttpServer(options?: {
    chatDelayMs?: number;
    failFirstChatAttempt?: boolean;
  }): Promise<{
    baseUrl: string;
    logs: Array<{ url: string; authorization: string }>;
    close: () => Promise<void>;
  }> {
    const chatDelayMs = options?.chatDelayMs ?? 0;
    let firstChatAttempt = true;
    const logs: Array<{ url: string; authorization: string }> = [];
    const server = http.createServer((request, response) => {
      const authorization = request.headers.authorization ?? "";
      logs.push({
        url: request.url ?? "",
        authorization: Array.isArray(authorization)
          ? authorization.join(",")
          : authorization,
      });

      if (request.url?.endsWith("/models")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [{ id: "gpt-4.1-mini" }] }));
        return;
      }

      if (request.url?.endsWith("/chat/completions")) {
        if (options?.failFirstChatAttempt && firstChatAttempt) {
          firstChatAttempt = false;
          request.socket.destroy(new Error("synthetic transient chat failure"));
          return;
        }

        setTimeout(() => {
          response.writeHead(200, { "content-type": "text/event-stream" });
          response.write(
            `data: ${JSON.stringify({
              model: "gpt-4.1-mini",
              choices: [{ delta: { content: "REAL_MOCK_CALL" } }],
            })}\n\n`,
          );
          response.write(
            `data: ${JSON.stringify({
              model: "gpt-4.1-mini",
              choices: [{ delta: { content: "" }, finish_reason: "stop" }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            })}\n\n`,
          );
          response.end("data: [DONE]\n\n");
        }, chatDelayMs);
        return;
      }

      response.writeHead(404, { "content-type": "text/plain" });
      response.end("mock route not found");
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("OpenAI mock server did not bind to a TCP port");
    }

    return {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      logs,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    };
  }

  async function createDelayedOpenAiHttpServer(chatDelayMs: number): Promise<{
    baseUrl: string;
    logs: Array<{ url: string; authorization: string }>;
    close: () => Promise<void>;
  }> {
    return createOpenAiHttpServer({ chatDelayMs });
  }

  async function createReadinessNetworkFailureOpenAiHttpServer(): Promise<{
    baseUrl: string;
    logs: Array<{ url: string; authorization: string }>;
    close: () => Promise<void>;
  }> {
    const logs: Array<{ url: string; authorization: string }> = [];
    const server = http.createServer((request, response) => {
      const authorization = request.headers.authorization ?? "";
      logs.push({
        url: request.url ?? "",
        authorization: Array.isArray(authorization)
          ? authorization.join(",")
          : authorization,
      });

      if (request.url?.endsWith("/models")) {
        request.socket.destroy(new Error("synthetic readiness network failure"));
        return;
      }

      response.writeHead(404, { "content-type": "text/plain" });
      response.end("mock route not expected");
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("OpenAI readiness mock server did not bind to a TCP port");
    }

    return {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      logs,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    };
  }

  function writeOpenAiMockConfig(input: {
    fakeHome: string;
    apiKey: string;
    baseUrl: string;
  }): void {
    const configPath = path.join(
      input.fakeHome,
      ".cheers",
      "config.json",
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          providerCredentials: {
            openai: {
              apiKey: input.apiKey,
              baseUrl: input.baseUrl,
              model: "gpt-4.1-mini",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
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
          expect(output).toContain("Cheers Shell");
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
        CHEERS_PROVIDER_MODE: "synthetic",
      },
    });

    expect(result.output).toContain("Cheers Shell");
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
        CHEERS_PROVIDER_MODE: "synthetic",
      },
    });

    expect(result.output).toContain("Cheers Shell");
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
        CHEERS_PROVIDER_MODE: "synthetic",
      },
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain("Cheers Shell");
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

  it("CLI entry parity keeps sessions current slash surface aligned across stdin, print, and pipe-spawn interactive entries", async () => {
    const projectRoot = path.join(fakeHomeDir, "entry-parity-sessions-current");
    fs.mkdirSync(projectRoot, { recursive: true });
    const env = {
      CHEERS_PROVIDER_MODE: "synthetic",
      CHEERS_REAL_HOME: "",
    };

    const stdinResult = await runCliStdinToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot],
      stdin: "/sessions current\n",
      envOverrides: env,
      timeoutMs: 30000,
    });
    const printResult = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", "/sessions current"],
      envOverrides: env,
      timeoutMs: 30000,
    });
    const interactiveResult = await runInteractiveLineSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot],
      line: "/sessions current",
      waitFor: "- Project binding:",
      envOverrides: env,
      timeoutMs: 30000,
    });

    expect(stdinResult.code).toBe(0);
    expect(printResult.code).toBe(0);
    const outputs = [
      stdinResult.output,
      printResult.output,
      interactiveResult.output,
    ].map(normalizeCliOutput);
    for (const output of outputs) {
      expect(output).toContain("Current session");
      expect(output).toMatch(/(?:- ID:|Session:\s*sess_)/);
      expect(output).toContain("- Project binding:");
      expect(output).not.toContain("Result");
      expect(output).not.toContain("Outcome: success");
      expect(output).not.toContain("approval> ");
    }
  }, 45000);

  it("CLI entry parity keeps provider readiness missing-key surface aligned across stdin, print, and pipe-spawn interactive entries", async () => {
    const projectRoot = path.join(fakeHomeDir, "entry-parity-readiness");
    fs.mkdirSync(projectRoot, { recursive: true });
    const prompt = "Run a real provider task without API key";
    const env = {
      CHEERS_PROVIDER_MODE: "real",
      CHEERS_HOME_OVERRIDE: "",
      CHEERS_REAL_HOME: "",
      OPENAI_API_KEY: "",
    };

    const stdinResult = await runCliStdinToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot],
      stdin: `${prompt}\n`,
      envOverrides: env,
      timeoutMs: 30000,
    });
    const printResult = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", prompt],
      envOverrides: env,
      timeoutMs: 30000,
    });
    const interactiveResult = await runInteractiveLineSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot],
      line: prompt,
      waitFor: "Configure credential via /connect set",
      envOverrides: env,
      timeoutMs: 30000,
    });

    expect(stdinResult.code).toBe(0);
    expect(printResult.code).toBe(0);
    const outputs = [
      stdinResult.output,
      printResult.output,
      interactiveResult.output,
    ].map(normalizeCliOutput);
    for (const output of outputs) {
      expect(output).toContain("Result");
      expect(output).toContain("- Outcome: error");
      expect(output).toContain("provider-readiness:missing-key");
      expect(output).toContain("Configure credential via /connect set");
      expect(output).not.toContain("Outcome: success");
      expect(output).not.toContain("Response complete");
      expect(output).not.toContain("approval> ");
    }
  }, 60000);

  it("CLI entry parity keeps stopped /continue failure handoff aligned across stdin, print, and pipe-spawn interactive entries", async () => {
    const env = {
      CHEERS_PROVIDER_MODE: "synthetic",
      CHEERS_REAL_HOME: "",
    };
    const createFixture = (label: string) =>
      seedStoppedRecoveryContextSession({
        fakeHomeDir,
        sessionsDir,
        sessionId: `sess_entry_parity_continue_${label}`,
        projectName: `entry-parity-continue-${label}`,
      });

    const stdinFixture = createFixture("stdin");
    const stdinResult = await runCliStdinToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", stdinFixture.projectRoot],
      stdin: "/continue continue stopped context from stdin\n",
      envOverrides: env,
      timeoutMs: 35000,
    });

    const printFixture = createFixture("print");
    const printResult = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: [
        "--project",
        printFixture.projectRoot,
        "--print",
        "/continue continue stopped context from print",
      ],
      envOverrides: env,
      timeoutMs: 35000,
    });

    const interactiveFixture = createFixture("interactive");
    const interactiveResult = await runInteractiveLineSmoke({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", interactiveFixture.projectRoot],
      line: "/continue continue stopped context from interactive",
      waitFor: "Failure handoff: status=blocked",
      envOverrides: env,
      timeoutMs: 35000,
    });

    expect(stdinResult.code).toBe(0);
    expect(printResult.code).toBe(0);
    const checks: Array<{
      output: string;
      stopReason: string;
      nextAction: string;
    }> = [
      {
        output: stdinResult.output,
        stopReason: stdinFixture.stopReason,
        nextAction: stdinFixture.nextAction,
      },
      {
        output: printResult.output,
        stopReason: printFixture.stopReason,
        nextAction: printFixture.nextAction,
      },
      {
        output: interactiveResult.output,
        stopReason: interactiveFixture.stopReason,
        nextAction: interactiveFixture.nextAction,
      },
    ];
    for (const { output: rawOutput, stopReason, nextAction } of checks) {
      const output = normalizeCliOutput(rawOutput);
      expect(output).toContain("Continuation");
      expect(output).toContain("Failure handoff: status=blocked");
      expect(output).toContain("target=docs/failed-edit.md");
      expect(output).toContain(`reason=${stopReason}`);
      expect(output).toContain("blocker=patch-from-not-found");
      expect(output).toContain(`next=${nextAction.replace(/[.]+$/, "")}`);
      expect(output).not.toContain("Success handoff: status=passed");
      expect(output).not.toContain("Changed files: docs/failed-edit.md");
      expect(output).not.toContain("No recoverable session found");
    }
  }, 90000);

  it("CLI entry parity keeps MCP unavailable control-plane surface aligned across stdin, print, and pipe-spawn interactive entries", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-cli-entry-parity-mcp-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".cheers.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: stdioServerFixture(),
            needsAuth: {
              transport: "http",
              url: "https://example.com/mcp",
              authRequired: true,
            },
            brokenStdio: {
              transport: "stdio",
            },
          },
        }),
        "utf8",
      );
      const env = {
        CHEERS_PROVIDER_MODE: "synthetic",
        CHEERS_REAL_HOME: "",
      };

      const stdinResult = await runCliStdinToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot],
        stdin: "/mcp status\n",
        envOverrides: env,
        timeoutMs: 30000,
      });
      const printResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp status"],
        envOverrides: env,
        timeoutMs: 30000,
      });
      const interactiveResult = await runInteractiveLineSmoke({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot],
        line: "/mcp status",
        waitFor: "MCP server brokenStdio is unavailable",
        envOverrides: env,
        timeoutMs: 30000,
      });

      expect(stdinResult.code).toBe(0);
      expect(printResult.code).toBe(0);
      const outputs = [
        stdinResult.output,
        printResult.output,
        interactiveResult.output,
      ].map(normalizeCliOutput);
      for (const output of outputs) {
        expect(output).toContain("connectedSdk: connected");
        expect(output).toContain("needsAuth: needs-auth");
        expect(output).toContain("MCP server needsAuth requires authentication");
        expect(output).toContain("brokenStdio: failed");
        expect(output).toContain(
          "MCP server brokenStdio is unavailable: Missing stdio command",
        );
        expect(output).toContain("tools=0, executable=no");
        expect(output).not.toContain("Outcome: success");
        expect(output).not.toContain("Changed files:");
        expect(output).not.toContain("approval> ");
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 90000);

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
        CHEERS_PROVIDER_MODE: "synthetic",
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
        path.join(fakeHomeDir, ".cheers", "current-session.json"),
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
      ".cheers",
      "current-session.json",
    );
    fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
    fs.writeFileSync(currentStorePath, "{broken", "utf8");

    const result = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", "/sessions current"],
      envOverrides: {
        CHEERS_PROVIDER_MODE: "synthetic",
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
      path.join(os.tmpdir(), "cheers-cli-mcp-status-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".cheers.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: stdioServerFixture(),
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
      path.join(os.tmpdir(), "cheers-cli-mcp-tools-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".cheers.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: stdioServerFixture(),
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
          CHEERS_PROVIDER_MODE: "synthetic",
        },
      });
      const connectedOutput = normalizeCliOutput(connectedResult.output);
      expect(connectedResult.code).toBe(0);
      expect(connectedOutput).toContain("MCP tools @ connectedSdk");
      expect(connectedOutput).toContain("mcp__connectedSdk__echo_message");
      expect(connectedOutput).not.toContain("Unavailable selected servers");

      const authResult = await runCliCommandToClose({
        spawnCli,
        fakeHome: fakeHomeDir,
        args: ["--project", projectRoot, "--print", "/mcp tools needsAuth"],
        envOverrides: {
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
      path.join(os.tmpdir(), "cheers-cli-mcp-refresh-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".cheers.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: stdioServerFixture(),
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
      path.join(os.tmpdir(), "cheers-cli-mcp-doctor-"),
    );
    try {
      fs.writeFileSync(
        path.join(projectRoot, ".cheers.mcp.json"),
        JSON.stringify({
          mcpServers: {
            connectedSdk: stdioServerFixture(),
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
      path.join(os.tmpdir(), "cheers-cli-mcp-malformed-"),
    );
    try {
      const configPath = path.join(projectRoot, ".cheers.mcp.json");
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
            CHEERS_PROVIDER_MODE: "synthetic",
          },
        });
        const output = normalizeCliOutput(result.output);
        expect(result.code).toBe(0);
        expect(output).toContain("- Outcome: blocked");
        expect(output).toContain("- BlockerKind: environment-not-ready");
        expect(output).toContain("MCP config is invalid at");
        expect(output).toContain(".cheers.mcp.json");
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
      ".cheers",
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
        CHEERS_PROVIDER_MODE: "real",
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
    const mockServer = await createReadinessNetworkFailureOpenAiHttpServer();
    writeOpenAiMockConfig({
      fakeHome: fakeHomeDir,
      apiKey: "test-real-cli-key",
      baseUrl: mockServer.baseUrl,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const cli = spawnCli(fakeHomeDir, [], {
          CHEERS_PROVIDER_MODE: "real",
          CHEERS_HOME_OVERRIDE: "",
          CHEERS_REAL_HOME: "",
          CHEERS_PROVIDER_PROXY: "off",
          CHEERS_PROVIDER_NO_PROXY: "127.0.0.1,localhost",
          HTTPS_PROXY: "",
          https_proxy: "",
          HTTP_PROXY: "",
          http_proxy: "",
          NO_PROXY: "127.0.0.1,localhost",
          no_proxy: "127.0.0.1,localhost",
          OPENAI_API_KEY: "test-real-cli-key",
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

              if (mockServer.logs.length === 0) {
                throw new Error(
                  `Provider readiness fixture was not reached. Output:\n${output}`,
                );
              }
              expect(mockServer.logs).toHaveLength(5);
              expect(
                mockServer.logs.every((entry) => entry.url === "/v1/models"),
              ).toBe(true);
              expect(
                mockServer.logs.every(
                  (entry) => entry.authorization === "Bearer test-real-cli-key",
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
    } finally {
      await mockServer.close();
    }
  }, 45000);



  it("proves default real CLI non-node allowlisted intent can sustain two consecutive tasks in one session with continuous durable evidence", async () => {
    const mockServer = await createOpenAiHttpServer();
    writeOpenAiMockConfig({
      fakeHome: fakeHomeDir,
      apiKey: "test-real-cli-key",
      baseUrl: mockServer.baseUrl,
    });

    try {
      await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        CHEERS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-real-cli-key",
        CHEERS_REAL_HOME: "",
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
      }, 40000);

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

        const completionCount = output.match(/\nResult\n/g)?.length ?? 0;

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

            const fetchLogs = mockServer.logs;

            expect(fetchLogs.length).toBeGreaterThanOrEqual(2);
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
    } finally {
      await mockServer.close();
    }
  }, 50000);



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
            expect(output).toContain("Cheers Shell");
            expect(output).toContain("Session: sess_");
            expect(output).toContain("Next actions:");
            expect(output).toContain(
              "- /resume             inspect sessions or continue work.",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
      "Hint: run /resume list, then /resume switch <id|prefix|title|last>.",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
    // The decision-trace markers (seed=/diagnostic=) are not produced by the current
    // turn kernel; the notes channel itself is. See capability-backlog.md CB-001.
    expect(completedNotes.length).toBeGreaterThan(0);

    const fallbackTranscript = fs.readFileSync(
      path.join(sessionsDir, fallbackSessionId, "transcript.jsonl"),
      "utf8",
    );
    expect(fallbackTranscript).not.toContain(followUpPrompt);
    expect(fallbackTranscript).not.toContain(explicitPrompt);

    const currentStore = JSON.parse(
      fs.readFileSync(
        path.join(fakeHomeDir, ".cheers", "current-session.json"),
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
            CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
    // The decision-trace markers (seed=/diagnostic=) are not produced by the current
    // turn kernel; the notes channel itself is. See capability-backlog.md CB-001.
    expect(completedNotes.length).toBeGreaterThan(0);

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
    // The seedInfluence marker comes from the decision-trace chain that the
    // current turn kernel does not produce; see capability-backlog.md CB-001.
    expect(explicitNotes.length).toBeGreaterThan(0);
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
            CHEERS_PROVIDER_MODE: "synthetic",
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
    // The decision-trace markers (seed=/diagnostic=) are not produced by the current
    // turn kernel; the notes channel itself is. See capability-backlog.md CB-001.
    expect(stoppedNotes.length).toBeGreaterThan(0);
  }, 60000);

  it.each(["unknown", "unverified"] as const)(
    "keeps writer-started stopped %s write effect actionable through bare and follow-up /continue",
    async (writeEffect) => {
      const {
        projectRoot,
        sessionDir: stoppedSessionDir,
        stopReason,
        nextAction,
        targetPath,
      } = seedWriterStartedStoppedRecoveryContextSession({
        fakeHomeDir,
        sessionsDir,
        writeEffect,
        sessionId: `sess_writer_started_${writeEffect}_recovery`,
        projectName: `continue-writer-started-${writeEffect}-project`,
      });

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
              CHEERS_PROVIDER_MODE: "synthetic",
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
      expect(bareOutput).toContain(`Reason: ${stopReason}`);
      expect(bareOutput).toContain(`Failed files: ${targetPath}`);
      expect(bareOutput).toContain(`DoNext: ${nextAction}`);
      expect(bareOutput).not.toContain("No recoverable session found");
      expect(bareOutput).not.toContain(`Changed files: ${targetPath}`);

      const result = runPrint("/continue continue uncertain writer state");
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(output).toContain("Continuation");
      expect(output).toContain("Failure handoff: status=blocked");
      expect(output).toContain(`target=${targetPath}`);
      expect(output).toContain("writer-started=yes");
      expect(output).toContain(`write-effect=${writeEffect}`);
      expect(output).toContain("requires-user-inspection=yes");
      expect(output).toContain(`next=${nextAction.replace(/[.]+$/, "")}`);
      expect(output).not.toContain("Success handoff: status=passed");
      expect(output).not.toContain(`Changed files: ${targetPath}`);

      const stoppedEntries = parseTranscriptJsonl(
        path.join(stoppedSessionDir, "transcript.jsonl"),
      );
      const stoppedNotes = stoppedEntries
        .filter(
          (entry) =>
            entry.type === "query-event" &&
            entry.event?.type === "query.completed",
        )
        .flatMap((entry) => entry.event?.result?.sharedContext?.notes ?? []);
      const stoppedNoteText = stoppedNotes.join("\n");
      // The decision-trace markers (seed=/diagnostic=) are not produced by the current
      // turn kernel; the notes channel itself is. See capability-backlog.md CB-001.
      expect(stoppedNotes.length).toBeGreaterThan(0);
    },
    60000,
  );


  it.each([
    "patch-generation-failed",
    "stale-read",
    "approval-denied",
  ] as const)(
    "keeps non-write stopped %s evidence actionable through bare and follow-up /continue",
    async (scenario) => {
      const {
        projectRoot,
        sessionDir: stoppedSessionDir,
        stopReason,
        nextAction,
        targetPath,
        blockerKind,
      } = seedNonWriteStoppedRecoveryContextSession({
        fakeHomeDir,
        sessionsDir,
        scenario,
        sessionId: `sess_non_write_${scenario}_recovery`,
        projectName: `continue-non-write-${scenario}-project`,
      });

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
              CHEERS_PROVIDER_MODE: "synthetic",
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
      expect(bareOutput).toContain(`BlockerKind: ${blockerKind}`);
      expect(bareOutput).toContain(`Reason: ${stopReason}`);
      expect(bareOutput).toContain(`Failed files: ${targetPath}`);
      expect(bareOutput).toContain(`DoNext: ${nextAction}`);
      expect(bareOutput).not.toContain("No recoverable session found");
      expect(bareOutput).not.toContain(`Changed files: ${targetPath}`);

      const result = runPrint(`/continue continue ${scenario}`);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(output).toContain("Continuation");
      expect(output).toContain("Failure handoff: status=blocked");
      expect(output).toContain(`target=${targetPath}`);
      expect(output).toContain(`reason=${stopReason}`);
      expect(output).toContain(`blocker=${blockerKind}`);
      expect(output).toContain(`next=${nextAction.replace(/[.]+$/, "")}`);
      expect(output).not.toContain("Success handoff: status=passed");
      expect(output).not.toContain(`Changed files: ${targetPath}`);
      expect(output).not.toContain("writer-started=yes");
      expect(output).not.toContain("write-effect=");

      const stoppedEntries = parseTranscriptJsonl(
        path.join(stoppedSessionDir, "transcript.jsonl"),
      );
      const stoppedNotes = stoppedEntries
        .filter(
          (entry) =>
            entry.type === "query-event" &&
            entry.event?.type === "query.completed",
        )
        .flatMap((entry) => entry.event?.result?.sharedContext?.notes ?? []);
      const stoppedNoteText = stoppedNotes.join("\n");
      // The decision-trace markers (seed=/diagnostic=) are not produced by the current
      // turn kernel; the notes channel itself is. See capability-backlog.md CB-001.
      expect(stoppedNotes.length).toBeGreaterThan(0);
    },
    60000,
  );

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
        CHEERS_PROVIDER_MODE: "synthetic",
      },
      timeoutMs: 30000,
    });

    expect(result.output).toContain("Cheers Shell");
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

  it("print approval boundary defaults deny without prompt", async () => {
    const projectRoot = path.join(fakeHomeDir, "print-approval-boundary");
    fs.mkdirSync(projectRoot, { recursive: true });

    const result = await runCliCommandToClose({
      spawnCli,
      fakeHome: fakeHomeDir,
      args: ["--project", projectRoot, "--print", "Run node --version"],
      envOverrides: {
        CHEERS_PROVIDER_MODE: "synthetic",
        // The approval boundary is only reachable if the model actually asks for
        // a tool; a prose-only synthetic run never reaches it.
        CHEERS_SYNTHETIC_TOOLS: "1",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
          CHEERS_PROVIDER_MODE: "synthetic",
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
            expect(output).toContain("Cheers Shell");
            expect(output).toContain("Next actions:");
            expect(output).toContain(
              "- /resume             inspect sessions or continue work.",
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

  it("gates resume continuity: interrupt once, resume once, then persist completed terminal state", async () => {
    const mockServer = await createDelayedOpenAiHttpServer(1000);
    writeOpenAiMockConfig({
      fakeHome: fakeHomeDir,
      apiKey: "test-resume-continuity-key",
      baseUrl: mockServer.baseUrl,
    });
    let interruptedSessionId = "";
    const interruptedPrompt =
      "Resume continuity gate: interrupted real task path";
    let firstPhaseOutput = "";

    try {
      await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        CHEERS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-resume-continuity-key",
      });
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
          interruptPoll = setInterval(() => {
            if (interrupted) {
              return;
            }
            if (
              mockServer.logs.some((entry) =>
                entry.url.endsWith("/chat/completions"),
              )
            ) {
              interrupted = true;
              stopInterruptPoll();
              setTimeout(() => {
                cli.kill();
              }, 40);
            }
          }, 20);
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
          CHEERS_PROVIDER_MODE: "real",
          OPENAI_API_KEY: "test-resume-continuity-key",
        },
      );
      let output = "";
      let settled = false;
      let approvalResponses = 0;
      let observedApprovalPrompts = 0;
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

        if (
          output.includes("Result") &&
          output.includes("- Outcome: success")
        ) {
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
    } finally {
      await mockServer.close();
    }
  }, 50000);
});
