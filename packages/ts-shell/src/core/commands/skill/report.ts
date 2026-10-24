import type { Skill } from '../../skills/skillLoader.js';
import { displayReportText, span } from '../report/projection.js';
import { boundedReport } from '../report/window.js';
import { reportMetadata } from '../report/metadata.js';

const SKILL_ROWS = 200;
const SKILL_DESCRIPTION_CHARS = 2_048;
const SKILL_FACT_DESCRIPTION_CHARS = 512;

/** Only metadata is a report; the selected instruction body retains its meaning. */
export function skillLabel(value: string, projectRoot: string, maxLength = 240, preserveLines = false): string {
  return reportMetadata(value, projectRoot, maxLength, preserveLines);
}

export function skillsReport(skills: readonly Skill[], projectRoot: string) {
  const shown = skills.slice(0, SKILL_ROWS);
  const candidates = shown.map(skill => {
    const description = skillLabel(skill.description, projectRoot, SKILL_DESCRIPTION_CHARS) || '—';
    return { name: skillLabel(skill.name, projectRoot), source: skill.source, description,
      factDescription: skillLabel(skill.description, projectRoot, SKILL_FACT_DESCRIPTION_CHARS) || '—',
      descriptionOmittedBytes: skill.description.length > SKILL_DESCRIPTION_CHARS
        ? Math.max(0, Buffer.byteLength(skill.description, 'utf8') - Buffer.byteLength(description, 'utf8')) : 0 };
  });
  return boundedReport(candidates, items => {
    const omitted = skills.length - items.length;
    return { title: 'Skills',
      columns: [{ label: 'Skill', minWidth: 14 }, { label: 'From', minWidth: 8 }, { label: 'What it is for', minWidth: 24 }],
      lines: skills.length ? [...items.map(item => ({ kind: 'columns' as const,
        cells: [[span(item.name)], [span(item.source)], [span(item.description)]] })),
      ...(omitted > 0 ? [{ kind: 'text' as const, spans: [span(`${omitted} skills omitted from this bounded report.`, 'muted')] }] : []),
      { kind: 'space' }, { kind: 'text', spans: [span('/skill <name>', 'command'), span(' reads one out.')] }]
        : [{ kind: 'text', spans: [span('None found.')] }, { kind: 'space' },
          { kind: 'text', spans: [span('Put a SKILL.md under ~/.cheers/skills/<name>/ or .agents/skills/<name>/ to add one.')] }],
      facts: { count: skills.length, total: skills.length, shown: items.length, omitted,
        coverage: omitted > 0 ? 'partial' : 'complete',
        skills: items.map(item => ({ name: item.name, source: item.source, description: item.factDescription,
          descriptionOmittedBytes: item.descriptionOmittedBytes })) },
    };
  });
}

/** Preserve the body verbatim: reading a skill is an explicit request for instructions. */
export function skillInstructions(skill: Skill, projectRoot: string): string {
  const lines = [`### ${skillLabel(skill.name, projectRoot)}`, ''];
  if (skill.description) lines.push(skillLabel(skill.description, projectRoot, 4096, true), '');
  lines.push(displayReportText(skill.body));
  return lines.join('\n');
}

/** Quote with the existing command grammar; never insert a redacted alias as an identifier. */
export function skillDraft(name: string, projectRoot: string): string | undefined {
  if (skillLabel(name, projectRoot) !== name || /[\x00-\x1f\x7f-\x9f]/.test(name)) return undefined;
  const argument = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name) ? name : `'${name.replaceAll("'", "'\\''")}'`;
  return `/skill ${name.startsWith('-') ? '-- ' : ''}${argument} `;
}
