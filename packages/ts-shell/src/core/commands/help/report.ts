import type { CommandDefinition } from '../types.js';
import { commandInvocations } from '../invocation.js';
import { reportMetadata } from '../report/metadata.js';
import { span } from '../report/projection.js';
import { boundedReport } from '../report/window.js';
import type { ReportLine } from '../report/contract.js';

type GuideCommand = Pick<CommandDefinition, 'name' | 'aliases' | 'invocations' | 'group' | 'summary' | 'argumentHint' | 'supportsNonInteractive'>;

export const COMMAND_GROUPS: Readonly<Record<CommandDefinition['group'], string>> = {
  session: 'Session', context: 'Context', workspace: 'Workspace', workflow: 'Workflow', diagnostics: 'Diagnostics',
};
const HELP_ROWS = 200;

/** Reports reserve rows before metadata projection; pickers retain their full inventory. */
export function guideRows(commands: readonly GuideCommand[], projectRoot: string, limit = Infinity) {
  let remaining = limit;
  return commands.flatMap(command => {
    if (remaining <= 0) return [];
    const invocations = commandInvocations(command);
    const aliases = invocations.filter(item => item.kind === 'alias').map(item => `/${reportMetadata(item.name, projectRoot)}`).join(' ');
    const mode = command.supportsNonInteractive === undefined ? 'registered'
      : command.supportsNonInteractive ? 'interactive + print' : 'interactive';
    const shown = invocations.filter(item => item.kind !== 'alias').slice(0, remaining);
    remaining -= shown.length;
    return shown.map(item => {
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
  const totalRows = commands.reduce((total, command) =>
    total + commandInvocations(command).filter(item => item.kind !== 'alias').length, 0);
  const candidates = guideRows(commands.slice(0, HELP_ROWS), projectRoot, HELP_ROWS);
  return boundedReport(candidates, rows => {
    const omitted = totalRows - rows.length;
    const lines: ReportLine[] = [];
    for (const [group, title] of Object.entries(COMMAND_GROUPS)) {
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
    if (omitted > 0) lines.push({ kind: 'text', spans: [span(`${omitted} commands omitted from this bounded report.`, 'muted')] });
    return { title: 'Slash commands', lines, facts: { count: totalRows, total: totalRows,
      shown: rows.length, omitted, coverage: omitted > 0 ? 'partial' : 'complete',
      commands: rows.map(row => ({ invocation: row.label, detail: row.detail, group: row.group, note: row.note, draftAvailable: !row.disabled })) } };
  });
}
