import type { Skill } from '../../skills/skillLoader.js';
import { expandSkills, skillBlock } from '../../prompts/skills.js';
import type { compositionPlan } from './plan.js';

/** Prepare one task without invoking a command handler or admitting a workflow. */
export function prepareComposition(input: string, plan: ReturnType<typeof compositionPlan>,
  skills: ReadonlyMap<string, Skill>, interactive = true) {
  if (plan.disallowed.length) return { error: `${plan.disallowed.join(', ')} cannot be composed; use each separately or quote a literal reference.` };
  if (plan.methods.filter(method => method.invocation.composition?.kind === 'driver').length > 1) {
    return { error: 'Only one workflow driver can own a composed task.' };
  }
  const expanded = expandSkills(input, skills, plan.skills);
  if (expanded.unknownSkill) return { error: `Unknown skill: ${expanded.unknownSkill}. No skill named ${expanded.unknownSkill}. Run /skill to see what is available. ${skills.size ? `Available: ${[...skills.keys()].sort().map(name => `/skill:${name}`).join(', ')}` : 'No skills are installed.'}` };
  const modifiers: Array<{ name: string; instruction: string }> = [];
  let driver: { method: typeof plan.methods[number]; args: readonly string[] } | undefined;
  for (const method of plan.methods) {
    if (!interactive && method.definition.supportsNonInteractive !== true) return { error: `/${method.invocation.name} cannot be composed in this host.` };
    const prepared = method.invocation.composition!.prepare(method.args, plan.prose);
    if ('error' in prepared) return { error: prepared.error };
    if ('instruction' in prepared) modifiers.push({ name: method.invocation.name, instruction: prepared.instruction });
    else driver = { method, args: prepared.args };
  }
  const methodSize = expanded.instructions.reduce((size, skill) => size + skill.body.length, 0)
    + modifiers.reduce((size, method) => size + method.instruction.length, 0);
  if (expanded.instructions.length > 16 || modifiers.length > 16 || methodSize > 65536 || input.length > 32768) {
    return { error: 'Composed methods exceed the input budget; no method was truncated or submitted.' };
  }
  const metadata = { originalInput: input,
    skillInvocations: plan.skills.map(token => ({ from: token.from, to: token.to, name: token.raw.slice('/skill:'.length) })),
    skills: expanded.instructions.map(({ body: _body, ...identity }) => identity),
    methods: plan.methods.map(method => ({ name: method.invocation.name, from: method.token.from, to: method.token.to })) };
  const blocks = [...expanded.instructions.map(skillBlock), ...modifiers.map(method => method.instruction)];
  const prose = plan.methods.length ? plan.prose : expanded.prose ?? plan.prose;
  return { expanded, modifiers, driver, metadata,
    prompt: blocks.join('\n\n') + (prose.trim() ? `\n\n${prose}` : '') };
}
