import type { CommandContext, CommandExecutionResult } from '../core/commands/types.js';
import { parseResearchArgs, researchSyntax } from '../core/commands/research/syntax.js';
import { syntaxHelp } from '../core/commands/syntax/projection.js';
import type { ResearchRuntime } from './run/runtime.js';
import type { ResearchRun } from './run/model.js';
import { researchEntryRequest, researchTurnPrompt } from './run/entry.js';
import type { ResearchRequest } from './brief/model.js';
import type { ResearchReservationAdmission } from './run/reservation.js';

export async function runResearchCommand(args: readonly string[], context: CommandContext, runtime: ResearchRuntime, busy: boolean,
  reservation?: (request: ResearchRequest, signal?: AbortSignal) => ResearchReservationAdmission | undefined | Promise<ResearchReservationAdmission | undefined>): Promise<CommandExecutionResult> {
  const parsed = parseResearchArgs(args);
  if (!parsed.ok || parsed.flags.has('help')) return { kind: 'local', output: `${!parsed.ok ? `Invalid research arguments: ${parsed.reason}\n` : ''}${syntaxHelp(researchSyntax)}` };
  const action = parsed.action.name;
  if (action && [...parsed.flags.keys()].some(flag => flag !== 'help')) return { kind: 'local', output: 'Research control actions do not accept investigation options.' };
  const retryDraft = context.rawCommandInput ?? context.composedPrompt?.originalInput;
  try {
    context.signal?.throwIfAborted();
    if (context.sessionId !== runtime.host.current().id || context.projectRoot !== runtime.host.current().projectRoot) throw new Error('Research command session or workspace changed.');
    if (action === 'dump') return { kind: 'local', output: runtime.snapshot() };
    if (action === 'status') return { kind: 'local', output: showResearch(runtime.current()) };
    if (action === 'pause') return { kind: 'local', output: showResearch(runtime.pause()) };
    if (action === 'reconcile') return { kind: 'local', output: showResearch(runtime.discard()) };
    if (busy) return { kind: 'local', output: 'Research was not submitted: wait for the active turn to settle.',
      ...(retryDraft ? { retryDraft } : {}) };
    const request = action ? undefined : researchEntryRequest(parsed, context.composedPrompt);
    const reserved = request && reservation ? await reservation(request, context.signal) : undefined;
    context.signal?.throwIfAborted();
    const run = action === 'resume' ? runtime.resume() : action === 'steer' ? runtime.steer(parsed.args.join(' '))
      : runtime.create(request!, reserved?.reservation);
    reserved?.commit();
    return { kind: 'prompt', prompt: researchTurnPrompt(run), notice: `Research ${run.id} armed; ordinary model, tool and permission gates apply.`,
      promptMetadata: { source: 'deep-research', researchRunId: run.id, researchEpoch: run.epoch } };
  } catch (error) {
    if (context.signal?.aborted) throw error;
    return { kind: 'local', output: `Research action refused: ${error instanceof Error ? error.message : 'state unavailable'}`,
      ...(retryDraft ? { retryDraft } : {}) };
  }
}

export function showResearch(run: ResearchRun | undefined): string {
  return run ? `Research ${run.id}: ${run.status}; stage ${run.stage}; brief revision ${run.briefRevision}; deadline ${run.deadlineAt}.\nSources ${run.sources.length}; claims ${run.claims.length}; fragments ${run.fragments.length}; review ${run.review?.status ?? 'not-run'}; save ${run.save.status}.\n${run.save.status === 'unknown' || run.save.status === 'pending' && run.save.path ? 'Report file outcome is unconfirmed; inspect the original edit operation. Save replay is refused.\n' : ''}${run.pending ? 'Child outcome pending; new work is fenced.\n' : ''}${run.stopReason ?? ''}`.trim()
    : 'No research run is bound to this session.';
}
