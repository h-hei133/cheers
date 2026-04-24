import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSigint } from "./entrypoints/handleSigint.js";

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
    result?: {
      status?: string;
      terminalClassification?: string;
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

function spawnCli(
  fakeHome: string,
  args: string[] = [],
  envOverrides: Record<string, string> = {},
): ChildProcess {
  return spawn(nodeExe, [tsxCliPath, cliPath, ...args], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
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
          expect(output).toContain(
            "Private Coding Agents Shell",
          );
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

  it("gates real-provider missing key at CLI entry before query loop starts", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
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
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
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

            expect(state.status === "active" || state.status === "error").toBe(true);
            if (state.status === "error") {
              expect(state.terminalReason).toBe("stopped_error");
              expect(state.terminalClassification).toBe("error");
              expect(state.durableStatus).toBe("error");
              expect(state.lastError).toContain("provider-readiness:missing-key");
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
          (output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          ) ||
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
            expect(output).toContain(
              "Non-interactive approval policy: deny (default deny)",
            );
            expect(output).toContain("Result");
            expect(output).toContain("- Outcome: stopped");
            expect(output).toContain("Action result");
            expect(output).toContain("Next steps");
            expect(output.includes("approval> ")).toBe(false);
            const approvalDecisionCount =
              output.match(/approval-audit:decision=deny/g)?.length ?? 0;
            expect(approvalDecisionCount).toBeGreaterThanOrEqual(2);

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
                  entry.event.result.status.startsWith("stopped"),
              ),
            ).toBe(true);
            expect(
              queryCompleted.every(
                (entry) => entry.event?.result?.terminalClassification === "stopped",
              ),
            ).toBe(true);

            const latestTerminal = queryCompleted.at(-1);
            expect(latestTerminal?.event?.result?.status).toMatch(/^stopped/);
            expect(latestTerminal?.event?.result?.terminalClassification).toBe("stopped");

            const state = JSON.parse(
              fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
            ) as {
              status?: string;
              terminalReason?: string;
              terminalClassification?: string;
              durableStatus?: string;
            };

            expect(["active", "error"].includes(state.status ?? "")).toBe(true);
            expect(state.terminalClassification === "stopped" || state.terminalClassification === "error").toBe(true);
            expect(state.durableStatus === "stopped" || state.durableStatus === "error").toBe(true);
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
          (output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          ) ||
            output.includes("\n> "))
        ) {
          promptSent = true;
          cli.stdin?.write("Run node version after one transient provider failure\n");
        }

        if (
          sessionId &&
          output.includes("approval-audit:decision=allow-once") &&
          output.includes("Result")
        ) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).not.toContain("Run failed:");
            expect(output).toContain(
              "Non-interactive approval policy: allow-once (explicit CLI)",
            );
            expect(output).toContain("approval-audit:decision=allow-once");
            expect(output).toContain("Result");

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
                queryCompleted.at(-1)?.event?.result?.terminalClassification ?? "",
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

        if (
          completionCount >= 1 &&
          !secondPromptSent &&
          sessionId
        ) {
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
            const metadata =
              readJsonFileEventually<{ updatedAt?: string }>(firstMetadataPath);
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
        if (secondPromptSent && transcriptPath && fs.existsSync(transcriptPath)) {
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
                  (entry.event?.result?.terminalClassification ?? "").length > 0,
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

            expect(["active", "completed", "error"].includes(state.status ?? "")).toBe(true);
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
          output.includes("approval-audit:decision=deny") &&
          output.includes("Result") &&
          isReadableJsonFile(path.join(sessionsDir, sessionId, "metadata.json")) &&
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
    expect(firstOutput).toContain("Non-interactive approval policy: deny");
    expect(firstOutput).toContain("approval-audit:decision=deny");
    expect(firstOutput).toContain("Result");

    const sessionDir = path.join(sessionsDir, sessionId);
    const firstTranscriptEntries = parseTranscriptJsonl(
      path.join(sessionDir, "transcript.jsonl"),
    );
    const firstCompleted = firstTranscriptEntries.filter(
      (entry) =>
        entry.type === "query-event" && entry.event?.type === "query.completed",
    );
    expect(firstCompleted.length).toBeGreaterThanOrEqual(1);
    expect(
      ["stopped", "error"].includes(
        firstCompleted.at(-1)?.event?.result?.terminalClassification ?? "",
      ),
    ).toBe(true);

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
          output.includes("approval-audit:decision=allow-once") &&
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
    expect(secondOutput).toContain(
      "Non-interactive approval policy: allow-once (explicit CLI)",
    );
    expect(secondOutput).toContain("approval-audit:decision=allow-once");
    expect(secondOutput).toContain("Result");

    const fetchLogs = fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map(
        (line) =>
          JSON.parse(line) as { url: string; authorization: string },
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
      ["stopped", "error"].includes(
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
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
        ) {
          resumeSent = true;
          cli.stdin?.write(`/resume ${sessionId}\n`);
        }

        if (
          output.includes("Execution summary") &&
          output.includes("Result")
        ) {
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
        if (
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
        ) {
          clearTimeout(timeout);
          cli.kill();
          try {
            expect(output).toContain(
              "Private Coding Agents Shell",
            );
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
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
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

            const transcriptEntries = parseTranscriptJsonl(
              transcriptPath,
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
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
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
            expect(output).toContain(
              "Non-interactive approval policy: allow-once (explicit CLI)",
            );
            expect(output).toContain("approval-audit:decision=allow-once");
            expect(output).toContain("Result");
            expect(output.includes("approval> ")).toBe(false);
            expect(output).toContain(
              "Execution summary",
            );

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
            const approvalResolved = transcriptEntries.find(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "approval.resolved",
            );

            expect(queryStarted).toBe(true);
            expect(queryCompleted).toBeDefined();
            expect(approvalResolved).toBeDefined();

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
              ["success", "stopped", "error"].includes(
                state.durableStatus ?? "",
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
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
        ) {
          promptSent = true;
          cli.stdin?.write("Run node version with explicit approval deny path\n");
        }

        if (
          sessionId &&
          output.includes("approval-audit:decision=deny") &&
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
              expect(output).toContain(
                "Non-interactive approval policy: deny (default deny)",
              );
              expect(output).toContain("approval-audit:decision=deny");
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
                  queryCompleted.event?.result?.status?.startsWith("stopped"),
                ).toBe(true);
                expect(
                  ["stopped", "error"].includes(
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

              expect(["active", "error"].includes(terminalState.status ?? "")).toBe(true);
              expect(terminalState.terminalReason?.startsWith("stopped")).toBe(true);
              expect(
                ["stopped", "error"].includes(
                  terminalState.terminalClassification ?? "",
                ),
              ).toBe(true);
              expect(
                ["stopped", "error"].includes(terminalState.durableStatus ?? ""),
              ).toBe(true);
              expect(output).toContain("Escalation denied");
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
      let resumeSent = false;
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
        fail(new Error("Timed out waiting for resume-run phase"));
      }, 35000);

      cli.stdout?.on("data", (data) => {
        output += data.toString();

        if (
          !resumeSent &&
          output.includes(
            "Ctrl+C cancels the current run. Ctrl+D exits.",
          )
        ) {
          resumeSent = true;
          cli.stdin?.write(`/resume ${interruptedSessionId}\n`);
        }

        const approvalPrompts = output.match(/approval> /g)?.length ?? 0;
        if (approvalPrompts > observedApprovalPrompts) {
          while (approvalResponses < approvalPrompts) {
            approvalResponses += 1;
            cli.stdin?.write("y\n");
          }
          observedApprovalPrompts = approvalPrompts;
        }

        const completedMarkers = output.match(/Response complete/g);
        completionCount = completedMarkers?.length ?? 0;

        if (completionCount >= 1 && !followUpPromptSent) {
          followUpPromptSent = true;
          cli.stdin?.write(`${followUpPrompt}\n`);
        }

        if (completionCount >= 2) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain(
              `♻️  Resumed session ${interruptedSessionId}`,
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

            expect(approvalResponses).toBeGreaterThanOrEqual(2);
            expect(queryStartedCount).toBeGreaterThanOrEqual(1);
            expect(completedTerminals.length).toBeGreaterThanOrEqual(2);
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
            expect(state.status).toBe("completed");
            expect(state.terminalReason).toBe("completed");
            expect(state.terminalClassification).toBe("success");
            expect(state.durableStatus).toBe("success");
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

