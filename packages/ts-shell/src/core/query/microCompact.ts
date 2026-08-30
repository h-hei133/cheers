export interface MicrocompactOptions {
  readonly keepRecentTurns?: number;
  readonly maxOutputChars?: number;
  readonly headChars?: number;
  readonly tailChars?: number;
}

export interface ChatMessageLike {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content?: string | null;
  readonly tool_calls?: Array<{
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

  // Identify user/assistant turn boundaries from newest to oldest
  let turnCount = 0;
  let boundaryIndex = messages.length;

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

  // Track seen tool result signatures to deduplicate identical repeated tool outputs in older turns
  const seenOlderToolOutputs = new Set<string>();

  const result: T[] = messages.map((msg, index) => {
    // Only prune tool messages that occur before the recent turn boundary
    if (index < boundaryIndex && msg.role === "tool" && typeof msg.content === "string") {
      const originalLen = msg.content.length;

      // Deduplicate identical outputs in older history
      const contentHash = msg.content.slice(0, 200);
      if (seenOlderToolOutputs.has(contentHash) && originalLen > 300) {
        prunedCount++;
        const deduplicated = `[... Duplicate tool output omitted: ${originalLen} characters previously shown ...]`;
        savedChars += originalLen - deduplicated.length;
        return {
          ...msg,
          content: deduplicated,
        };
      }
      seenOlderToolOutputs.add(contentHash);

      if (originalLen > maxOutputChars) {
        const pruned = pruneToolContent(msg.content, headChars, tailChars);
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
    }
    return msg;
  });

  return { messages: result, prunedCount, savedChars };
}
