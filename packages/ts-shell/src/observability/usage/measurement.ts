import { historyDigest } from '../../context/request/identity.js';
import { decodePromptMeasurement } from '../../context/request/measurement.js';
import type { PromptMeasurement } from '../../context/request/model.js';
import type { SessionMessage } from '../../session/schema/sessionMessage.js';
import type { UsageHistoryEntry } from './model.js';

/** Restore only the newest assistant's measurement of the exact selected prefix. */
export function restorablePromptMeasurement(
  messages: readonly SessionMessage[],
  history: readonly UsageHistoryEntry[] = [],
): PromptMeasurement | undefined {
  // A durable refusal of current usage survives reentry even when the old
  // assistant remains in the transcript. Accounting history supplies no anchor.
  const latestRequest = history.at(-1);
  if (latestRequest?.kind === 'context-reset' || latestRequest?.kind === 'usage-gap') return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'assistant') continue;
    const measurement = decodePromptMeasurement(message.promptMeasurement);
    // Never fall back past a newer assistant whose accepted request had no
    // usable measurement. The count describes input, excluding its answer.
    if (!measurement || measurement.messageCount !== index) return undefined;
    const expectedDigest = measurement.projection?.historyDigest ?? measurement.identity.historyDigest;
    if (expectedDigest !== historyDigest(messages.slice(0, index))) return undefined;
    const { origin } = message;
    const { identity } = measurement;
    if (origin && (origin.model !== identity.model
      || origin.provider !== undefined && origin.provider !== identity.provider
      || origin.replayBinding !== undefined && origin.replayBinding !== identity.replayBinding)) return undefined;
    return measurement;
  }
  return undefined;
}
