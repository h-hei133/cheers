import { entitySyntax } from "./syntax/entity.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import { type Skill } from "../skills/skillLoader.js";
import { resolveSkillCatalog } from "../skills/skillCatalog.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { assertAdmission } from '../network/admission.js';
import { reportText } from './report/projection.js';
import { skillInstructions, skillLabel, skillsReport } from './skill/report.js';

export const skillSyntax = entitySyntax("skill");

/**
 * /skill — the instructions this project and this user have written down.
 *
 * Listing is the default because a skill is only useful if you can remember it
 * exists. Naming one returns its instructions, which the caller puts in front of
 * the next turn: a skill is a way of asking, not a thing that runs.
 */
export async function runSkillCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseSyntax(skillSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /skill arguments: ${parsed.reason}\n${syntaxHelp(skillSyntax)}` };
  return context.runCancellable
    ? context.runCancellable(signal => inspectSkill(parsed.args[0], { ...context,
      signal: context.signal ? AbortSignal.any([context.signal, signal]) : signal }))
    : inspectSkill(parsed.args[0], context);
}

async function inspectSkill(wanted: string | undefined, context: CommandContext): Promise<LocalCommandResult> {
  // The same catalog the prompt path and `/skill:` resolve through, so the list
  // read here is the list the model was given — a skill named with `--skill`
  // appears, and an untrusted project's skills do not.
  const skills = await readSkillCatalog(context);
  context.signal?.throwIfAborted();
  if (!wanted) {
    const report = skillsReport([...skills.values()], context.cwd);
    return { kind: 'local', output: reportText(report), report };
  }

  const skill = skills.get(wanted) ?? findLoosely(skills, wanted);
  if (!skill) {
    return {
      kind: "local",
      output: `No skill named \`${skillLabel(wanted, context.cwd)}\`. Run \`/skill\` to see what is available.`,
    };
  }
  return { kind: "local", output: skillInstructions(skill, context.cwd) };
}

/** Reuse original discovery, project trust, flags and contribution freshness. */
export async function readSkillCatalog(context: CommandContext, loadSignal?: AbortSignal) {
  const signal = context.signal && loadSignal ? AbortSignal.any([context.signal, loadSignal]) : context.signal ?? loadSignal;
  signal?.throwIfAborted();
  assertAdmission(context.admission);
  signal?.throwIfAborted();
  const { skills } = await resolveSkillCatalog({ workspaceRoot: context.cwd, sessionId: context.sessionId,
    ...(context.skillOptions?.skillPaths ? { skillPaths: context.skillOptions.skillPaths } : {}),
    ...(context.skillOptions?.noSkills ? { noSkills: true } : {}),
    ...(signal ? { abortSignal: signal } : {}),
  });
  signal?.throwIfAborted();
  assertAdmission(context.admission);
  signal?.throwIfAborted();
  return skills;
}

/** Case-insensitive match, so a name read off a table can be typed as read. */
function findLoosely(skills: ReadonlyMap<string, Skill>, wanted: string): Skill | undefined {
  const lowered = wanted.toLowerCase();
  for (const skill of skills.values()) {
    if (skill.name.toLowerCase() === lowered) return skill;
  }
  return undefined;
}
