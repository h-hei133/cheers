import { isRecord } from '../../../core/values/record.js';
import type { SessionReentrySummary } from '../../presentation/sessionReentrySurface.js';

const requiredText = ['id', 'projectRoot', 'createdAt', 'updatedAt', 'resumeDetail'] as const;
const optionalText = ['title', 'pendingPrompt', 'lastError', 'lastUserMessage', 'lastAssistantMessage', 'blockedDetail'] as const;
const requiredBoolean = ['recoverable', 'autoResumeReady', 'hasConversation'] as const;
const optionalSteps = ['stagedRepairStepCount', 'stagedRepairCompletedStep', 'stagedRepairBlockedStep', 'stagedRepairNextStep'] as const;
const choices = {
  status: ['active', 'interrupted', 'completed', 'error', 'terminated'],
  resumeDisposition: ['fully-resumable', 'partially-resumable', 'not-resumable'],
  runPhase: ['idle', 'prompt-persisted', 'turn-active'],
  durableStatus: ['success', 'stopped', 'error'],
  terminalReason: ['completed', 'stopped_cycle', 'stopped_max_turns', 'stopped_invalid_handoff', 'stopped_not_proven', 'stopped_error'],
  terminalClassification: ['success', 'stopped', 'error'],
  blockedReason: ['session-corrupt', 'terminal-evidence-indeterminate', 'continuation-evidence-missing'],
} as const satisfies Partial<Record<keyof SessionReentrySummary, readonly string[]>>;

/** A malformed cache row is a miss; it never becomes a recovery choice. */
export function decodeReentrySummary(value: unknown, sessionId: string): SessionReentrySummary | undefined {
  if (!isRecord(value) || value.id !== sessionId
    || requiredText.some(key => typeof value[key] !== 'string')
    || requiredBoolean.some(key => typeof value[key] !== 'boolean')
    || typeof value.status !== 'string' || typeof value.resumeDisposition !== 'string') return undefined;

  if (optionalText.some(key => value[key] !== undefined && typeof value[key] !== 'string')
    || value.hasReportHistory !== undefined && typeof value.hasReportHistory !== 'boolean'
    || optionalSteps.some(key => value[key] !== undefined
      && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0))) return undefined;

  for (const [key, allowed] of Object.entries(choices)) {
    const field = value[key];
    if (field !== undefined && (typeof field !== 'string' || !(allowed as readonly string[]).includes(field))) return undefined;
  }
  return value as unknown as SessionReentrySummary;
}
