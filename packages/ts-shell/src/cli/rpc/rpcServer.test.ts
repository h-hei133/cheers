import { describe, expect, it } from "vitest";
import { handleRpcCommand, tryParseRpcCommand, type RpcResponse } from "./rpcServer.js";

describe("RPC JSONL protocol server", () => {
  it("parses valid RPC commands and ignores plain text prompts", () => {
    expect(tryParseRpcCommand("hello world")).toBeUndefined();
    expect(tryParseRpcCommand('{"id":"1","type":"prompt","message":"inspect repo"}')).toEqual({
      id: "1",
      type: "prompt",
      message: "inspect repo",
    });
    expect(tryParseRpcCommand('{"id":"2","type":"get_state"}')).toEqual({
      id: "2",
      type: "get_state",
    });
    expect(tryParseRpcCommand('{"id":"3","type":"abort"}')).toEqual({
      id: "3",
      type: "abort",
    });
  });

  it("executes prompt, state, queue, and message RPC commands and emits JSON responses", async () => {
    const prompts: string[] = [];
    const responses: RpcResponse[] = [];
    let aborted = 0;
    const host = {
      sessionId: "sess_rpc",
      workspaceRoot: "/workspace",
      isStreaming: () => false,
      getMessages: () => [{ role: "user" as const, content: "hi" }],
      enqueuePrompt: (p: string) => prompts.push(p),
      clearQueue: () => 2,
      abort: () => { aborted += 1; },
      emitResponse: (res: RpcResponse) => responses.push(res),
    };

    await handleRpcCommand({ id: "req-1", type: "prompt", message: "fix bug" }, host);
    await handleRpcCommand({ id: "req-2", type: "get_state" }, host);
    await handleRpcCommand({ id: "req-3", type: "get_messages" }, host);
    await handleRpcCommand({ id: "req-4", type: "clear_queue" }, host);
    await handleRpcCommand({ id: "req-5", type: "abort" }, host);

    expect(aborted).toBe(1);
    expect(prompts).toEqual(["fix bug"]);
    expect(responses).toEqual([
      { id: "req-1", type: "response", command: "prompt", success: true },
      {
        id: "req-2",
        type: "response",
        command: "get_state",
        success: true,
        data: { sessionId: "sess_rpc", workspaceRoot: "/workspace", isStreaming: false, messageCount: 1 },
      },
      {
        id: "req-3",
        type: "response",
        command: "get_messages",
        success: true,
        data: { messages: [{ role: "user", content: "hi" }] },
      },
      {
        id: "req-4",
        type: "response",
        command: "clear_queue",
        success: true,
        data: { cleared: 2 },
      },
      {
        id: "req-5",
        type: "response",
        command: "abort",
        success: true,
      },
    ]);
  });

  it("parses and executes extended session, model, thinking, compaction, tree, and stats RPC commands", async () => {
    const responses: RpcResponse[] = [];
    const parsedFork = tryParseRpcCommand('{"id":"f1","type":"fork","entryId":"e1"}');
    const parsedModel = tryParseRpcCommand('{"id":"m1","type":"set_model","provider":"openai","modelId":"gpt-5"}');
    const parsedNav = tryParseRpcCommand('{"id":"n1","type":"navigate_tree","entryId":"e2"}');
    const parsedImgPrompt = tryParseRpcCommand('{"id":"p1","type":"prompt","message":"","images":[{"type":"image","data":"AAAA","mimeType":"image/png"}]}');
    expect(parsedFork).toEqual({ id: "f1", type: "fork", entryId: "e1" });
    expect(parsedModel).toEqual({ id: "m1", type: "set_model", provider: "openai", modelId: "gpt-5" });
    expect(parsedNav).toEqual({ id: "n1", type: "navigate_tree", entryId: "e2" });
    expect(parsedImgPrompt).toMatchObject({ id: "p1", type: "prompt", images: [{ type: "image", data: "AAAA", mimeType: "image/png" }] });

    const seenImages: unknown[] = [];
    const host = {
      sessionId: "sess_rpc",
      workspaceRoot: "/workspace",
      isStreaming: () => false,
      getMessages: () => [{ role: "assistant" as const, content: "final answer" }],
      enqueuePrompt: (_p: string, images?: readonly unknown[]) => { if (images) seenImages.push(images); },
      emitResponse: (res: RpcResponse) => responses.push(res),
      setSessionName: async (name: string) => ({ sessionId: "sess_rpc", name }),
      getLastAssistantText: () => "final answer",
      getSessionStats: () => ({ recordedTokens: 100 }),
      setModel: async (provider: string, modelId: string) => ({ provider, modelId }),
      cycleThinkingLevel: async () => ({ level: "high" }),
      getAvailableThinkingLevels: () => ["minimal", "low", "medium", "high"],
      getCommands: () => [{ name: "help", description: "Show help" }],
      compact: async () => ({ status: "compacted" as const, summary: "done", tokensBefore: 500 }),
      navigateTree: async (entryId: string) => ({ status: "changed" as const, changed: true, output: `moved ${entryId}` }),
    };

    await handleRpcCommand(parsedImgPrompt!, host);
    await handleRpcCommand({ id: "s1", type: "set_session_name", name: "Batch D" }, host);
    await handleRpcCommand({ id: "s2", type: "get_last_assistant_text" }, host);
    await handleRpcCommand({ id: "s3", type: "get_session_stats" }, host);
    await handleRpcCommand(parsedModel!, host);
    await handleRpcCommand({ id: "t1", type: "cycle_thinking_level" }, host);
    await handleRpcCommand({ id: "c1", type: "compact" }, host);
    await handleRpcCommand(parsedNav!, host);
    await handleRpcCommand({ id: "b1", type: "bash", command: "ls" }, host);

    expect(seenImages).toEqual([[{ type: "image", data: "AAAA", mimeType: "image/png" }]]);
    expect(responses.find(r => r.id === "s1")).toMatchObject({ success: true, data: { name: "Batch D" } });
    expect(responses.find(r => r.id === "s2")).toMatchObject({ success: true, data: { text: "final answer" } });
    expect(responses.find(r => r.id === "m1")).toMatchObject({ success: true, data: { provider: "openai", modelId: "gpt-5" } });
    expect(responses.find(r => r.id === "t1")).toMatchObject({ success: true, data: { level: "high" } });
    expect(responses.find(r => r.id === "c1")).toMatchObject({ success: true, data: { status: "compacted" } });
    expect(responses.find(r => r.id === "n1")).toMatchObject({ success: true, data: { status: "changed" } });
    expect(responses.find(r => r.id === "b1")).toMatchObject({ success: false });
    expect(tryParseRpcCommand('{"id":"ge1","type":"get_entries","since":"entry-9"}')).toEqual({
      id: "ge1",
      type: "get_entries",
      since: "entry-9",
    });
  });
});
