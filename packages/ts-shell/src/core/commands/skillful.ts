import { renderSkillList, type Skill } from '../skills/skillLoader.js';

/** Apply the session override to actual prompt content, preserving discovery. */
export function skillPrompt(skills: ReadonlyMap<string, Skill>, enabled: boolean | undefined): string {
  if (enabled === false) return '';
  return renderSkillList(skills);
}
