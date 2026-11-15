import type { AgentToolResult } from '../../../core/agent/tools.js';
import { boundText, TOOL_OUTPUT_LIMIT } from '../../../core/agent/tools.js';
import { displayReportText } from '../../../core/commands/report/projection.js';
import { redactExportText } from '../../../core/security/redaction.js';
import type { ReportSaveStatus } from '../../../session/reports/model.js';

export interface ShellResult extends Record<string, unknown> {
  readonly output: string;
  /** Native process status, independently of after-call hooks and history writes. */
  readonly status: 'blocked' | 'denied' | 'completed' | 'failed' | 'cancelled' | 'timeout' | 'unknown';
  readonly exitCode: number | null;
  readonly isError: boolean;
  readonly cancelled: boolean;
  readonly truncated: boolean;
  readonly excludeFromContext: boolean;
  readonly historySaved: ReportSaveStatus;
}

export function shellResult(result: AgentToolResult, input: {
  readonly cancelled: boolean; readonly started: boolean; readonly denied: boolean; readonly excludeFromContext: boolean;
}): ShellResult {
  const metadata = result.metadata;
  const nativeStatus = metadata?.status;
  const status = nativeStatus === 'completed' || nativeStatus === 'failed' || nativeStatus === 'cancelled' || nativeStatus === 'timeout'
    ? nativeStatus : input.started ? 'unknown' : input.cancelled ? 'cancelled' : input.denied ? 'denied' : 'blocked';
  const safe = displayReportText(redactExportText(result.output));
  const notice = typeof metadata?.outputNotice === 'string' ? displayReportText(redactExportText(metadata.outputNotice)) : undefined;
  const output = boundText(safe, TOOL_OUTPUT_LIMIT, notice);
  return {
    output, status, exitCode: typeof metadata?.exitCode === 'number' && Number.isInteger(metadata.exitCode) ? metadata.exitCode : null,
    isError: result.isError || status !== 'completed', cancelled: status === 'cancelled',
    truncated: metadata?.truncated === true || output !== safe, excludeFromContext: input.excludeFromContext, historySaved: 'not-saved',
    ...(metadata?.outputComplete === false ? { outputComplete: false } : {}),
    ...(metadata?.outputCleanup === 'unknown' ? { outputCleanup: 'unknown' } : {}),
    ...(typeof metadata?.outputArtifact === 'string' && /^artifact:\/\/\d+$/.test(metadata.outputArtifact)
      ? { outputArtifact: metadata.outputArtifact } : {}),
  };
}

/** Shell text is data, never executable terminal output or an unbounded history entry. */
export function shellText(command: string, result: ShellResult): string {
  const status = result.isError && result.status === 'completed' ? 'completed; result verification failed' : result.status;
  return `[Shell command: ${status}; exit code ${result.exitCode ?? 'unavailable'}]\n`
    + `${displayReportText(redactExportText(command))}\n\n${result.output}`;
}
