export interface SessionToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

import type { MultimodalContentBlock } from "../../model-adapters/multimodal.js";

export interface SessionMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  /**
   * What the message says: text, or text with images attached.
   *
   * A union rather than a separate field, because every reader has to answer the
   * same question and two fields would let them answer it differently — one
   * looking at `parts`, another at `content`, and a message reading as empty to
   * whichever looked at the wrong one. A reader that only wants the text calls
   * `messageToText`.
   */
  content: string | readonly MultimodalContentBlock[];
  tool_calls?: readonly SessionToolCall[];
  tool_call_id?: string;
  /**
   * Structured facts recorded beside a tool's prose.
   *
   * The prose is the answer the model reads; this is the state a later reader
   * replays from — the todo checklist a session carries, restored after a
   * resume or on the branch this turn belongs to. Optional and additive, so
   * every transcript written before it exists reads exactly as it did.
   */
  metadata?: Record<string, unknown>;
  timestamp?: string;
  /**
   * The model an assistant answer came from, when the answer was model-shaped.
   *
   * Optional because every other role has no model behind it, and because the
   * transcripts written before this field existed hold answers that cannot be
   * attributed. A reader that finds it absent treats the answer as coming from
   * the current model rather than from a different one, so old records keep
   * behaving the way they did when they were written.
   */
  origin?: {
    readonly provider?: string;
    readonly model: string;
  };
  /**
   * What kind of provider failure produced this message, when one did.
   *
   * Recorded next to `errorMessage` rather than inside it: the message is the
   * provider's own words, and the class is what a reader can branch on. Absent
   * on every other message, and on failures that were not the provider's.
   */
  failureClass?: string;
  /**
   * The working out an assistant answer came with, and the provider's signature
   * over it.
   *
   * Kept apart from `content` because it is not what the answer says: the text
   * here is the reasoning a model produced before answering, and a reader that
   * treated it as content would put it in front of the user as the answer.
   *
   * It is stored at all because some providers require it back. A provider that
   * signs its reasoning rejects a later request in the same trajectory that
   * omits the signed block, so dropping this after displaying it turns the next
   * turn into a rejected one. `signature` is opaque and belongs to the provider
   * that issued it — a signature is bound to the credential that produced it,
   * which is why it is carried with the message rather than reconstructed.
   */
  reasoning?: {
    readonly text: string;
    readonly signature?: string;
    /**
     * Whether the provider withheld this reasoning and the signature is its
     * opaque payload.
     *
     * Such a block is not ours to read, but it must go back exactly as it came:
     * a later turn that drops it while carrying the tool calls it preceded is
     * refused. The flag is what lets the request be rebuilt with the block type
     * the provider issued rather than a plain `thinking` block it will reject.
     */
    readonly redacted?: boolean;
  };
}

/** Context rendered from a durable summary is not a newly authored turn. */
export function isSessionContextMessage(message: SessionMessage): boolean {
  return message.metadata?.contextSummary === "compaction" || message.metadata?.contextSummary === "branch";
}
