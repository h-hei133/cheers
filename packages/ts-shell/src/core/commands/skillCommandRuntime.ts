import { SkillLoader, type Skill } from "../skills/skillLoader.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

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
  const skills = new SkillLoader(context.cwd).load();
  const wanted = args[0]?.trim();
  if (!wanted) return { kind: "local", output: listSkills([...skills.values()]) };

  const skill = skills.get(wanted) ?? findLoosely(skills, wanted);
  if (!skill) {
    return {
      kind: "local",
      output: `No skill named \`${wanted}\`. Run \`/skill\` to see what is available.`,
    };
  }
  return { kind: "local", output: describeSkill(skill) };
}

/** Every skill as a table, or an explanation of where to put one. */
function listSkills(skills: readonly Skill[]): string {
  if (skills.length === 0) {
    return [
      "### Skills",
      "",
      "None found.",
      "",
      "A skill is a folder with a `SKILL.md` in it — frontmatter naming and describing it, then the instructions:",
      "",
      "- `~/.cheer/skills/<name>/SKILL.md` — yours, everywhere",
      "- `.agents/skills/<name>/SKILL.md` — this project's, and it wins",
    ].join("\n");
  }
  return [
    "### Skills",
    "",
    "| Skill | From | What it is for |",
    "| :--- | :--- | :--- |",
    ...skills.map((skill) => `| ${skill.name} | ${skill.source} | ${skill.description || "—"} |`),
    "",
    "`/skill <name>` reads one out.",
  ].join("\n");
}

function describeSkill(skill: Skill): string {
  const lines = [`### ${skill.name}`, ""];
  if (skill.description) lines.push(skill.description, "");
  lines.push(skill.body);
  return lines.join("\n");
}

/** Case-insensitive match, so a name read off a table can be typed as read. */
function findLoosely(skills: ReadonlyMap<string, Skill>, wanted: string): Skill | undefined {
  const lowered = wanted.toLowerCase();
  for (const skill of skills.values()) {
    if (skill.name.toLowerCase() === lowered) return skill;
  }
  return undefined;
}
