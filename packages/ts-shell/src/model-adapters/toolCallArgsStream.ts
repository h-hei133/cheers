import { parseJsonWithRepair } from "./jsonRepair.js";
import { StreamingJsonParser, type JsonValue } from "./streamingJson.js";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeParseObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = parseJsonWithRepair<unknown>(raw);
    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export class ToolCallArgumentsStream {
  #text = "";
  #parser = new StreamingJsonParser();
  #snapshot: JsonValue | undefined = undefined;
  #arguments: Record<string, unknown> = {};

  get text(): string {
    return this.#text;
  }

  append(delta: string): Record<string, unknown> {
    this.#text += delta;
    this.#parser.append(delta);
    const next = this.#parser.snapshot();
    if (next !== this.#snapshot) {
      this.#snapshot = next;
      this.#arguments = isPlainRecord(next) ? next : {};
    }
    return this.#arguments;
  }

  finish(): { readonly arguments: Record<string, unknown>; readonly argumentsError?: string } {
    const parsed = this.#text.trim() ? safeParseObject(this.#text) : undefined;
    if (parsed !== undefined) {
      return { arguments: parsed };
    }
    return { arguments: {}, argumentsError: "Malformed tool call JSON arguments." };
  }
}

/** Tolerant one-shot parser for partial streamed JSON tool-call text. */
export function parseStreamingJson<T = Record<string, unknown>>(partialJson: string | undefined): T {
  if (!partialJson || !partialJson.trim()) return {} as T;
  const full = safeParseObject(partialJson);
  if (full !== undefined) return full as T;
  const parser = new StreamingJsonParser();
  parser.append(partialJson);
  const snap = parser.snapshot();
  return (isPlainRecord(snap) ? snap : {}) as T;
}
