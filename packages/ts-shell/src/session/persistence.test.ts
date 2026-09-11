import { describe, expect, it } from "vitest";
import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { AgentMessage } from "../core/agent/state.js";
import {
  createTranscriptWriter,
  type TranscriptRecord,
} from "./persistence.js";

function userMessage(content: string): AgentMessage {
  return { role: "user", content };
}

function assistantMessage(content: string): AgentMessage {
  return { role: "assistant", content };
}

function toolMessage(id: string, content: string): AgentMessage {
  return { role: "tool", tool_call_id: id, content };
}

function collect() {
  const records: TranscriptRecord[] = [];
  const writer = createTranscriptWriter({
    append: (record) => {
      records.push(record);
    },
  });
  return { records, writer };
}

function replay(writer: { onEvent: (event: AgentLifecycleEvent) => void }, messages: AgentMessage[]): void {
  writer.onEvent({ type: "agent_start" });
  writer.onEvent({ type: "turn_start" });
  for (const message of messages) {
    writer.onEvent({ type: "message_start", message });
    writer.onEvent({ type: "message_update", message });
    writer.onEvent({ type: "message_end", message });
  }
  const last = messages[messages.length - 1];
  writer.onEvent({
    type: "turn_end",
    message: last,
    toolResults: messages.filter((message) => message.role === "tool"),
  });
  writer.onEvent({ type: "agent_end", messages });
}

describe("createTranscriptWriter", () => {
  it("appends complete messages in order with sequence numbers", () => {
    const { records, writer } = collect();
    replay(writer, [userMessage("hi"), assistantMessage("hello")]);

    expect(records).toEqual([
      { kind: "message", seq: 0, role: "user", content: "hi" },
      { kind: "message", seq: 1, role: "assistant", content: "hello" },
    ]);
  });

  it("writes nothing for streaming, tool, or boundary events", () => {
    const { records, writer } = collect();
    const message = assistantMessage("partial");

    writer.onEvent({ type: "agent_start" });
    writer.onEvent({ type: "turn_start" });
    writer.onEvent({ type: "message_start", message });
    writer.onEvent({ type: "message_update", message });
    writer.onEvent({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "read",
      args: {},
    });
    writer.onEvent({
      type: "tool_execution_update",
      toolCallId: "call-1",
      toolName: "read",
      args: {},
      partialResult: "chunk",
    });
    writer.onEvent({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "read",
      isError: false,
    });
    writer.onEvent({ type: "turn_end", message, toolResults: [] });
    writer.onEvent({ type: "agent_end", messages: [message] });

    expect(records).toEqual([]);
  });

  it("keeps tool results paired with their calls", () => {
    const { records, writer } = collect();
    replay(writer, [
      userMessage("read it"),
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
      toolMessage("call-1", "file!"),
      assistantMessage("done"),
    ]);

    expect(records.map((record) => (record.kind === "message" ? record.role : record.kind))).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    const toolRecord = records[2];
    expect(toolRecord.kind).toBe("message");
    if (toolRecord.kind === "message") {
      expect(toolRecord.toolCallId).toBe("call-1");
    }
  });

  it("records assistant failures with their stop reason", () => {
    const { records, writer } = collect();
    replay(writer, [
      userMessage("hi"),
      { role: "assistant", content: "", stopReason: "aborted", errorMessage: "fetch aborted" },
    ]);

    expect(records).toHaveLength(2);
    const last = records[1];
    expect(last.kind).toBe("message");
    if (last.kind === "message") {
      expect(last.stopReason).toBe("aborted");
      expect(last.errorMessage).toBe("fetch aborted");
    }
  });

  it("records compaction checkpoints as their own entries", () => {
    const { records, writer } = collect();
    replay(writer, [userMessage("hi")]);
    writer.recordCompaction({ summary: "older work", keptMessages: 2, tokensBefore: 120 });

    expect(records).toHaveLength(2);
    expect(records[1]).toEqual({
      kind: "compaction",
      seq: 1,
      summary: "older work",
      keptMessages: 2,
      tokensBefore: 120,
    });
  });
});
