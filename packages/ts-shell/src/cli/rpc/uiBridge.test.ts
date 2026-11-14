import { describe, expect, it } from "vitest";
import { createRpcUiBridge } from "./uiBridge.js";
import { tryParseRpcUiResponse, type RpcExtensionUiRequest } from "./protocol.js";
import { toRpcEvent } from "./events.js";

describe("RPC bidirectional extension UI bridge", () => {
  it("resolves select, confirm, input, and editor requests from extension_ui_response frames", async () => {
    const emitted: RpcExtensionUiRequest[] = [];
    const bridge = createRpcUiBridge(req => emitted.push(req));

    const selectPromise = bridge.select("Pick mode", ["fast", "safe"]);
    const selectReq = emitted[0]!;
    expect(selectReq.method).toBe("select");
    expect(bridge.pendingCount()).toBe(1);
    const parsedSelect = tryParseRpcUiResponse(JSON.stringify({ type: "extension_ui_response", id: selectReq.id, value: "safe" }));
    expect(parsedSelect).toBeDefined();
    expect(bridge.handleUiResponse(parsedSelect!)).toBe(true);
    await expect(selectPromise).resolves.toBe("safe");

    const confirmPromise = bridge.confirm("Delete?", "Proceed?");
    const confirmReq = emitted[1]!;
    expect(bridge.handleUiResponse({ type: "extension_ui_response", id: confirmReq.id, confirmed: true })).toBe(true);
    await expect(confirmPromise).resolves.toBe(true);

    const inputPromise = bridge.input("Name", "default");
    const inputReq = emitted[2]!;
    expect(bridge.handleUiResponse({ type: "extension_ui_response", id: inputReq.id, cancelled: true })).toBe(true);
    await expect(inputPromise).resolves.toBeUndefined();

    const editorPromise = bridge.editor("Edit prompt", "hello");
    const editorReq = emitted[3]!;
    expect(bridge.handleUiResponse({ type: "extension_ui_response", id: editorReq.id, value: "edited" })).toBe(true);
    await expect(editorPromise).resolves.toBe("edited");
    expect(bridge.pendingCount()).toBe(0);
  });

  it("cleans up pending requests on AbortSignal, timeout, and dispose", async () => {
    const emitted: RpcExtensionUiRequest[] = [];
    const bridge = createRpcUiBridge(req => emitted.push(req));

    const controller = new AbortController();
    const aborted = bridge.select("Pick", ["a"], { signal: controller.signal });
    expect(bridge.pendingCount()).toBe(1);
    controller.abort();
    await expect(aborted).resolves.toBeUndefined();
    expect(bridge.pendingCount()).toBe(0);

    const timedOut = bridge.confirm("Timeout?", "Wait", { timeout: 10 });
    await expect(timedOut).resolves.toBe(false);
    expect(bridge.pendingCount()).toBe(0);

    const dangling = bridge.input("Pending");
    expect(bridge.pendingCount()).toBe(1);
    bridge.notify("Saved", "info");
    bridge.setStatus("sync", "ok");
    bridge.setWidget("panel", ["line 1"], "aboveEditor");
    bridge.setTitle("Cheers");
    bridge.setEditorText("draft");
    expect(emitted.map(item => item.method)).toContain("set_editor_text");
    bridge.dispose();
    await expect(dangling).resolves.toBeUndefined();
    expect(bridge.pendingCount()).toBe(0);
  });

  it("keeps disposed bridges permanently silent and cancels all later dialogs", async () => {
    const emitted: RpcExtensionUiRequest[] = [];
    const bridge = createRpcUiBridge(request => emitted.push(request));
    const pending = bridge.editor("Pending editor");
    const request = emitted[0]!;
    bridge.dispose();
    bridge.dispose();
    await expect(pending).resolves.toBeUndefined();
    expect(bridge.handleUiResponse({ type: "extension_ui_response", id: request.id, value: "late" })).toBe(false);
    await expect(bridge.select("Later", ["a"])).resolves.toBeUndefined();
    await expect(bridge.confirm("Later", "message")).resolves.toBe(false);
    await expect(bridge.input("Later")).resolves.toBeUndefined();
    await expect(bridge.editor("Later")).resolves.toBeUndefined();
    bridge.notify("late"); bridge.setStatus("late", "text"); bridge.setWidget("late", ["text"]);
    bridge.setTitle("late"); bridge.setEditorText("late");
    expect(bridge.pendingCount()).toBe(0);
    expect(emitted).toEqual([request]);
  });

  it("validates selections against the options captured when the dialog opened", async () => {
    const emitted: RpcExtensionUiRequest[] = [];
    const bridge = createRpcUiBridge(request => emitted.push(request));
    const options = ["safe"];
    const selected = bridge.select("Pick", options);
    options.push("injected");
    bridge.handleUiResponse({ type: "extension_ui_response", id: emitted[0]!.id, value: "injected" });
    await expect(selected).resolves.toBeUndefined();
    expect(bridge.pendingCount()).toBe(0);
  });

  it("cancels editor requests on signal and timeout, including pre-aborted signals", async () => {
    const emitted: RpcExtensionUiRequest[] = [];
    const bridge = createRpcUiBridge(request => emitted.push(request));
    const controller = new AbortController();
    const editor = bridge.editor("Editor", "prefill", { signal: controller.signal, timeout: 100 });
    expect(emitted[0]).toMatchObject({ method: "editor", prefill: "prefill", timeout: 100 });
    controller.abort();
    await expect(editor).resolves.toBeUndefined();
    await expect(bridge.editor("Never opened", undefined, { signal: controller.signal })).resolves.toBeUndefined();
    expect(emitted).toHaveLength(1);
    await expect(bridge.editor("Timeout", undefined, { timeout: 10 })).resolves.toBeUndefined();
    expect(bridge.pendingCount()).toBe(0);
  });

  it("releases pending timers and abort listeners when emission throws", async () => {
    const controller = new AbortController();
    const bridge = createRpcUiBridge(() => { throw new Error("write failed"); });
    await expect(bridge.input("Name", undefined, { signal: controller.signal, timeout: 100 })).rejects.toThrow("write failed");
    expect(bridge.pendingCount()).toBe(0);
    controller.abort();
    bridge.dispose();
    expect(bridge.pendingCount()).toBe(0);
  });

  it("maps internal QueryEvents to RPC JSONL events", () => {
    expect(toRpcEvent({ type: "query.started", sessionId: "s1", prompt: "hi" })).toEqual({
      type: "agent_start",
      sessionId: "s1",
      prompt: "hi",
    });
    expect(toRpcEvent({ type: "message.delta", role: "coder", delta: "tok" })).toEqual({
      type: "message_update",
      delta: "tok",
      message: { role: "coder", content: "tok" },
    });
    expect(toRpcEvent({ type: "reasoning.delta", role: "coder", delta: "think" })).toEqual({
      type: "message_update",
      delta: "think",
      channel: "reasoning",
      message: { role: "coder", reasoning: { text: "think" } },
    });
    expect(toRpcEvent({ type: "tool.started", taskId: "t1", toolName: "read", args: { path: "a.ts" } })).toEqual({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "read",
      args: { path: "a.ts" },
    });
    expect(toRpcEvent({ type: "tool.result", taskId: "t1", toolName: "read", success: false, output: "err" })).toEqual({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "read",
      result: "err",
      isError: true,
    });
  });
});
