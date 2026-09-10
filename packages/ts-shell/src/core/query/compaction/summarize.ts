import { extractFileFootprint, formatFileFootprintXml } from "./fileFootprint.js";
import {
  EIGHT_SECTION_COMPACTION_PROMPT,
  formatCheckpointMessage,
  parseCompactedSummary,
} from "./summarizer.js";

/**
 * One summarization request.
 *
 * Both the in-loop overflow recovery and the explicit `/compact` command need
 * the same thing: the conversation so far condensed into one checkpoint message
 * the model can continue from. Asking the provider is done here, once, so the
 * two paths cannot drift in prompt, parsing, or footprint handling.
 */

export interface CompactionProvider {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export interface CompactionChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content?: string | null;
  readonly tool_calls?: readonly unknown[];
  readonly tool_call_id?: string;
}

export interface CompactionRequest {
  readonly provider: CompactionProvider;
  /** The messages to condense, in order. */
  readonly messages: readonly CompactionChatMessage[];
  readonly signal?: AbortSignal;
  /** What the user asked the summary to pay attention to, if anything. */
  readonly instructions?: string;
}

/** The checkpoint message replacing `messages`, or nothing when the provider could not produce one. */
export async function requestCompactionSummary(request: CompactionRequest): Promise<string | undefined> {
  const prompt = request.instructions?.trim()
    ? `${EIGHT_SECTION_COMPACTION_PROMPT}\n\nThe user asked the summary to focus on: ${request.instructions.trim()}`
    : EIGHT_SECTION_COMPACTION_PROMPT;
  const res = await fetch(`${request.provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.provider.apiKey}`,
    },
    body: JSON.stringify({
      model: request.provider.model,
      messages: [...request.messages, { role: "user", content: prompt }],
    }),
    signal: request.signal,
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const summaryContent = data.choices?.[0]?.message?.content;
  if (!summaryContent) return undefined;
  const { rawSummary } = parseCompactedSummary(summaryContent);
  const footprintXml = formatFileFootprintXml(extractFileFootprint(request.messages));
  return formatCheckpointMessage(rawSummary, footprintXml);
}
