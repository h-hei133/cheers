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
  };
}
