import type { CommandContext, CommandExecutionResult } from '../core/commands/types.js';
import { advisorSyntax } from '../core/commands/advisor/syntax.js';
import { parseSyntax } from '../core/commands/syntax/parse.js';
import { syntaxHelp } from '../core/commands/syntax/projection.js';
import type { AdvisorRuntime } from './runtime.js';
import { showAdvisor } from './projection.js';

export async function runAdvisorCommand(args: readonly string[], context: CommandContext, runtime: AdvisorRuntime,
  busy: boolean): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(advisorSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /advisor arguments: ${parsed.reason}\n${syntaxHelp(advisorSyntax)}` };
  const action = parsed.action.name;
  try {
    if (action === 'configure') {
      const every = numeric(parsed.flags.get('every'), 1, 1, 100);
      const timeoutMs = numeric(parsed.flags.get('timeout'), 10000, 100, 60000);
      return { kind: 'local', output: showAdvisor(runtime.configure({ target: parsed.args[0]!, every, timeoutMs,
        mode: parsed.flags.get('mode') === 'end' ? 'end' : 'turn' })) };
    }
    if (action === 'on' || action === 'off') return { kind: 'local', output: showAdvisor(runtime.setEnabled(action === 'on')) };
    if (action === 'apply') {
      if (busy) return { kind: 'local', output: 'Advisor note was not submitted: wait for the active turn to settle.' };
      const applied = runtime.apply(parsed.args[0]!);
      return { kind: 'prompt', prompt: applied.prompt, notice: 'Advisor note submitted through the ordinary prompt path; permissions still apply.',
        promptMetadata: { source: 'advisor-application', noteId: applied.noteId, checkpointDigest: applied.checkpointDigest } };
    }
    if (action === 'review') {
      if (busy) return { kind: 'local', output: 'Advisor review was not sent: wait for the active turn to settle.' };
      return { kind: 'local', output: showAdvisor(await runtime.reviewLatest()) };
    }
    return { kind: 'local', output: showAdvisor(runtime.view(), action === 'dump') };
  } catch { return { kind: 'local', output: 'Advisor action refused or unverified. Inspect /advisor status; no advice was applied.' }; }
}
function numeric(value: string | true | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))
    || Number(value) < min || Number(value) > max) throw new Error('Invalid advisor numeric option.');
  return Number(value);
}
