import { readSkillCatalog } from "../../../core/commands/skillCommandRuntime.js";
import { skillDraft, skillInstructions, skillLabel } from '../../../core/commands/skill/report.js';
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

const SKILL_INSPECTION_TIMEOUT_MS = 30_000;

/**
 * Skill chooser.
 *
 * Choosing a skill puts its instructions in the transcript and starts the prompt
 * with the skill named, because a skill on its own is not a request — it is how
 * you want the next request answered. The user still says what to do with it.
 */
export function skillPicker(context: CommandContext): Picker {
  let offered = new Set<string>();
  const isCurrent = (): boolean => {
    try { return !context.signal?.aborted && context.admission?.() === undefined; } catch { return false; }
  };
  const unavailable = 'Skill catalog unavailable. Reopen /skill to retry.';
  return {
    isCurrent,
    title: "Skills",
    form: "panel",
    holdInput: true,
    status: () => isCurrent() ? undefined : 'Session or configuration changed. Reopen /skill.',
    footer: 'Enter to read · Esc to close',
    loadError: unavailable,
    empty: "No skills found. Put a SKILL.md under .agents/skills/<name>/ to add one.",
    async load(signal?: AbortSignal): Promise<readonly Option[]> {
      offered.clear();
      const skills = [...(await readSkillCatalog(context, signal)).values()];
      offered = new Set(skills.map(skill => skill.name));
      return skills.map<Option>((skill) => ({
        id: skill.name,
        label: skillLabel(skill.name, context.cwd),
        detail: skillLabel(skill.description, context.cwd, 4096) || "no description",
        note: skill.source,
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (ids.length !== 1 || !chosen || !offered.has(chosen) || !isCurrent()) return undefined;
      offered.clear();
      try {
        const skill = (await readSkillCatalog(context, AbortSignal.timeout(SKILL_INSPECTION_TIMEOUT_MS))).get(chosen);
        if (!isCurrent()) return undefined;
        if (!skill) return { note: 'This skill is no longer available. Reopen /skill to refresh.' };
        const draft = skillDraft(skill.name, context.cwd);
        return { note: skillInstructions(skill, context.cwd) + (draft ? '' : '\n\nNo draft was inserted because this skill name cannot be displayed unchanged.'),
          ...(draft ? { draft } : {}) };
      } catch { return isCurrent() ? { note: unavailable } : undefined; }
    },
  };
}
