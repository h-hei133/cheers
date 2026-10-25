import { createHash } from 'node:crypto';
import type { Skill } from '../skills/skillLoader.js';
import { escapeAttribute, neutraliseTagBoundaries } from '../text/safety.js';
import { promptTokens, withoutPromptTokens, type PromptToken } from './tokens.js';

export interface SkillInstruction {
  readonly name: string;
  readonly identity: string;
  readonly source: Skill['source'];
  readonly digest: string;
  readonly body: string;
}

export function skillTokens(text: string): PromptToken[] {
  return promptTokens(text).filter(token => !token.literal && /^\/skill:[^\s/\\]*$/.test(token.raw));
}

export function skillBlock(skill: Pick<SkillInstruction, 'name' | 'body'>): string {
  return [`<skill name="${escapeAttribute(skill.name)}">`, neutraliseTagBoundaries(skill.body), '</skill>'].join('\n');
}

/** Validate the entire source before constructing any model input; never scan bodies. */
export function expandSkills(text: string, skills: ReadonlyMap<string, Skill>, tokens = skillTokens(text)) {
  const instructions: SkillInstruction[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const name = token.raw.slice('/skill:'.length);
    const skill = skills.get(name);
    if (!skill || skill.isCurrent?.() === false) return { text, unknownSkill: name || '(empty)', instructions: [], tokens };
    const identity = `${skill.source}:${skill.filePath}:${skill.name}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    instructions.push({ name: skill.name, identity, source: skill.source, body: skill.body,
      digest: createHash('sha256').update(skill.body).digest('hex') });
  }
  const body = withoutPromptTokens(text, tokens);
  // Preserve old single-opening shorthand; composed prose keeps its source separators.
  const prose = tokens.length === 1 && tokens[0]?.from === 0 ? body.trim() : body;
  const blocks = instructions.map(skillBlock).join('\n\n');
  return { text: blocks ? blocks + (prose.trim() ? `\n\n${prose}` : '') : text, prose, instructions, tokens };
}
