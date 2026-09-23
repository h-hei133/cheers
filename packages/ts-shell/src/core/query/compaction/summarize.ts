import {
  extractFileFootprint,
  formatFileFootprintXml,
  mergeFileFootprints,
  parseFileFootprintXml,
} from "./fileFootprint.js";
import {
  EIGHT_SECTION_COMPACTION_PROMPT,
  UPDATE_COMPACTION_PROMPT,
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
  /** Which summary to ask for; defaults to the full checkpoint prompt. */
  readonly prompt?: string;
  /**
   * The checkpoint the messages already begin with, when a previous compaction
   * wrote one.
   *
   * Present means the messages are additions to that checkpoint rather than a
   * conversation to summarize from scratch, so the summary asked for is a
   * revision of it. Supplying it here rather than letting the caller pick a
   * prompt keeps the choice of prompt and the shape of the request together.
   */
  readonly previousSummary?: string;
}

/** The checkpoint message replacing `messages`, or nothing when the provider could not produce one. */
export async function requestCompactionSummary(request: CompactionRequest): Promise<string | undefined> {
  const previousSummary = request.previousSummary?.trim();
  // Revising a checkpoint and summarizing from scratch are different questions,
  // so the default prompt follows which one is being asked. An explicit prompt
  // still wins: the caller knows if it wants something else entirely.
  const base = request.prompt ?? (previousSummary ? UPDATE_COMPACTION_PROMPT : EIGHT_SECTION_COMPACTION_PROMPT);
  const prompt = request.instructions?.trim()
    ? `${base}\n\nThe user asked the summary to focus on: ${request.instructions.trim()}`
    : base;
  const res = await fetch(`${request.provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.provider.apiKey}`,
    },
    body: JSON.stringify({
      model: request.provider.model,
      messages: [
        ...(previousSummary
          ? [{ role: "user", content: `<previous-summary>\n${previousSummary}\n</previous-summary>` }]
          : []),
        ...request.messages,
        { role: "user", content: prompt },
      ],
    }),
    signal: request.signal,
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const summaryContent = data.choices?.[0]?.message?.content;
  if (!summaryContent) return undefined;
  const { rawSummary } = parseCompactedSummary(summaryContent);
  // The previous checkpoint's own footprint is merged in, so a file read before
  // an earlier compaction is still named after this one. Without it the list
  // only ever describes the messages in front of the summarizer, and the model
  // re-reads files it has already seen — which is the cost this list exists to
  // avoid.
  const footprint = mergeFileFootprints(
    parseFileFootprintXml(previousSummary),
    extractFileFootprint(request.messages),
  );
  return formatCheckpointMessage(rawSummary, formatFileFootprintXml(footprint));
}
