import type { CommandReport } from '../../core/commands/report/contract.js';

/** An observation attached to an ancestor, inherited by its descendants. */
export interface SessionReport {
  readonly id: string;
  readonly sourceEntryId: string;
  readonly timestamp: string;
  readonly text: string;
  readonly report?: CommandReport;
}

export interface ReportTranscriptEntry {
  readonly type: 'command-output';
  readonly id?: string;
  readonly sourceEntryId: string;
  readonly timestamp: string;
  readonly text: string;
  /** Unknown versions retain their text; this payload never enters model context. */
  readonly report?: unknown;
}

export type ReportSaveStatus = 'saved' | 'not-saved' | 'unverified';
export type ReportWriter = (report: CommandReport) => ReportSaveStatus;
