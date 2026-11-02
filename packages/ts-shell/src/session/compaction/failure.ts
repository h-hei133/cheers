import { ModelAdmissionError } from '../../core/agent/request/model.js';
import { redactReportText } from '../../core/security/redaction.js';
import { CompactionOperationError, SummaryAdmissionError } from './contract.js';

export const SUMMARY_MISSING = 'The provider returned no summary.';

export class CompactionSummaryError extends Error {
  constructor() {
    super(SUMMARY_MISSING);
    this.name = 'CompactionSummaryError';
  }
}

/** Only local refusals carry displayable detail; transport errors may contain raw bodies. */
export function compactionErrorMessage(error: unknown, projectRoot?: string): string {
  const detail = error instanceof CompactionOperationError || error instanceof SummaryAdmissionError
    || error instanceof CompactionSummaryError || error instanceof ModelAdmissionError
    ? error.message : 'The summary request failed; history was retained.';
  return redactReportText(detail, 1024, { projectRoot });
}

export const COMPACTION_DECLINE_MESSAGES = {
  'blocked-by-hook': 'Compaction was refused by a PreCompact hook.',
  'would-not-shrink': 'The summary would be at least as large as the messages it replaces, so compacting would not free any context.',
  'step-unknown': 'A previous summary step may already have been sent; it was not repeated. Add a turn or change the instructions, then retry.',
} as const;
