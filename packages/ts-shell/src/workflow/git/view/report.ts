import { createReport, span, reportText } from '../../../core/commands/report/projection.js';
import type { CommandReport, ReportLine } from '../../../core/commands/report/contract.js';
import type { GitDiff, GitSnapshot } from '../read/model.js';

export function gitStatusReport(snapshot: GitSnapshot): CommandReport {
  return createReport({ title: 'Git workbench', columns: [{ label: 'Index', minWidth: 6 }, { label: 'Worktree', minWidth: 8 }, { label: 'Path', minWidth: 24 }],
    facts: { source: 'native-git', root: snapshot.root, head: snapshot.head, branch: snapshot.branch, fingerprint: snapshot.fingerprint,
      status: snapshot.unreadablePaths?.length ? 'limited' : snapshot.files.length ? 'changed' : 'clean', unreadablePaths: snapshot.unreadablePaths ?? [], files: snapshot.files.map(file => ({ ...file })) },
    lines: [{ kind: 'text', spans: [span(`${snapshot.branch} · ${snapshot.head ?? 'unborn HEAD'}`)] },
      { kind: 'text', spans: [span(`Snapshot ${snapshot.fingerprint}`)] },
      ...(snapshot.unreadablePaths?.length ? [{ kind: 'text' as const, spans: [span(`Native metadata/status only for ${snapshot.unreadablePaths.map(name => JSON.stringify(name)).join(', ')}. Their source bytes were not read or verified.`, 'warning')] }] : []),
      ...snapshot.files.map(file => ({ kind: 'columns' as const, cells: [[span(file.index)], [span(file.worktree)], [span(`${file.originalPath ? `${JSON.stringify(file.originalPath)} → ` : ''}${JSON.stringify(file.path)}${file.conflict ? ' [conflict]' : ''}${file.submodule ? ' [submodule]' : ''}`)]] })),
      { kind: 'text', spans: [span(snapshot.files.length ? 'Choose a file or hunk; each write has its own native approval.' : snapshot.unreadablePaths?.length ? 'Native status reported no changes; protected worktree bytes were not verified.' : 'Working tree and index clean at this snapshot.')] },
      { kind: 'text', spans: [span(`Branches: ${snapshot.branches.map(branch => JSON.stringify(branch)).join(', ') || '(none)'}`)] },
      { kind: 'text', spans: [span('/git diff <area> <path> · stage/unstage <path> [hunkId] · commit <message> · branch create|switch|delete <name> · review · goal · push <remote> <refs/heads/branch> · /wt')] }] });
}
export function gitDiffReport(diff: GitDiff): CommandReport {
  const oldVersion = diff.area === 'staged' ? diff.snapshot.head ?? '(empty tree)' : diff.area === 'untracked' ? '(empty)' : 'index';
  const newVersion = diff.area === 'staged' ? 'index' : 'worktree';
  let oldLine = 0; let newLine = 0;
  const lines: ReportLine[] = [{ kind: 'text', spans: [span(`Snapshot ${diff.snapshot.fingerprint}; ${oldVersion} → ${newVersion}`)] }];
  for (const row of diff.text.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); lines.push({ kind: 'heading', spans: [span(row)] }); continue; }
    if (!oldLine && !newLine || ![' ', '+', '-'].includes(row[0] ?? '') || row.startsWith('+++') || row.startsWith('---')) {
      lines.push({ kind: 'text', spans: [span(row, 'code')] }); continue;
    }
    const old = row.startsWith('+') ? '' : `${oldLine++} ${row.slice(1)}`;
    const next = row.startsWith('-') ? '' : `${newLine++} ${row.slice(1)}`;
    lines.push({ kind: 'columns', cells: [[span(old, row.startsWith('-') ? 'warning' : 'code')], [span(next, row.startsWith('+') ? 'success' : 'code')]] });
  }
  lines.push(...diff.hunks.map(hunk => ({ kind: 'text' as const, spans: [span(`Hunk ${hunk.id}: ${hunk.header}; old ${hunk.oldStart}, new ${hunk.newStart}`)] })));
  if (diff.hunkReason) lines.push({ kind: 'text', spans: [span(diff.hunkReason, 'warning')] });
  return createReport({ title: `${diff.area} ${JSON.stringify(diff.path)}`, columns: [{ label: oldVersion, minWidth: 30 }, { label: newVersion, minWidth: 30 }], lines,
    facts: { source: 'native-git', path: diff.path, area: diff.area, fingerprint: diff.snapshot.fingerprint, head: diff.snapshot.head,
      binary: diff.binary, truncated: diff.limited, hunks: diff.hunks.map(hunk => ({ id: hunk.id, oldStart: hunk.oldStart, newStart: hunk.newStart })) } });
}
export function gitReportResult(report: CommandReport) { return { kind: 'local' as const, output: reportText(report), report }; }
