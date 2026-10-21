import type { Skill } from '../../skills/skillLoader.js';
import { createReport, span } from '../report/projection.js';
import { reportMetadata } from '../report/metadata.js';

/** Only metadata is a report; the selected instruction body retains its meaning. */
export function skillLabel(value: string, projectRoot: string, maxLength = 240, preserveLines = false): string {
  return reportMetadata(value, projectRoot, maxLength, preserveLines);
}

export function skillsReport(skills: readonly Skill[], projectRoot: string) {
  const items = skills.map(skill => ({ name: skillLabel(skill.name, projectRoot), source: skill.source,
    description: skillLabel(skill.description, projectRoot, 4096) || '—' }));
  return createReport({ title: 'Skills',
    columns: [{ label: 'Skill', minWidth: 14 }, { label: 'From', minWidth: 8 }, { label: 'What it is for', minWidth: 24 }],
    lines: items.length ? [...items.map(item => ({ kind: 'columns' as const,
      cells: [[span(item.name)], [span(item.source)], [span(item.description)]] })),
    { kind: 'space' }, { kind: 'text', spans: [span('/skill <name>', 'command'), span(' reads one out.')] }]
      : [{ kind: 'text', spans: [span('None found.')] }, { kind: 'space' },
        { kind: 'text', spans: [span('Put a SKILL.md under ~/.cheers/skills/<name>/ or .agents/skills/<name>/ to add one.')] }],
    facts: { count: items.length, skills: items },
  });
}

/** Preserve the body verbatim: reading a skill is an explicit request for instructions. */
export function skillInstructions(skill: Skill, projectRoot: string): string {
  const lines = [`### ${skillLabel(skill.name, projectRoot)}`, ''];
  if (skill.description) lines.push(skillLabel(skill.description, projectRoot, 4096, true), '');
  lines.push(skill.body);
  return lines.join('\n');
}

/** Quote with the existing command grammar; never insert a redacted alias as an identifier. */
export function skillDraft(name: string, projectRoot: string): string | undefined {
  if (skillLabel(name, projectRoot) !== name || /[\x00-\x1f\x7f-\x9f]/.test(name)) return undefined;
  const argument = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name) ? name : `'${name.replaceAll("'", "'\\''")}'`;
  return `/skill ${name.startsWith('-') ? '-- ' : ''}${argument} `;
}
