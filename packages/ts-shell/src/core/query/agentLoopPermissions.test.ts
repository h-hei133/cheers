import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { runAutonomousReActLoop } from "./agentLoop.js";
import type { QueryEvent } from "./runtime/events.js";
import type { EscalationPrompt, EscalationResponse } from "../../sandbox/index.js";

describe("agentLoop permission enforcement and interactive ask", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-perm-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function mockProviderResponses(responses: Array<Record<string, unknown>>) {
    let callIdx = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        const resp = responses[callIdx++] ?? {
          choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
        };
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => resp,
        };
      }),
    );
  }

  it("in ask mode: allows read without escalation, requires escalation for write, and respects allow-once", async () => {
    const targetFile = path.join(tmpDir, "hello.txt");
    await fs.writeFile(targetFile, "world", "utf8");

    // Turn 1: model calls read (should NOT escalate)
    // Turn 2: model calls write (SHOULD escalate)
    // Turn 3: model finishes
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_read_1",
                  type: "function",
                  function: {
                    name: "read",
                    arguments: JSON.stringify({ path: targetFile }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_write_1",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({
                      path: path.join(tmpDir, "new.txt"),
                      content: "created content",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      {
        choices: [{ message: { content: "File created successfully." }, finish_reason: "stop" }],
      },
    ]);

    const escalationHandler = vi.fn().mockImplementation(
      async (prompt: EscalationPrompt): Promise<EscalationResponse> => ({
        promptId: prompt.id,
        decision: "allow-once",
        respondedAt: Date.now(),
      }),
    );

    const events: QueryEvent[] = [];
    for await (const ev of runAutonomousReActLoop({
      sessionId: "sess_test_1",
      prompt: "read and write",
      workspaceRoot: tmpDir,
      permissionScope: "ask",
      escalationPromptHandler: escalationHandler,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
    })) {
      events.push(ev);
    }

    // Escalation handler should be called exactly once: for write, NOT for read
    expect(escalationHandler).toHaveBeenCalledOnce();
    const promptArg = escalationHandler.mock.calls[0]![0] as EscalationPrompt;
    expect(promptArg.context.toolName).toBe("write");
    expect(promptArg.context.operation).toBe("write");

    // File should actually be created since decision was allow-once
    const created = await fs.readFile(path.join(tmpDir, "new.txt"), "utf8");
    expect(created).toBe("created content");
  });

  it("in ask mode: blocks write when user denies escalation", async () => {
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_write_deny",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({
                      path: path.join(tmpDir, "forbidden.txt"),
                      content: "should not exist",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      {
        choices: [{ message: { content: "Understood, file creation was denied." }, finish_reason: "stop" }],
      },
    ]);

    const escalationHandler = vi.fn().mockImplementation(
      async (prompt: EscalationPrompt): Promise<EscalationResponse> => ({
        promptId: prompt.id,
        decision: "deny",
        respondedAt: Date.now(),
      }),
    );

    const events: QueryEvent[] = [];
    for await (const ev of runAutonomousReActLoop({
      sessionId: "sess_test_deny",
      prompt: "write forbidden",
      workspaceRoot: tmpDir,
      permissionScope: "ask",
      escalationPromptHandler: escalationHandler,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
    })) {
      events.push(ev);
    }

    expect(escalationHandler).toHaveBeenCalledOnce();

    // File should NOT exist
    await expect(fs.stat(path.join(tmpDir, "forbidden.txt"))).rejects.toThrow();

    // The tool result event should reflect the block
    const toolResult = events.find((ev) => ev.type === "tool.result");
    expect(toolResult).toBeDefined();
    if (toolResult && toolResult.type === "tool.result") {
      expect(toolResult.success).toBe(false);
      expect(toolResult.failureReason).toContain("User denied permission");
    }
  });

  it("in accept-edits mode: allows in-workspace write without escalation, but escalates modifying bash", async () => {
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_write_auto",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({
                      path: path.join(tmpDir, "auto.txt"),
                      content: "auto-approved",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_bash_esc",
                  type: "function",
                  function: {
                    name: "bash",
                    arguments: JSON.stringify({
                      command: "npm test",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      {
        choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
      },
    ]);

    const escalationHandler = vi.fn().mockImplementation(
      async (prompt: EscalationPrompt): Promise<EscalationResponse> => ({
        promptId: prompt.id,
        decision: "allow-once",
        respondedAt: Date.now(),
      }),
    );

    for await (const _ of runAutonomousReActLoop({
      sessionId: "sess_test_accept_edits",
      prompt: "write and bash",
      workspaceRoot: tmpDir,
      permissionScope: "accept-edits",
      escalationPromptHandler: escalationHandler,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
    })) {
      // consume
    }

    // Write should NOT have triggered escalation, but bash should
    expect(escalationHandler).toHaveBeenCalledOnce();
    const promptArg = escalationHandler.mock.calls[0]![0] as EscalationPrompt;
    expect(promptArg.context.toolName).toBe("bash");

    // File was written
    const content = await fs.readFile(path.join(tmpDir, "auto.txt"), "utf8");
    expect(content).toBe("auto-approved");
  });

  it("invokes interactiveAsk when model calls ask tool and feeds real decision back to model", async () => {
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_ask_1",
                  type: "function",
                  function: {
                    name: "ask",
                    arguments: JSON.stringify({
                      questions: [
                        {
                          id: "target_format",
                          question: "Which format do you prefer?",
                          options: [{ label: "JSON" }, { label: "YAML" }],
                          recommended: 0,
                        },
                      ],
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      {
        choices: [
          {
            message: { content: "I will use YAML format as you requested." },
            finish_reason: "stop",
          },
        ],
      },
    ]);

    const interactiveAsk = vi.fn().mockResolvedValue({
      target_format: "YAML",
    });

    const events: QueryEvent[] = [];
    for await (const ev of runAutonomousReActLoop({
      sessionId: "sess_test_ask",
      prompt: "ask question",
      workspaceRoot: tmpDir,
      interactiveAsk,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
    })) {
      events.push(ev);
    }
    const toolResult = events.find((ev) => ev.type === "tool.result");
    expect(toolResult).toBeDefined();
    if (toolResult && toolResult.type === "tool.result") {
      expect(toolResult.output).toContain("User Decision**: YAML");
    }
  });
});
