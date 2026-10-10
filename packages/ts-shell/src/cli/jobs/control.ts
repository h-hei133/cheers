import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { jobsCommandFor } from '../runtime/jobs.js';

export function jobsControl(text: string): boolean { return /^\/(jobs|hub)(?:\s|$)/i.test(text.trim()); }
export async function runJobsControl(text: string, context: ShellRuntimeContext,
  renderer: { renderLine(line: string): void }, questionPending = false): Promise<void> {
  const match = /^\/(jobs|hub)(?:\s+([\s\S]*))?$/i.exec(text.trim()); if (!match) return;
  const raw = match[2] ?? ''; const readOnly = match[1]!.toLowerCase() === 'hub' || /^\s*(?:list|show|output)(?:\s|$)/i.test(raw) || !raw.trim();
  if (questionPending && !readOnly) { renderer.renderLine('Job control waits for the current approval or question.'); return; }
  try {
    const result = await jobsCommandFor(context)(match[1]!.toLowerCase() as 'jobs' | 'hub', match[1]!.toLowerCase() === 'hub' ? tokenizeCommandArgs(raw) : [], {
      cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true, rawCommandArgs: raw,
    });
    renderer.renderLine(result.output);
  } catch { renderer.renderLine('Job control is unavailable; inspect the retained job state.'); }
}
