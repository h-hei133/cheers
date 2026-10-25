import { resolveSkillCatalog } from '../skills/skillCatalog.js';
import { compositionPlan } from './composition/plan.js';
import { prepareComposition } from './composition/prepare.js';
import type { CommandContext, CommandDefinition, CommandExecutionResult } from './types.js';

export function needsComposition(input: string, commands: readonly CommandDefinition[]): boolean {
  const plan = compositionPlan(input, commands);
  return plan.skills.length > 0 || plan.methods.some(method => method.token.from > 0) || plan.methods.length > 1 ||
    plan.methods.length > 0 && plan.disallowed.length > 0;
}

/** Pure preparation precedes a single dispatch; discovery and activation share declarations. */
export async function composePrompt(input: string, context: CommandContext, commands: readonly CommandDefinition[] = []): Promise<CommandExecutionResult | null> {
  const plan = compositionPlan(input, commands);
  if (!plan.skills.length && !plan.methods.some(method => method.token.from > 0) && plan.methods.length < 2 &&
    !(plan.methods.length && plan.disallowed.length)) return null;
  const blocked = (reason: string): CommandExecutionResult => ({ kind: 'local', retryDraft: input,
    output: `Result\n- Outcome: blocked\n- BlockerKind: command-not-allowlisted\n- Reason: ${reason}\n- DoNext: Run /skill or /help, then retry the original draft.` });
  if (plan.disallowed.length) return blocked(`${plan.disallowed.join(', ')} cannot be composed; use each separately or quote a literal reference.`);
  if (plan.methods.filter(method => method.invocation.composition?.kind === 'driver').length > 1) return blocked('Only one workflow driver can own a composed task.');
  const admission = context.admission?.();
  if (admission) return blocked(admission);
  const revision = context.readConfiguration?.().revision;
  let dispatched = false;
  const prepare = async (signal?: AbortSignal): Promise<CommandExecutionResult> => {
    signal?.throwIfAborted();
    const catalog = plan.skills.length ? await resolveSkillCatalog({ workspaceRoot: context.cwd, sessionId: context.sessionId,
      ...context.skillOptions, abortSignal: signal }) : undefined;
    signal?.throwIfAborted();
    const prepared = prepareComposition(input, plan, catalog?.skills ?? new Map(), context.interactive !== false);
    if (prepared.error !== undefined) return blocked(prepared.error);
    const { expanded, modifiers, driver, metadata } = prepared;
    const refusal = context.admission?.();
    catalog?.verify?.();
    if (refusal || revision !== context.readConfiguration?.().revision) return blocked(refusal ?? 'Configuration changed during composition.');
    if (expanded.instructions.some(skill => catalog?.skills.get(skill.name)?.isCurrent?.() === false)) return blocked('A selected skill was revoked during composition.');
    signal?.throwIfAborted();
    if (driver) {
      dispatched = true;
      const result = await driver.method.definition.execute([...driver.args], { ...context, signal,
        rawCommandName: driver.method.invocation.name, composedPrompt: { originalInput: input, prose: plan.prose, skills: expanded.instructions, modifiers } });
      if (result.kind === 'shell-action') throw new Error('A composed workflow returned an unsupported shell action; its dispatch outcome requires inspection.');
      return result.kind === 'prompt' ? { ...result, promptMetadata: { ...result.promptMetadata, ...metadata } }
        : { ...result, ...(result.kind === 'local' ? { retryDraft: input } : {}) };
    }
    return { kind: 'prompt', prompt: prepared.prompt,
      notice: `Prepared ${expanded.instructions.length + modifiers.length} methods for one task.`, promptMetadata: metadata };
  };
  try { return context.runCancellable ? await context.runCancellable(prepare) : await prepare(context.signal); }
  catch (error) {
    if (context.signal?.aborted || dispatched) throw error;
    return blocked('Composition preparation was cancelled or unavailable; retry the original draft.');
  }
}
