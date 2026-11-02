import type { AgentMessage } from '../core/agent/state.js';
import type { SessionUsageTelemetry } from '../observability/usage/model.js';
import { historyDigest } from '../context/request/identity.js';
import { CHARS_PER_TOKEN } from '../session/context.js';
import { outgoingProjection } from './messages.js';

/** Prove a source-indexed text rewrite against the exact request the provider measured. */
export function measuredProjectionPrefix(messages: readonly AgentMessage[],
  projection: ReturnType<typeof outgoingProjection>, usage: SessionUsageTelemetry, bridge: boolean) {
  const count = usage.lastPromptMessageCount;
  const recorded = usage.lastPromptIdentity;
  if (!recorded?.wireHistoryDigest || !Number.isSafeInteger(count) || count < 0 || count > messages.length
    || recorded.wireMessageCount !== count || !projection.indexAligned
    || messages.some(message => typeof message.content !== 'string'
      || message.reasoning?.signature !== undefined || message.reasoning?.redacted
      || message.origin?.replayBinding !== undefined && (message.origin.provider !== recorded.provider
        || message.origin.model !== recorded.model || message.origin.replayBinding !== recorded.replayBinding))
    || recorded.historyDigest !== historyDigest(messages.slice(0, count))) return undefined;
  // Reconstruct the old request from the unchanged raw prefix. This checks the
  // codec and pruning decisions as well as the source digest; a changed wire
  // digest alone never licenses reuse of an anchor.
  const original = outgoingProjection(messages.slice(0, count), bridge);
  if (!original.indexAligned || historyDigest(original.messages) !== recorded.wireHistoryDigest) return undefined;
  const baseline = Math.ceil(original.savedChars / CHARS_PER_TOKEN);
  if (recorded.wireRewriteTokens !== undefined && recorded.wireRewriteTokens !== baseline) return undefined;
  let removedChars = 0;
  for (let index = 0; index < count; index++) {
    const before = original.messages[index]!;
    const after = projection.messages[index]!;
    if (historyDigest([{ ...before, content: '' }]) !== historyDigest([{ ...after, content: '' }])) return undefined;
    removedChars += (before.content as string).length - (after.content as string).length;
  }
  if (removedChars < 0) return undefined;
  return { wireHistoryDigest: recorded.wireHistoryDigest, wireMessageCount: count,
    // Round removal down: character estimation must not overstate freed space.
    rewriteTokensRemoved: Math.floor(removedChars / CHARS_PER_TOKEN) };
}
