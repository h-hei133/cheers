import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { AgentMessage } from "../core/agent/state.js";

export type TranscriptRecord =
  | {
      readonly kind: "message";
      readonly seq: number;
      readonly role: AgentMessage["role"];
      readonly content: string;
      readonly toolCallId?: string;
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

export function createTranscriptWriter(sink: TranscriptSink): TranscriptWriter {
  let seq = 0;
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
        ...(message.tool_call_id ? { toolCallId: message.tool_call_id } : {}),
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
