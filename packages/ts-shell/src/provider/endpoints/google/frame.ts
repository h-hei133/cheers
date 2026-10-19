import { isRecord } from '../../../core/values/record.js';

/** An absent usage-only field is allowed; a malformed field cannot heal a turn. */
export function validGoogleFrame(value: unknown): boolean {
  if (!isRecord(value) || (value.error !== undefined && value.error !== null)) return false;
  if (value.promptFeedback !== undefined && (!isRecord(value.promptFeedback)
    || (value.promptFeedback.blockReason !== undefined && typeof value.promptFeedback.blockReason !== 'string')
    || (value.promptFeedback.blockReasonMessage !== undefined && typeof value.promptFeedback.blockReasonMessage !== 'string'))) return false;
  if (value.candidates === undefined) return true;
  if (!Array.isArray(value.candidates)) return false;
  return value.candidates.every(candidate => isRecord(candidate)
    && (candidate.finishReason === undefined || (typeof candidate.finishReason === 'string' && !!candidate.finishReason))
    && (candidate.content === undefined || (isRecord(candidate.content)
      && (candidate.content.role === undefined || candidate.content.role === 'model')
      && Array.isArray(candidate.content.parts))));
}
