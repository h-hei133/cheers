import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { handoffSyntax } from '../../core/commands/handoff/syntax.js';
import { parseEffortFlag } from '../../core/commands/model/preference.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { sameValue } from '../../config/values.js';
import { redactExportText } from '../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { HandoffStore } from '../../workflow/handoff/store.js';
import { executionChoice, sourceChoice } from './model.js';
import { armedHandoffs, liveHandoffs } from './state.js';

export async function runHandoffCommand(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  args: string[]): Promise<LocalCommandResult> {
  try {
    const parsed = parseSyntax(handoffSyntax, args);
    if (!parsed.ok) return { kind: 'local', output: `Invalid handoff arguments: ${parsed.reason}\n${syntaxHelp(handoffSyntax)}` };
    const store = new HandoffStore(manager, context.session); const state = store.read();
    if (parsed.action.name === 'status') {
      const live = liveHandoffs.get(context);
      return { kind: 'local', output: neutraliseForDisplay(redactExportText(JSON.stringify({ completionProof: false,
        cycles: state.cycles.map(row => ({ ...row, phase: ['running', 'switched'].includes(row.phase) && live?.id !== row.id ? 'unknown' : row.phase })) }, null, 2))) };
    }
    if (runtime.getCurrentRunController()) throw new Error('Wait for the current turn to settle; /cancel requests its ordinary cleanup.');
    const pending = state.cycles.find(row => !row.retired && ['armed', 'running', 'switched', 'unknown'].includes(row.phase));
    if (parsed.action.name === 'off') {
      if (!pending) return { kind: 'local', output: 'No pending model handoff selection.' };
      if (pending.phase === 'armed') store.change(pending, { phase: 'cancelled', endedAt: Date.now() });
      else store.change(pending, { phase: 'unknown', retired: true });
      armedHandoffs.delete(context);
      return { kind: 'local', output: pending.phase === 'armed' ? 'Pending handoff cancelled. Session model preferences are unchanged.'
        : 'Model selection retired. The earlier turn outcome remains unknown; inspection does not stop or replay it.' };
    }
    const publication = context.configuration.current;
    const resolution = context.resolveConfigTarget?.(publication.config);
    if (!resolution) throw new Error('The active provider binding is unavailable.');
    const source = sourceChoice(context.cwd, resolution);
    const target = executionChoice(parsed.args[0]!, parseEffortFlag(parsed.flags.get('effort')), source, resolution, publication.config, publication.catalog);
    if (sameValue(source, target)) return { kind: 'local', output: 'The selected model and effort already match; no handoff was armed.' };
    const directory = captureWorkspaceRoot(context.cwd, context.cwd, 'read');
    const row = store.arm(source, target, { path: directory.path, identity: directory.identity });
    armedHandoffs.set(context, row.id);
    return { kind: 'local', output: `Handoff ${row.id} armed for the next turn: ${source.model} → ${target.model}. After a nonempty checklist and an approved successful edit/write/patch, subsequent requests use the target. Each effect keeps its ordinary approval. The following turn uses your session model again.` };
  } catch (error) {
    return { kind: 'local', output: `Handoff refused or unverified: ${neutraliseForDisplay(redactExportText(error instanceof Error ? error.message : 'state unavailable'))}` };
  }
}
