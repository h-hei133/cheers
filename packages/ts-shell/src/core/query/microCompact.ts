import { messageToText, type MultimodalContentBlock } from "../../model-adapters/multimodal.js";
export interface MicrocompactOptions {
  readonly keepRecentTurns?: number;
  readonly maxOutputChars?: number;
  readonly headChars?: number;
  readonly tailChars?: number;
}

export interface ChatMessageLike {
  readonly role: "system" | "user" | "assistant" | "tool";
  /**
   * Text, or text with images.
   *
   * Recent images stay intact. Older tool images are replaced by descriptive
   * text and a re-read instruction; user attachments remain intact.
   */
  readonly content?: string | readonly MultimodalContentBlock[] | null;
  readonly tool_calls?: ReadonlyArray<{
    readonly id: string;
    readonly type: "function";
    readonly function: { readonly name: string; readonly arguments: string };
  }>;
  readonly tool_call_id?: string;
}

const DEFAULT_KEEP_RECENT_TURNS = 3;
const DEFAULT_MAX_OUTPUT_CHARS = 1000;
const DEFAULT_HEAD_CHARS = 500;
const DEFAULT_TAIL_CHARS = 500;

/**
 * Prune single tool output text to Head + Omitted marker + Tail
 */
export function pruneToolContent(
  content: string,
  headChars: number = DEFAULT_HEAD_CHARS,
  tailChars: number = DEFAULT_TAIL_CHARS,
): string {
  if (!content || content.length <= headChars + tailChars + 50) {
    return content;
  }

  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  const omittedChars = content.length - (headChars + tailChars);
  const omittedLines = content.slice(headChars, -tailChars).split("\n").length;

  return `${head}\n\n[... Omitted ${omittedLines} lines / ${omittedChars} characters from older tool output ...]\n\n${tail}`;
}

/**
 * Microcompact message history:
 * Scans messages from oldest to newest, keeping tool outputs in the recent N turns intact,
 * and cleanly pruning older tool outputs to head/tail slices.
 */
export function microcompactMessages<T extends ChatMessageLike>(
  messages: readonly T[],
  options: MicrocompactOptions = {},
): { readonly messages: T[]; readonly prunedCount: number; readonly savedChars: number } {
  const keepRecentTurns = options.keepRecentTurns ?? DEFAULT_KEEP_RECENT_TURNS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const headChars = options.headChars ?? DEFAULT_HEAD_CHARS;
  const tailChars = options.tailChars ?? DEFAULT_TAIL_CHARS;

  if (!messages || messages.length === 0) {
    return { messages: [], prunedCount: 0, savedChars: 0 };
  }

  // Identify user/assistant turn boundaries from newest to oldest.
  // Defaults to 0 so histories with fewer turns than keepRecentTurns are preserved intact.
  let turnCount = 0;
  let boundaryIndex = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" || msg.role === "assistant") {
      turnCount++;
      if (turnCount >= keepRecentTurns * 2) {
        boundaryIndex = i;
        break;
      }
    }
  }

  let prunedCount = 0;
  let savedChars = 0;

  // Track seen tool result signatures via full-content hashing to deduplicate identical repeated outputs
  const seenOlderToolOutputs = new Set<string>();

  const result: T[] = messages.map((msg, index) => {
    // Only prune tool messages that occur before the recent turn boundary
    const hasImages = Array.isArray(msg.content) && msg.content.some(block => block.type === 'image');
    if (index < boundaryIndex && msg.role === "tool" && (typeof msg.content === 'string' || hasImages)) {
      const content = typeof msg.content === "string" ? msg.content : messageToText(msg.content, { placeholderForImages: true });
      const imageNotice = hasImages ? "\n[Older tool images omitted; re-read the source if visual content is needed.]" : '';
      const originalLen = typeof msg.content === 'string' ? msg.content.length
        : (msg.content ?? []).reduce((length, block) => length + (block.type === 'image' ? block.data.length : block.text.length), 0);

      // Deduplicate identical outputs in older history using full content hash
      let hash = 0;
      for (let c = 0; c < content.length; c++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(c);
        hash |= 0;
      }
      const contentHash = `${content.length}:${hash}`;

      if (!hasImages && seenOlderToolOutputs.has(contentHash) && originalLen > 300) {
        prunedCount++;
        const deduplicated = `[... Duplicate tool output omitted: ${content.length} characters previously shown ...]${imageNotice}`;
        savedChars += Math.max(0, originalLen - deduplicated.length);
        return {
          ...msg,
          content: deduplicated,
        };
      }
      if (!hasImages) seenOlderToolOutputs.add(contentHash);

      if (content.length > maxOutputChars) {
        const pruned = pruneToolContent(content, headChars, tailChars) + imageNotice;
        const diff = originalLen - pruned.length;
        if (diff > 0) {
          prunedCount++;
          savedChars += diff;
          return {
            ...msg,
            content: pruned,
          };
        }
      }
      if (hasImages) {
        prunedCount++;
        savedChars += Math.max(0, originalLen - content.length - imageNotice.length);
        return { ...msg, content: content + imageNotice };
      }
    }
    return msg;
  });

  return { messages: result, prunedCount, savedChars };
}
