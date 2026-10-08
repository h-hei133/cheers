import type { LocalCommandResult } from '../../core/commands/types.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { SessionMessage } from '../../session/schema/sessionMessage.js';
import type { ReportWriter } from '../../session/reports/model.js';
import { reportSaveNotice } from './reports.js';

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
  if (result.report) renderer.renderReport(result.report);
  else renderer.renderLine(input.printMode ? result.output : `\n${result.output}\n`);
  if (warning) renderer.renderLine(warning);
  if (result.report && input.onReport) {
    const notice = reportSaveNotice(input.onReport(result.report));
    if (notice) renderer.renderLine(notice);
  }
}
