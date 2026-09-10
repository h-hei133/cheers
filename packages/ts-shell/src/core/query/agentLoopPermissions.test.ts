import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { convertSessionMessagesToChat, runAutonomousReActLoop } from "./agentLoop.js";
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

  it("in ask mode: includes user denial reason in tool blocked output when provided", async () => {
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_write_deny_reason",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({ path: "protected.txt", content: "data" }),
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
            message: { content: "Understood, will not write protected file." },
            finish_reason: "stop",
          },
        ],
      },
    ]);

    const escalationHandler = vi.fn().mockImplementation(
      async (prompt: EscalationPrompt): Promise<EscalationResponse> => ({
        promptId: prompt.id,
        decision: "deny",
        userComment: "User denied with reason: file is strictly protected",
        respondedAt: Date.now(),
      }),
    );

    const events: QueryEvent[] = [];
    for await (const ev of runAutonomousReActLoop({
      sessionId: "sess_test_deny_reason",
      prompt: "write protected file",
      workspaceRoot: tmpDir,
      permissionScope: "ask",
      escalationPromptHandler: escalationHandler,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
    })) {
      events.push(ev);
    }

    const toolResult = events.find((ev) => ev.type === "tool.result");
    expect(toolResult).toBeDefined();
    if (toolResult && toolResult.type === "tool.result") {
      expect(toolResult.success).toBe(false);
      expect(toolResult.output).toContain("file is strictly protected");
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

  it("preserves cross-turn conversation context and tool messages across turns", async () => {
    const recordedMessages: SessionMessage[] = [];
    const onTurnMessage = vi.fn((msg: SessionMessage) => recordedMessages.push(msg));
    // Turn 1 mock responses
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: "I will create the file.",
              tool_calls: [
                {
                  id: "call_write_turn1",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({
                      path: path.join(tmpDir, "target.txt"),
                      content: "important data",
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
            message: { content: "Created target.txt with important data." },
            finish_reason: "stop",
          },
        ],
      },
    ]);

    // Run Turn 1
    for await (const _ of runAutonomousReActLoop({
      sessionId: "sess_multiturn",
      prompt: "Create file target.txt",
      workspaceRoot: tmpDir,
      permissionScope: "allow-all",
      onTurnMessage,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 3,
    })) {
      // consume
    }

    // Verify onTurnMessage recorded assistant tool call and tool result
    expect(recordedMessages.length).toBeGreaterThanOrEqual(2);
    const toolCallMsg = recordedMessages.find((m) => m.role === "assistant" && m.tool_calls);
    expect(toolCallMsg).toBeDefined();
    expect(toolCallMsg.tool_calls[0].function.name).toBe("write");

    const toolResultMsg = recordedMessages.find((m) => m.role === "tool");
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.tool_call_id).toBe("call_write_turn1");

    // Prepare history for Turn 2
    const historyForTurn2 = [
      { role: "user", content: "Create file target.txt" } as const,
      ...recordedMessages,
      { role: "assistant", content: "Created target.txt with important data." } as const,
    ];

    interface ChatPayloadMessage {
      readonly role?: string;
      readonly content?: unknown;
      readonly tool_calls?: readonly Array<{ readonly function?: { readonly name?: string } }>;
    }
    let turn2PayloadMessages: readonly ChatPayloadMessage[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
        const parsed = JSON.parse(init.body) as { messages: readonly ChatPayloadMessage[] };
        turn2PayloadMessages = parsed.messages;
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            choices: [{ message: { content: "Deleted target.txt." }, finish_reason: "stop" }],
          }),
        };
      }),
    );

    // Run Turn 2 with prompt "Delete it"
    for await (const _ of runAutonomousReActLoop({
      sessionId: "sess_multiturn",
      prompt: "Delete it",
      workspaceRoot: tmpDir,
      permissionScope: "allow-all",
      historyMessages: historyForTurn2,
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 3,
    })) {
      // consume
    }

    // Turn 2's payload sent to LLM must contain Turn 1's history!
    expect(turn2PayloadMessages.length).toBeGreaterThan(2);
    const hasTurn1Prompt = turn2PayloadMessages.some(
      (m) => m.role === "user" && m.content === "Create file target.txt",
    );
    expect(hasTurn1Prompt).toBe(true);

    const hasTurn1ToolCall = turn2PayloadMessages.some(
      (m) =>
        m.role === "assistant" &&
        Array.isArray(m.tool_calls) &&
        m.tool_calls[0]?.function?.name === "write",
    );
    expect(hasTurn1ToolCall).toBe(true);

    const hasTurn2Prompt = turn2PayloadMessages.some(
      (m) => m.role === "user" && typeof m.content === "string" && m.content.includes("Delete it"),
    );
    expect(hasTurn2Prompt).toBe(true);
  });

  it("synthesizes cancelled tool messages when assistant tool_calls were interrupted", () => {
    const history = [
      { role: "user" as const, content: "do two tasks" },
      {
        role: "assistant" as const,
        content: "Running tools",
        tool_calls: [
          { id: "call_1", type: "function" as const, function: { name: "read", arguments: "{}" } },
          { id: "call_2", type: "function" as const, function: { name: "write", arguments: "{}" } },
        ],
      },
      // Only call_1 finished before interruption
      { role: "tool" as const, tool_call_id: "call_1", content: "read output" },
    ];

    const chat = convertSessionMessagesToChat(history);
    expect(chat).toHaveLength(4);
    expect(chat[0]!.role).toBe("user");
    expect(chat[1]!.role).toBe("assistant");
    expect(chat[2]!.role).toBe("tool");
    expect(chat[2]!.tool_call_id).toBe("call_1");
    expect(chat[3]!.role).toBe("tool");
    expect(chat[3]!.tool_call_id).toBe("call_2");
    expect(chat[3]!.content).toContain("cancelled or interrupted");
  });

  it("drops orphaned tool messages that have no preceding assistant tool call", () => {
    const history = [
      { role: "tool" as const, tool_call_id: "orphan_call", content: "stray output" },
      { role: "user" as const, content: "hello" },
    ];

    const chat = convertSessionMessagesToChat(history);
    expect(chat).toHaveLength(1);
    expect(chat[0]!.role).toBe("user");
    expect(chat[0]!.content).toBe("hello");
  });

  it("ensures assistant messages with empty content and no tool_calls have string content rather than null", () => {
    const history = [
      { role: "assistant" as const, content: "" },
    ];
    const chat = convertSessionMessagesToChat(history);
    expect(chat).toHaveLength(1);
    expect(chat[0]!.role).toBe("assistant");
    expect(typeof chat[0]!.content).toBe("string");
    expect(chat[0]!.content).toBe("");
  });

  it("annotates tool result with user approval information when escalation is approved", async () => {
    const targetFile = path.join(tmpDir, "annotated.txt");
    mockProviderResponses([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_write_annotated",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({ path: targetFile, content: "hello" }),
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
              content: "I have written the file after your approval.",
              tool_calls: undefined,
            },
            finish_reason: "stop",
          },
        ],
      },
    ]);

    const turnMessages: Array<{ role: string; content?: string | null }> = [];
    for await (const _ of runAutonomousReActLoop({
      sessionId: "sess_annotate_test",
      prompt: "write annotated",
      workspaceRoot: tmpDir,
      permissionScope: "ask",
      escalationPromptHandler: async (p) => ({
        promptId: p.id,
        decision: "allow-once",
        respondedAt: Date.now(),
      }),
      onTurnMessage: (m) => turnMessages.push(m),
      realProvider: { apiKey: "mock", baseUrl: "https://mock.api", model: "m" },
      maxTurns: 3,
    })) {
      // consume
    }

    const toolMsg = turnMessages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain("[User approved write operation (allow-once)]");
  });
});
