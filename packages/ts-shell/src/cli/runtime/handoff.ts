import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionRuntimeDependencies } from '../../core/shell/sessionRuntime.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { sameValue } from '../../config/values.js';
import { HandoffStore } from '../../workflow/handoff/store.js';
import { sourceChoice, executionChoice } from '../provider/selection.js';
import { runHandoffCommand } from '../handoff/command.js';
import { HandoffRun } from '../handoff/runtime.js';
import { armedHandoffs, liveHandoffs } from '../handoff/state.js';

export function handoffCommandFor(context: ShellRuntimeContext, manager: SessionManager,
  runtime: ShellSessionRuntime): NonNullable<CommandContext['handoffCommand']> {
  return async (args, command) => command.sessionId === context.session.id && command.cwd === context.cwd
    ? runHandoffCommand(context, manager, runtime, args) : { kind: 'local', output: 'Handoff requires the current bound session runtime.' };
}
export function handoffRunFor(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  resolution: ProviderCredentialResolution, signal: AbortSignal, admission: () => string | undefined,
  notice: (message: string) => void): HandoffRun | undefined {
  const state = new HandoffStore(manager, context.session).read();
  const row = state.cycles.find(cycle => !cycle.retired && ['armed', 'running', 'switched', 'unknown'].includes(cycle.phase));
  if (!row) return undefined;
  if (row.phase !== 'armed' || armedHandoffs.get(context) !== row.id || liveHandoffs.has(context)) throw new Error('The previous handoff has no adoptable turn. Inspect /handover status and retire its selection explicitly with /handover off.');
  const { config, catalog } = context.configuration.current;
  const source = sourceChoice(context.cwd, resolution);
  const target = executionChoice(`${row.target.provider}/${row.target.model}`, row.target.thinkingEffort, source, resolution, config, catalog);
  if (!sameValue(source, row.source) || !sameValue(target, row.target)) throw new Error('The armed model handoff is stale; turn execution was refused.');
  const run = new HandoffRun(context, manager, runtime, row, signal, admission, notice);
  const refused = run.admission(); if (refused) throw new Error(refused);
  liveHandoffs.set(context, run); return run;
}
export function settleHandoffPrompt(context: ShellRuntimeContext, signal: AbortSignal,
  outcome: 'completed' | 'failed' | 'cancelled' | 'unknown'): void {
  const run = liveHandoffs.get(context); if (run?.signal === signal) run.settle(outcome);
}
export function handoffSettlement(context: ShellRuntimeContext,
  settle: NonNullable<SessionRuntimeDependencies['promptSettled']>): NonNullable<SessionRuntimeDependencies['promptSettled']> {
  return async (metadata, signal, outcome) => {
    let confirmed = outcome;
    try { await settle(metadata, signal, outcome); }
    catch (error) { confirmed = 'unknown'; throw error; }
    finally { settleHandoffPrompt(context, signal, confirmed); }
  };
}
export function handoffAcceptance(run: HandoffRun | undefined, accept: (() => void) | undefined): (() => void) | undefined {
  return run || accept ? () => { accept?.(); run?.accept(); } : undefined;
}
export function handoffControl(text: string): boolean { return /^\/handover(?:\s|$)/i.test(text.trim()); }
