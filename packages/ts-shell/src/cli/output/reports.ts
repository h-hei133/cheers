import type { ReportSaveStatus, ReportWriter } from '../../session/reports/model.js';
import type { SessionManager } from '../../session/SessionManager.js';

export function reportWriter(manager: Pick<SessionManager, 'captureReportWriter'>, sessionId: string): ReportWriter {
  try { return manager.captureReportWriter(sessionId); }
  catch { return () => 'not-saved'; }
}

export function reportSaveNotice(status: ReportSaveStatus): string | undefined {
  if (status === 'not-saved') return 'Report shown; it was not saved to session history.';
  if (status === 'unverified') return 'Report shown; its session history save could not be confirmed.';
  return undefined;
}
