import type { LocalCommandResult } from '../../core/commands/types.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { SessionMessage } from '../../session/schema/sessionMessage.js';
import type { ReportWriter } from '../../session/reports/model.js';
import { reportSaveNotice } from './reports.js';
import type { SignInProgress } from '../../core/auth/providerAuthContract.js';

/** Native flow validates these transient instructions before requesting a display. */
export function renderSignInProgress(renderer: Pick<StreamingRenderer, 'renderLine'>, progress: SignInProgress): void {
  renderer.renderLine(`Sign in at ${progress.authorizeUrl}${progress.userCode ? `\nEnter code: ${progress.userCode}` : ''}`);
}

/** Keep an independently durable business result visible when context publication fails. */
export function renderLocalCommand(input: {
  readonly result: LocalCommandResult;
  readonly renderer: StreamingRenderer;
  readonly printMode: boolean;
  readonly onTurnMessage?: (message: SessionMessage) => void;
  readonly onReport?: ReportWriter;
}): void {
  const { result, renderer } = input;
  let warning: string | undefined;
  if (result.state) {
    try {
      input.onTurnMessage?.({ role: 'user', content: `[Local command result]\n${result.output}`, metadata: result.state });
    } catch (error) {
      if (!result.stateFailureWarning) throw error;
      warning = result.stateFailureWarning;
    }
  }
  // A renderer without report support still shows the plain text; the report is
  // an additional view, not the only one.
  if (result.report && typeof renderer.renderReport === 'function') renderer.renderReport(result.report);
  else renderer.renderLine(input.printMode ? result.output : `\n${result.output}\n`);
  if (warning) renderer.renderLine(warning);
  if (result.report && input.onReport) {
    const notice = reportSaveNotice(input.onReport(result.report));
    if (notice) renderer.renderLine(notice);
  }
}
