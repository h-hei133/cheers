import { runSkillCommand } from "../../../core/commands/skillCommandRuntime.js";
import { SkillLoader, type Skill } from "../../../core/skills/skillLoader.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Skill chooser.
 *
 * Choosing a skill puts its instructions in the transcript and starts the prompt
 * with the skill named, because a skill on its own is not a request — it is how
 * you want the next request answered. The user still says what to do with it.
 */
export function skillPicker(context: CommandContext): Picker {
  let skills: readonly Skill[] = [];
  return {
    title: "Skills",
    form: "panel",
    empty: "No skills found. Put a SKILL.md under .agents/skills/<name>/ to add one.",
    async load(): Promise<readonly Option[]> {
      skills = [...new SkillLoader(context.cwd).load().values()];
      return skills.map<Option>((skill) => ({
        id: skill.name,
        label: skill.name,
        detail: skill.description || "no description",
        note: skill.source,
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (!chosen) return undefined;
      const result = await runSkillCommand([chosen], context);
      return { note: result.output, draft: `/skill ${chosen} ` };
    },
  };
}
