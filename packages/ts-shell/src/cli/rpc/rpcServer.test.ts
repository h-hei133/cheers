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
  });

  it("executes prompt, state, queue, and message RPC commands and emits JSON responses", async () => {
    const prompts: string[] = [];
    const responses: RpcResponse[] = [];
    const host = {
      sessionId: "sess_rpc",
      workspaceRoot: "/workspace",
      isStreaming: () => false,
      getMessages: () => [{ role: "user" as const, content: "hi" }],
      enqueuePrompt: (p: string) => prompts.push(p),
      clearQueue: () => 2,
      emitResponse: (res: RpcResponse) => responses.push(res),
    };

    await handleRpcCommand({ id: "req-1", type: "prompt", message: "fix bug" }, host);
    await handleRpcCommand({ id: "req-2", type: "get_state" }, host);
    await handleRpcCommand({ id: "req-3", type: "get_messages" }, host);
    await handleRpcCommand({ id: "req-4", type: "clear_queue" }, host);

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
    ]);
  });
});
