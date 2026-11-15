import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { QueryEvent } from '../../../core/query/runtime/events.js';
import { createReport, displayReportText, span } from '../../../core/commands/report/projection.js';
import { boundText } from '../../../core/agent/tools.js';
import { redactExportText } from '../../../core/security/redaction.js';
import { captureBranchStore } from '../../../session/branch/store/index.js';
import { NAVIGATION_LIMITS } from '../../../session/query/navigation/limits.js';
import { readBoundSessionState } from '../../../session/store/bound.js';
import { sessionRootEntryId } from '../../../session/schema/sessionThread.js';
import { createTranscriptEntryId } from '../../../session/sessionEventCodec.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { ReportSaveStatus } from '../../../session/reports/model.js';
import { shellText, type ShellResult } from './result.js';

/** Capture before command work; a successor session or branch cannot claim the result. */
export function captureShellHistory(context: ShellRuntimeContext, manager: SessionManager) {
  const session = context.session, active = context.activeSession;
  const cwd = context.cwd, projectRoot = context.projectRoot, background = context.configuration.backgroundSignal;
  const admission = () => context.session !== session || context.activeSession !== active
    || context.cwd !== cwd || context.projectRoot !== projectRoot || context.configuration.backgroundSignal !== background
    ? 'The shell command session changed.' : undefined;
  const assertCurrent = () => { const refused = admission(); if (refused) throw new Error(refused); };
  const bound = readBoundSessionState(manager, session, NAVIGATION_LIMITS);
  const sourceEntryId = bound.state.thread?.activeLeafId ?? sessionRootEntryId(session.id);
  const branch = captureBranchStore({ sessionId: session.id, cwd, namespace: 'shell', admission: assertCurrent, limits: NAVIGATION_LIMITS });
  const writeReport = manager.captureReportWriter(session.id);
  assertCurrent();
  return {
    background, sessionId: session.id, cwd,
    admission: () => {
      try { branch.assertCurrent([]); return undefined; }
      catch { return 'The shell command session or branch is unavailable or changed.'; }
    },
    emit: (event: QueryEvent) => manager.appendQueryEvent(session.id, event.type === 'tool.result' && event.output !== undefined
      ? { ...event, output: boundText(displayReportText(redactExportText(event.output))) } : event, { entryId: sourceEntryId }),
    save(command: string, result: ShellResult): ReportSaveStatus {
      try { branch.assertCurrent([]); } catch { return 'not-saved'; }
      const content = shellText(command, result);
      if (result.excludeFromContext) {
        try {
          return writeReport(createReport({ title: 'Shell command',
            lines: content.split('\n').map(text => ({ kind: 'text', spans: [span(text)] })),
            facts: { status: result.status, exitCode: result.exitCode, isError: result.isError, cancelled: result.cancelled,
              truncated: result.truncated, excludeFromContext: true } }));
        } catch { return 'not-saved'; }
      }
      const id = createTranscriptEntryId('shell');
      try {
        // This uses the ordinary synchronous message writer after the captured
        // branch check; it does not claim a cross-process transaction.
        assertCurrent();
        manager.addTurn(session.id, { id, role: 'custom', customType: 'shell', display: true, content,
          data: { status: result.status, exitCode: result.exitCode, isError: result.isError, cancelled: result.cancelled,
            truncated: result.truncated, ...(typeof result.outputArtifact === 'string' ? { outputArtifact: result.outputArtifact } : {}) } });
        const saved = manager.getSession(session.id);
        return saved?.turns.some(message => message.id === id && message.content === content) ? 'saved' : 'unverified';
      } catch { return 'unverified'; }
    },
  };
}
