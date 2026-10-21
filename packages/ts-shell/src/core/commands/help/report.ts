import type { CommandDefinition } from '../types.js';
import { commandInvocations } from '../invocation.js';
import { reportMetadata } from '../report/metadata.js';
import { createReport, span } from '../report/projection.js';
import type { ReportLine } from '../report/contract.js';

type GuideCommand = Pick<CommandDefinition, 'name' | 'aliases' | 'invocations' | 'group' | 'summary' | 'argumentHint' | 'supportsNonInteractive'>;

const groups: Record<CommandDefinition['group'], string> = {
  session: 'Session', context: 'Context', workspace: 'Workspace', workflow: 'Workflow', diagnostics: 'Diagnostics',
};

/** Raw IDs stay local to selection; every visible field is a detached projection. */
export function guideRows(commands: readonly GuideCommand[], projectRoot: string) {
  return commands.flatMap(command => {
    const invocations = commandInvocations(command);
    const aliases = invocations.filter(item => item.kind === 'alias').map(item => `/${reportMetadata(item.name, projectRoot)}`).join(' ');
    const mode = command.supportsNonInteractive === undefined ? 'registered'
      : command.supportsNonInteractive ? 'interactive + print' : 'interactive';
    return invocations.filter(item => item.kind !== 'alias').map(item => {
      const label = `/${reportMetadata(item.name, projectRoot)}`;
      const disabled = label !== item.invocation || !/^\/(?:[a-z0-9][a-z0-9:._-]*|\?)$/.test(item.invocation);
      return { id: item.invocation, label, labelRole: 'command' as const, group: item.group,
        detail: reportMetadata(`${item.summary}${item.argumentHint ? ` ${item.argumentHint}` : ''}`, projectRoot),
        note: `${item.group} · ${mode}${disabled ? ' · name cannot be inserted safely' : ''}`,
        searchText: item.kind === 'command' ? aliases : undefined, disabled };
    });
  });
}

export function helpReport(commands: readonly GuideCommand[], projectRoot: string) {
  const rows = guideRows(commands, projectRoot), lines: ReportLine[] = [];
  for (const [group, title] of Object.entries(groups)) {
    const members = rows.filter(row => row.group === group);
    if (!members.length) continue;
    lines.push({ kind: 'space' }, { kind: 'heading', spans: [span(title, 'heading')] });
    for (const row of members) lines.push({ kind: 'text', spans: [span(row.label, 'command'), span(`  ${row.detail}`)] });
  }
  lines.push({ kind: 'space' }, { kind: 'heading', spans: [span('Keys', 'heading')] });
  for (const [key, description] of [['shift+tab', 'switch between planning and building'],
    ['alt+p', 'cycle how much a turn may do without asking'], ['ctrl+j', 'insert a newline without sending'],
    ['/hotkey', 'every key, and which ones this terminal delivers']] as const) {
    lines.push({ kind: 'text', spans: [span(key, 'key'), span(`  ${description}`)] });
  }
  return createReport({ title: 'Slash commands', lines, facts: { count: rows.length,
    commands: rows.map(row => ({ invocation: row.label, detail: row.detail, group: row.group, note: row.note, draftAvailable: !row.disabled })) } });
}
