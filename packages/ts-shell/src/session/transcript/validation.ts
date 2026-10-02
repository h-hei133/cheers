import { isRecord as record } from "../../core/values/record.js";
import { readableOutput, readableQueryResult, readableToolEvent } from "./output.js";

const ROLES: ReadonlySet<unknown> = new Set(["system", "user", "assistant", "tool"]);
const AGENT_ROLES: ReadonlySet<unknown> = new Set(["planner", "coder", "reviewer"]);

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function content(value: unknown): boolean {
  if (typeof value === "string") return true;
  return Array.isArray(value) && value.every(block => record(block) && (
    (block.type === "text" && typeof block.text === "string") ||
    (block.type === "image" && typeof block.data === "string" && typeof block.mimeType === "string")
  ));
}

function toolCalls(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(call =>
    record(call) && typeof call.id === "string" && call.type === "function" &&
    record(call.function) && typeof call.function.name === "string" && typeof call.function.arguments === "string"));
}

function message(value: Record<string, unknown>): boolean {
  const origin = value.origin;
  const reasoning = value.reasoning;
  return ROLES.has(value.role) && content(value.content) && toolCalls(value.tool_calls) &&
    optionalString(value.tool_call_id) && optionalString(value.failureClass) &&
    (value.metadata === undefined || record(value.metadata)) &&
    (origin === undefined || (record(origin) && typeof origin.model === "string" && optionalString(origin.provider))) &&
    (reasoning === undefined || (record(reasoning) && typeof reasoning.text === "string" && optionalString(reasoning.signature) &&
      (reasoning.redacted === undefined || typeof reasoning.redacted === "boolean")));
}

/** Nested containers dereferenced by replay must be present before admission. */
function queryEvent(value: unknown): boolean {
  if (!record(value) || typeof value.type !== "string") return false;
  if (value.type === "turn.completed") return readableOutput(value.output);
  if (value.type === "query.completed") return readableQueryResult(value.result);
  if (value.type === "turn.started") return AGENT_ROLES.has(value.role) && Number.isInteger(value.turn) && Number(value.turn) >= 0;
  if (value.type === "query.started") return typeof value.sessionId === "string" && typeof value.prompt === "string";
  if (value.type === "query.failed" || value.type === "lifecycle.error") return typeof value.error === "string";
  if (value.type === "lifecycle.cancelled") return typeof value.reason === "string";
  return readableToolEvent(value);
}

/** Persisted input is untrusted even when JSON parsing succeeds. */
export function isReadableTranscriptEvent(value: unknown): boolean {
  if (!record(value) || typeof value.timestamp !== "string" || !optionalString(value.id) || value.id === "") return false;
  switch (value.type) {
    case "message": return message(value);
    case "lifecycle": return typeof value.event === "string" && optionalString(value.detail);
    case "query-event": return queryEvent(value.event);
    case "compaction": return typeof value.summary === "string" && optionalString(value.firstKeptEntryId) &&
      (value.keptMessages === undefined || (Number.isInteger(value.keptMessages) && Number(value.keptMessages) >= 0));
    case "branch_summary": return Number.isInteger(value.droppedTurns) && Number(value.droppedTurns) >= 0 &&
      optionalString(value.summary) && optionalString(value.toEntryId) &&
      (value.abandonedEntryIds === undefined || (Array.isArray(value.abandonedEntryIds) && value.abandonedEntryIds.every(id => typeof id === "string")));
    default: return false;
  }
}
