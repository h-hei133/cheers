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
            "🤖 Private Coding Agents Shell (ts-shell MVP)",
          );
          expect(output).toContain("Session: sess_");
          expect(output).toContain(
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
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
    expect(rendered).toContain("\n⚠️  Run cancelled by user (Ctrl+C)");
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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          promptSent = true;
          cli.stdin?.write("Run a real provider task without API key\n");
        }

        if (
          sessionId &&
          output.includes("provider-readiness:missing-key") &&
          output.includes(
            "Hint: set OPENAI_API_KEY in your shell, then submit another prompt.",
          )
        ) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain("❌ Run failed:");
            expect(output).toContain("provider-readiness:missing-key");
            expect(output).toContain(
              "Hint: set OPENAI_API_KEY in your shell, then submit another prompt.",
            );
            expect(output.includes("approval> ")).toBe(false);
            expect(output.includes("✅ Response complete")).toBe(false);

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

            expect(state.status).toBe("error");
            expect(state.terminalReason).toBe("stopped_error");
            expect(state.terminalClassification).toBe("error");
            expect(state.durableStatus).toBe("error");
            expect(state.lastError).toContain("provider-readiness:missing-key");
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

  it("proves CLI real success chain with explicit approval and completed persistence", async () => {
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
      let promptSent = false;
      let approvalSent = false;
      let sessionId = "";
      const promptText =
        "Run node version in this workspace (real chain smoke)\n";

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
            `Timed out waiting for CLI real success chain completion. Output:\n${output}`,
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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          ) ||
            output.includes("\n> "))
        ) {
          promptSent = true;
          cli.stdin?.write(promptText);
        }

        if (!approvalSent && output.includes("approval> ")) {
          approvalSent = true;
          cli.stdin?.write("y\n");
        }

        if (sessionId && output.includes("✅ Response complete")) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain(
              "[approval] Permission escalation required",
            );
            expect(output).toContain("[approval] decision=allow-once");

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
            expect(chatCalls.length).toBeGreaterThanOrEqual(3);
            expect(
              chatCalls.every(
                (entry) => entry.authorization === "Bearer test-real-cli-key",
              ),
            ).toBe(true);

            const sessionDir = path.join(sessionsDir, sessionId);
            const transcriptEntries = parseTranscriptJsonl(
              path.join(sessionDir, "transcript.jsonl"),
            );
            const queryCompleted = transcriptEntries.find(
              (entry) =>
                entry.type === "query-event" &&
                entry.event?.type === "query.completed",
            );

            expect(queryCompleted?.event?.result?.status).toBe("completed");
            expect(queryCompleted?.event?.result?.terminalClassification).toBe(
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

            expect(state.status).toBe("completed");
            expect(state.terminalReason).toBe("completed");
            expect(state.terminalClassification).toBe("success");
            expect(state.durableStatus).toBe("success");
          });
        }

        if (output.includes("❌ Run failed:")) {
          clearTimeout(timeout);
          fail(
            new Error(
              `CLI real success chain failed unexpectedly. Output:\n${output}`,
            ),
          );
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

      setTimeout(() => {
        if (!settled && !promptSent) {
          promptSent = true;
          cli.stdin?.write(promptText);
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
            `CLI exited before success chain completed (code=${code}). Output:\n${output}`,
          ),
        );
      });
    });
  }, 50000);

  it("proves default real CLI continuity: deny first approval, then allow next turn in same session", async () => {
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
      let observedApprovalPrompts = 0;
      let firstPromptSent = false;
      let secondPromptSent = false;
      let firstRoundTerminalSeen = false;

      const firstPrompt =
        "First turn real continuity smoke: request command, then deny approval\n";
      const secondPrompt =
        "Second turn real continuity smoke: request command, then allow approval\n";

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
            `Timed out waiting for real continuity smoke completion. Output:\n${output}`,
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

        const approvalPromptCount = output.match(/approval> /g)?.length ?? 0;
        if (approvalPromptCount > observedApprovalPrompts) {
          while (observedApprovalPrompts < approvalPromptCount) {
            observedApprovalPrompts += 1;
            if (observedApprovalPrompts === 1) {
              cli.stdin?.write("n\n");
            } else {
              cli.stdin?.write("y\n");
            }
          }
        }

        if (
          !firstRoundTerminalSeen &&
          output.includes("[approval] decision=deny") &&
          output.includes("❌ Run failed:")
        ) {
          firstRoundTerminalSeen = true;
        }

        if (
          firstRoundTerminalSeen &&
          !secondPromptSent &&
          observedInputPrompts >= 2
        ) {
          secondPromptSent = true;
          cli.stdin?.write(secondPrompt);
        }

        if (
          sessionId &&
          secondPromptSent &&
          output.includes("✅ Response complete")
        ) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain("[approval] decision=deny");
            expect(output).toContain("❌ Run failed:");
            expect(output).toContain("[approval] decision=allow-once");

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
            const chatCalls = fetchLogs.filter((entry) =>
              entry.url.endsWith("/chat/completions"),
            );

            expect(modelsCalls.length).toBeGreaterThanOrEqual(2);
            expect(chatCalls.length).toBeGreaterThanOrEqual(4);
            expect(
              chatCalls.every(
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

            expect(queryCompleted.length).toBeGreaterThanOrEqual(2);
            const firstTerminal = queryCompleted[0];
            const latestTerminal = queryCompleted.at(-1);

            expect(firstTerminal?.event?.result?.status).toBe("stopped_error");
            expect(firstTerminal?.event?.result?.terminalClassification).toBe(
              "error",
            );
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

            expect(state.status).toBe("completed");
            expect(state.terminalReason).toBe("completed");
            expect(state.terminalClassification).toBe("success");
            expect(state.durableStatus).toBe("success");
          });
        }
      };

      cli.stdout?.on("data", onData);
      cli.stderr?.on("data", onData);

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
            `CLI exited before real continuity smoke completed (code=${code}). Output:\n${output}`,
          ),
        );
      });
    });
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
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-real-cli-key",
        NODE_OPTIONS: nodeOptionsParts.join(" "),
      });
      let settled = false;
      let promptSent = false;
      let approvalSent = false;
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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          promptSent = true;
          cli.stdin?.write(firstPrompt);
        }

        if (!approvalSent && phaseOneOutput.includes("approval> ")) {
          approvalSent = true;
          cli.stdin?.write("y\n");
        }

        if (!interrupted && phaseOneOutput.includes("REAL_MOCK_CALL_1")) {
          interrupted = true;
          setTimeout(() => {
            cli.kill();
          }, 60);
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

        if (phaseOneOutput.includes("✅ Response complete")) {
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
    expect(phaseOneOutput).toContain("[approval] decision=allow-once");

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

    const phaseOneState = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "state.json"), "utf8"),
    ) as {
      pendingPrompt?: string;
    };
    expect(phaseOneState.pendingPrompt).toBe(firstPrompt.trim());

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

    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, ["--session-id", sessionId], {
        PRIVATE_AGENTS_PROVIDER_MODE: "real",
        OPENAI_API_KEY: "test-real-cli-key",
        NODE_OPTIONS: nodeOptionsParts.join(" "),
      });
      let output = "";
      let settled = false;
      let resumeSent = false;
      let approvalResponses = 0;
      let observedApprovalPrompts = 0;

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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          resumeSent = true;
          cli.stdin?.write(`/resume ${sessionId}\n`);
        }

        const approvalPrompts = output.match(/approval> /g)?.length ?? 0;
        if (approvalPrompts > observedApprovalPrompts) {
          while (approvalResponses < approvalPrompts) {
            approvalResponses += 1;
            cli.stdin?.write("y\n");
          }
          observedApprovalPrompts = approvalPrompts;
        }

        if (output.includes("✅ Response complete")) {
          finish(() => {
            expect(output).toContain(`♻️  Resumed session ${sessionId}`);
            expect(output).toContain("[approval] decision=allow-once");
            expect(approvalResponses).toBeGreaterThanOrEqual(1);

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

            expect(state.status).toBe("completed");
            expect(state.terminalReason).toBe("completed");
            expect(state.terminalClassification).toBe("success");
            expect(state.durableStatus).toBe("success");
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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          clearTimeout(timeout);
          cli.kill();
          try {
            expect(output).toContain(
              "🤖 Private Coding Agents Shell (ts-shell MVP)",
            );
            expect(output).toContain("Session: sess_");
            expect(output).toContain(
              `Recovery available: rerun with --session-id ${recoverableSessionId} to continue the latest interrupted session`,
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
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      });
      let output = "";
      let settled = false;
      let promptSent = false;
      let sessionId = "";
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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          promptSent = true;
          cli.stdin?.write(
            "Golden smoke: check node version for this workspace\n",
          );
        }

        const approvalPrompts = output.match(/approval> /g)?.length ?? 0;
        if (approvalPrompts > observedApprovalPrompts) {
          while (approvalResponses < approvalPrompts) {
            approvalResponses += 1;
            cli.stdin?.write("y\n");
          }
          observedApprovalPrompts = approvalPrompts;
        }

        const completedMarkers = output.match(/✅ Response complete/g);
        completionCount = completedMarkers?.length ?? 0;

        if (completionCount >= 1 && !followUpPromptSent) {
          followUpPromptSent = true;
          cli.stdin?.write(
            "Golden smoke: list TypeScript files in this workspace\n",
          );
        }

        if (sessionId && completionCount >= 2) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain(
              "🤖 Private Coding Agents Shell (ts-shell MVP)",
            );
            expect(output).toContain(
              `Recovery available: rerun with --session-id ${recoverableSessionId} to continue the latest interrupted session`,
            );
            expect(output).toContain(
              "[approval] Permission escalation required",
            );
            expect(output).toContain("[approval] decision=allow-once");
            expect(approvalResponses).toBeGreaterThanOrEqual(1);

            const noisyWarnings =
              output.match(/Skipping unreadable session directory/g)?.length ??
              0;
            const aggregatedWarnings =
              output.match(/Skipped\s+\d+\s+unreadable session directories/g)
                ?.length ?? 0;
            expect(noisyWarnings).toBe(0);
            expect(aggregatedWarnings).toBe(1);

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
            const firstTerminal = queryCompleted[0];
            const latestTerminal = queryCompleted.at(-1);

            expect(queryStartedCount).toBeGreaterThanOrEqual(1);
            expect(queryCompleted.length).toBeGreaterThanOrEqual(2);
            const firstNotes =
              firstTerminal?.event?.result?.sharedContext?.notes ?? [];
            expect(firstNotes.join("\n")).toContain("plan: intent=run-command");
            expect(firstNotes.join("\n")).toContain(
              "tool: approved bash(node --version) via escalation",
            );

            const latestNotes =
              latestTerminal?.event?.result?.sharedContext?.notes ?? [];
            expect(latestNotes.join("\n")).toContain(
              "plan: intent=inspect-files",
            );
            expect(latestNotes.join("\n")).toContain(
              "tool: approved glob(.ts)",
            );
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

  it("gates user-driven approval allow path with explicit terminal persistence evidence", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      });
      let output = "";
      let settled = false;
      let promptSent = false;
      let approvalSent = false;

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
        fail(new Error("Timed out waiting for CLI smoke flow completion"));
      }, 30000);

      cli.stdout?.on("data", (data) => {
        output += data.toString();

        if (
          !promptSent &&
          output.includes(
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          promptSent = true;
          cli.stdin?.write(
            "Implement task with explicit approval allow path\n",
          );
        }

        if (!approvalSent && output.includes("approval> ")) {
          approvalSent = true;
          cli.stdin?.write("y\n");
        }

        if (output.includes("✅ Response complete")) {
          clearTimeout(timeout);
          finish(() => {
            expect(output).toContain(
              "[approval] Permission escalation required",
            );
            expect(output).toContain("[approval] decision=allow-once");

            const sessionDirs = fs
              .readdirSync(sessionsDir)
              .filter((file) => file.startsWith("sess_"));
            expect(sessionDirs.length).toBeGreaterThan(0);

            const latestSessionDir = path.join(
              sessionsDir,
              sessionDirs.sort().at(-1) as string,
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
  }, 35000);

  it("gates user-driven approval deny path with explicit stopped_error persistence evidence", async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, [], {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      });
      let output = "";
      let settled = false;
      let promptSent = false;
      let approvalSent = false;
      let sessionId = "";
      let completionScheduled = false;

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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
          )
        ) {
          promptSent = true;
          cli.stdin?.write("Implement task with explicit approval deny path\n");
        }

        if (!approvalSent && output.includes("approval> ")) {
          approvalSent = true;
          cli.stdin?.write("n\n");
        }

        if (
          sessionId &&
          output.includes("[approval] decision=deny") &&
          !completionScheduled
        ) {
          completionScheduled = true;
          setTimeout(() => {
            clearTimeout(timeout);
            finish(() => {
              expect(output).toContain(
                "[approval] Permission escalation required",
              );
              expect(output).toContain("[approval] decision=deny");
              expect(output.includes("✅ Response complete")).toBe(false);

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
                expect(queryCompleted.event?.result?.status).toBe(
                  "stopped_error",
                );
                expect(
                  queryCompleted.event?.result?.terminalClassification,
                ).toBe("error");
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

              expect(terminalState.status).toBe("error");
              expect(terminalState.terminalReason).toBe("stopped_error");
              expect(terminalState.terminalClassification).toBe("error");
              expect(terminalState.durableStatus).toBe("error");
              expect(terminalState.lastError).toContain(
                "Approval denied by user for bash",
              );
            });
          }, 400);
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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
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
    expect(firstPhaseOutput).not.toContain("✅ Response complete");

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
            "Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit",
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

        const completedMarkers = output.match(/✅ Response complete/g);
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
