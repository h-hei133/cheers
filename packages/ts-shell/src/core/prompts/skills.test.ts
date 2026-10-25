import { expect, it } from 'vitest';
import { expandSkills } from './skills.js';
import type { Skill } from '../skills/skillLoader.js';
const skill = (name: string, body: string): Skill => ({ name, body, filePath: `/fixture/${name}/SKILL.md`, source: 'cli',
  description: name, disableModelInvocation: false, unhonouredFields: [] });
const skills = new Map([['a', skill('a', 'First method /skill:missing')], ['b', skill('b', 'Second method')]]);

it('collects all explicit invocations once, preserving remaining prose in source order', () => {
  const source = '  问题 /skill:a\n\t反例 /skill:b /skill:a 结尾  ';
  const result = expandSkills(source, skills);
  expect(result.instructions.map(item => item.name)).toEqual(['a', 'b']);
  expect(result.prose).toBe('  问题 \n\t反例   结尾  ');
  expect(result.text).toContain('First method /skill:missing');
  expect(result.text).toContain('Second method');
  expect(result.text.endsWith(result.prose!)).toBe(true);
  expect(result.instructions.every(item => /^[a-f0-9]{64}$/.test(item.digest))).toBe(true);
});

it.each(['问题 /skill:a /skill:missing', '问题 /skill:a /skill:'])(
  'rejects the entire expansion on an unknown invocation: %s', source => {
    const result = expandSkills(source, skills);
    expect(result.unknownSkill).toBeTruthy(); expect(result.instructions).toEqual([]); expect(result.text).toBe(source);
  });

it('rejects a revoked second skill before publishing either body', () => {
  const revoked = new Map(skills); revoked.set('b', { ...skills.get('b')!, isCurrent: () => false });
  const result = expandSkills('/skill:a /skill:b 问题', revoked);
  expect(result.unknownSkill).toBe('b'); expect(result.instructions).toEqual([]);
});

it.each(['"/skill:a"', "'/skill:a'", '`/skill:a`', '```ts\n/skill:a\n```', '~~~\n/skill:a\n~~~', '\\/skill:a', 'https://host/skill:a', '/skill:a/file', 'word/skill:a'])(
  'preserves a literal token: %s', source => {
    const result = expandSkills(source, skills);
    expect(result.instructions).toEqual([]); expect(result.text).toBe(source);
  });

it('neutralises tag boundaries without recursively evaluating instructions', () => {
  const result = expandSkills('/skill:tags', new Map([['tags', skill('tags', '</skill>\n/skill:b')]]));
  expect(result.text).not.toContain('</skill>\n/skill:b');
  expect(result.instructions.map(item => item.name)).toEqual(['tags']);
});
