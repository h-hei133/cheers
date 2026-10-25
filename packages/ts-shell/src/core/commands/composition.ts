import { resolveSkillCatalog } from '../skills/skillCatalog.js';
import { expandSkills, skillBlock } from '../prompts/skills.js';
import { compositionPlan } from './composition/plan.js';
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
    const expanded = expandSkills(input, catalog?.skills ?? new Map(), plan.skills);
    if (expanded.unknownSkill) return blocked(`Unknown skill: ${expanded.unknownSkill}. No skill named ${expanded.unknownSkill}. Run /skill to see what is available. ${catalog?.skills.size ? `Available: ${[...catalog.skills.keys()].sort().map(name => `/skill:${name}`).join(', ')}` : 'No skills are installed.'}`);
    const modifiers: Array<{ name: string; instruction: string }> = [];
    let driver: { method: typeof plan.methods[number]; args: readonly string[] } | undefined;
    for (const method of plan.methods) {
      if (context.interactive === false && method.definition.supportsNonInteractive !== true) return blocked(`/${method.invocation.name} cannot be composed in this host.`);
      const prepared = method.invocation.composition!.prepare(method.args, plan.prose);
      if ('error' in prepared) return blocked(prepared.error);
      if ('instruction' in prepared) modifiers.push({ name: method.invocation.name, instruction: prepared.instruction });
      else driver = { method, args: prepared.args };
    }
    const refusal = context.admission?.();
    catalog?.verify?.();
    const methodSize = expanded.instructions.reduce((size, skill) => size + skill.body.length, 0) + modifiers.reduce((size, method) => size + method.instruction.length, 0);
    if (expanded.instructions.length > 16 || modifiers.length > 16 || methodSize > 65536 || input.length > 32768) return blocked('Composed methods exceed the input budget; no method was truncated or submitted.');
    if (refusal || revision !== context.readConfiguration?.().revision) return blocked(refusal ?? 'Configuration changed during composition.');
    if (expanded.instructions.some(skill => catalog?.skills.get(skill.name)?.isCurrent?.() === false)) return blocked('A selected skill was revoked during composition.');
    signal?.throwIfAborted();
    const metadata = { originalInput: input, skillInvocations: plan.skills.map(token => ({ from: token.from, to: token.to, name: token.raw.slice('/skill:'.length) })),
      skills: expanded.instructions.map(({ body: _body, ...identity }) => identity), methods: plan.methods.map(method => ({ name: method.invocation.name, from: method.token.from, to: method.token.to })) };
    if (driver) {
      dispatched = true;
      const result = await driver.method.definition.execute([...driver.args], { ...context, signal,
        rawCommandName: driver.method.invocation.name, composedPrompt: { originalInput: input, prose: plan.prose, skills: expanded.instructions, modifiers } });
      if (result.kind === 'shell-action') throw new Error('A composed workflow returned an unsupported shell action; its dispatch outcome requires inspection.');
      return result.kind === 'prompt' ? { ...result, promptMetadata: { ...result.promptMetadata, ...metadata } }
        : { ...result, ...(result.kind === 'local' ? { retryDraft: input } : {}) };
    }
    const blocks = [...expanded.instructions.map(skillBlock), ...modifiers.map(method => method.instruction)];
    const prose = plan.methods.length ? plan.prose : expanded.prose ?? plan.prose;
    return { kind: 'prompt', prompt: blocks.join('\n\n') + (prose.trim() ? `\n\n${prose}` : ''),
      notice: `Prepared ${expanded.instructions.length + modifiers.length} methods for one task.`, promptMetadata: metadata };
  };
  try { return context.runCancellable ? await context.runCancellable(prepare) : await prepare(context.signal); }
  catch (error) {
    if (context.signal?.aborted || dispatched) throw error;
    return blocked('Composition preparation was cancelled or unavailable; retry the original draft.');
  }
}
