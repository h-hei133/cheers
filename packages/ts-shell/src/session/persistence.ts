import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { AgentMessage } from "../core/agent/state.js";

export type TranscriptRecord =
  | {
      readonly kind: "message";
      readonly seq: number;
      readonly role: AgentMessage["role"];
      readonly content: string;
      readonly messageId?: string;
      readonly timestamp?: string;
      readonly toolCallId?: string;
      readonly toolCalls?: readonly {
        readonly id: string;
        readonly name: string;
        readonly args: string;
      }[];
      readonly stopReason?: string;
      readonly errorMessage?: string;
    }
  | {
      readonly kind: "compaction";
      readonly seq: number;
      readonly summary: string;
      readonly keptMessages: number;
      readonly tokensBefore: number;
    };

export interface TranscriptSink {
  append(record: TranscriptRecord): void;
}

export interface TranscriptWriter {
  onEvent(event: AgentLifecycleEvent): void;
  recordCompaction(input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore: number }): void;
}

export function createTranscriptWriter(sink: TranscriptSink, initialSeq = 0): TranscriptWriter {
  let seq = initialSeq;
  return {
    onEvent(event) {
      if (event.type !== "message_end") {
        return;
      }
      const message = event.message;
      sink.append({
        kind: "message",
        seq: seq++,
        role: message.role,
        content: message.content ?? "",
        ...(message.id ? { messageId: message.id } : {}),
        ...(message.timestamp ? { timestamp: message.timestamp } : {}),
        ...(message.tool_call_id ? { toolCallId: message.tool_call_id } : {}),
        ...(message.tool_calls
          ? {
              toolCalls: message.tool_calls.map((call) => ({
                id: call.id,
                name: call.function.name,
                args: call.function.arguments,
              })),
            }
          : {}),
        ...(message.stopReason ? { stopReason: message.stopReason } : {}),
        ...(message.errorMessage ? { errorMessage: message.errorMessage } : {}),
      });
    },
    recordCompaction(input) {
      sink.append({
        kind: "compaction",
        seq: seq++,
        summary: input.summary,
        keptMessages: input.keptMessages,
        tokensBefore: input.tokensBefore,
      });
    },
  };
}

export function findDanglingToolCalls(records: readonly TranscriptRecord[]): readonly string[] {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const record of records) {
    if (record.kind !== "message") {
      continue;
    }
    for (const call of record.toolCalls ?? []) {
      calls.add(call.id);
    }
    if (record.toolCallId) {
      results.add(record.toolCallId);
    }
  }
  return [...calls].filter((id) => !results.has(id));
}
