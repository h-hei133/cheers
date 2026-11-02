import type { AgentMessage } from '../core/agent/state.js';
import type { SessionUsageTelemetry } from '../observability/usage/model.js';
import { historyDigest } from '../context/request/identity.js';
import { CHARS_PER_TOKEN } from '../session/context.js';
import { outgoingProjection } from './messages.js';
import type { PromptMeasurement } from '../context/request/model.js';

/** Bind the known transient opening rewrite without persisting its environment or attached source text. */
export function storedPromptProjection(messages: readonly AgentMessage[], projection: ReturnType<typeof outgoingProjection>,
  source: { readonly opening: AgentMessage; readonly stored: AgentMessage } | undefined,
  bridge: boolean, wireMessageCount: number): PromptMeasurement['projection'] {
  if (!source || source.opening.role !== 'user' || source.stored.role !== 'user'
    || typeof source.opening.content !== 'string' || typeof source.stored.content !== 'string'
    || !projection.indexAligned || wireMessageCount !== messages.length) return undefined;
  const index = messages.indexOf(source.opening);
  if (index < 0 || source.opening.content === source.stored.content) return undefined;
  // The host supplies the accepted prompt, never a replacement conversation.
  // Attached context follows its own framing, so unprovable transformations
  // retain the actual request identity and fall back on later reads.
  if (!source.opening.content.endsWith(`\n\n${source.stored.content}`)) return undefined;
  const canonical = messages.map((message, position) => position === index
    ? { ...message, content: source.stored.content } : message);
  const projected = outgoingProjection(canonical, bridge);
  if (!projected.indexAligned) return undefined;
  let removedChars = 0;
  for (let position = 0; position < messages.length; position++) {
    const before = projection.messages[position]!; const after = projected.messages[position]!;
    if (typeof before.content !== 'string' || typeof after.content !== 'string'
      || historyDigest([{ ...before, content: '' }]) !== historyDigest([{ ...after, content: '' }])) return undefined;
    removedChars += before.content.length - after.content.length;
  }
  if (removedChars < 0) return undefined;
  return { historyDigest: historyDigest(canonical), wireHistoryDigest: historyDigest(projected.messages),
    wireRewriteTokens: Math.ceil(projected.savedChars / CHARS_PER_TOKEN),
    removedTokens: Math.floor(removedChars / CHARS_PER_TOKEN) };
}

/** Prove a source-indexed text rewrite against the exact request the provider measured. */
export function measuredProjectionPrefix(messages: readonly AgentMessage[],
  projection: ReturnType<typeof outgoingProjection>, usage: SessionUsageTelemetry, bridge: boolean) {
  const count = usage.lastPromptMessageCount;
  const recorded = usage.lastPromptIdentity;
  const currentDigest = historyDigest(messages.slice(0, count));
  const stored = currentDigest === recorded?.historyDigest ? undefined : usage.lastPromptProjection;
  if (!recorded?.wireHistoryDigest || !Number.isSafeInteger(count) || count < 0 || count > messages.length
    || recorded.wireMessageCount !== count || !projection.indexAligned
    || messages.some(message => typeof message.content !== 'string'
      || message.reasoning?.signature !== undefined || message.reasoning?.redacted
      || message.origin?.replayBinding !== undefined && (message.origin.provider !== recorded.provider
        || message.origin.model !== recorded.model || message.origin.replayBinding !== recorded.replayBinding))
    || (stored?.historyDigest ?? recorded.historyDigest) !== currentDigest) return undefined;
  // Reconstruct the old request from the unchanged raw prefix. This checks the
  // codec and pruning decisions as well as the source digest; a changed wire
  // digest alone never licenses reuse of an anchor.
  const original = outgoingProjection(messages.slice(0, count), bridge);
  if (!original.indexAligned || historyDigest(original.messages) !== (stored?.wireHistoryDigest ?? recorded.wireHistoryDigest)) return undefined;
  const baseline = Math.ceil(original.savedChars / CHARS_PER_TOKEN);
  const recordedRewrite = stored?.wireRewriteTokens ?? recorded.wireRewriteTokens;
  if (recordedRewrite !== undefined && recordedRewrite !== baseline) return undefined;
  let removedChars = 0;
  for (let index = 0; index < count; index++) {
    const before = original.messages[index]!;
    const after = projection.messages[index]!;
    if (historyDigest([{ ...before, content: '' }]) !== historyDigest([{ ...after, content: '' }])) return undefined;
    removedChars += (before.content as string).length - (after.content as string).length;
  }
  if (removedChars < 0) return undefined;
  // The measured prefix and fixed request overhead still occupy the prompt.
  // Exhausting its provider count means this anchor cannot describe the rewrite.
  const removedTokens = Math.floor(removedChars / CHARS_PER_TOKEN) + (stored?.removedTokens ?? 0);
  const anchorTokens = usage.lastPromptTokens;
  if (anchorTokens === undefined || !Number.isSafeInteger(anchorTokens)
    || removedTokens >= anchorTokens) return undefined;
  return { wireHistoryDigest: recorded.wireHistoryDigest, wireMessageCount: count,
    historyDigest: currentDigest,
    // Round removal down: character estimation must not overstate freed space.
    rewriteTokensRemoved: removedTokens };
}
