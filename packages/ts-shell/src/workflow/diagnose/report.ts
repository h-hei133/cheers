import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { needsUserEndpoint } from '../../core/providers/facts.js';
import type { CommandReport, ReportLine } from '../../core/commands/report/contract.js';
import { createReport, span } from '../../core/commands/report/projection.js';
import type { WorkflowGitDiagnostics } from '../gitContext.js';

export function diagnoseReport(config: RuntimeConfig, git: WorkflowGitDiagnostics, cwd: string): CommandReport {
  const providerConfig = summarizeProviderConfig(config);
  const next = nextAction(git);
  const lines: ReportLine[] = [
    { kind: 'text', spans: [span('Execution path: '), span('ts-local', 'code')] },
    { kind: 'text', spans: [span('Provider: '), span(config.provider, 'code')] },
    { kind: 'text', spans: [span('Active connection: '), span(config.activeProviderConnectionId ?? 'none')] },
    { kind: 'text', spans: [span('Provider config: '), span(providerConfig)] },
    { kind: 'text', spans: [span('Provider readiness: not checked by /diagnose.', 'warning')] },
    { kind: 'text', spans: [span('Provider next: '), span('/connect status', 'command'), span(' for saved config; '),
      span('npm run verify:provider-readiness', 'code'), span(' for live endpoint readiness.')] },
    { kind: 'text', spans: [span('Workspace: '), span(cwd, 'path')] },
    { kind: 'space' },
  ];
  if (!git.statusAvailable) {
    lines.push({ kind: 'text', spans: [span(git.insideGit ? 'Git status unavailable; the working tree has not been verified.'
      : 'Git: unavailable or not a repository; the working tree has not been verified.', 'warning')] });
  } else {
    lines.push(
      { kind: 'text', spans: [span('Branch: '), span(git.branch ?? 'unknown', 'code'), span(` (+${git.ahead}/-${git.behind})`, 'number')] },
      { kind: 'text', spans: [span('Change inventory: '), span(`staged ${git.stagedCount} | unstaged ${git.unstagedCount} | untracked ${git.untrackedCount} | conflicted ${git.conflictedCount}`, 'number')] },
      { kind: 'text', spans: [span('Git root: '), span(git.root ?? 'unknown', 'path')] },
    );
    if (!git.entries.length) lines.push({ kind: 'text', spans: [span('Working tree is clean.', 'success')] });
    else {
      lines.push({ kind: 'heading', spans: [span(`Changed files (first ${git.entries.length}; counts include all changes)`)] });
      for (const entry of git.entries) lines.push({ kind: 'columns', cells: [
        [span(`${entry.indexStatus}${entry.workTreeStatus}`, entry.conflicted ? 'warning' : 'code')], [span(entry.path, 'path')],
      ] });
      const directories = hotspotDirs(git.entries.map(entry => entry.path));
      lines.push({ kind: 'text', spans: [span('Hotspot directories (shown files): '), span(directories.join(', '), 'path')] });
    }
  }
  lines.push({ kind: 'space' }, { kind: 'text', spans: [span('Next: '), span(next)] });
  return createReport({ title: 'Repository diagnosis', columns: [{ label: 'Status', minWidth: 6 }, { label: 'Path', minWidth: 24 }], lines,
    facts: { workspace: cwd, executionPath: 'ts-local', provider: config.provider,
      connectionId: config.activeProviderConnectionId ?? null, providerConfig, providerReadiness: 'not-checked',
      git: { status: git.statusAvailable ? 'reported' : 'unavailable', insideGit: git.insideGit ? true : null,
        root: git.root, branch: git.branch, ahead: git.statusAvailable ? git.ahead : null, behind: git.statusAvailable ? git.behind : null,
        staged: git.statusAvailable ? git.stagedCount : null, unstaged: git.statusAvailable ? git.unstagedCount : null,
        untracked: git.statusAvailable ? git.untrackedCount : null, conflicted: git.statusAvailable ? git.conflictedCount : null,
        clean: git.statusAvailable ? git.entries.length === 0 : null, entries: git.entries.map(entry => ({ ...entry })) }, nextAction: next },
  });
}

function nextAction(git: WorkflowGitDiagnostics): string {
  if (!git.statusAvailable) return 'Check Git availability and workspace access, then rerun /diagnose. Use /workspace attach <git-project-path> to switch projects.';
  if (git.conflictedCount) return 'Resolve merge conflicts first, then rerun /diagnose.';
  if (!git.entries.length) return 'Start a task directly (for example: "Implement ... and verify with ...").';
  if (git.stagedCount && !git.unstagedCount) return 'Staged changes detected; run targeted verification before commit.';
  return 'Ask for focused edit+verify on listed files (example: "Fix failing flow in <file> and run verification").';
}

/** Inspect presence and status only; no credential or endpoint values enter the report. */
function summarizeProviderConfig(config: RuntimeConfig): string {
  const activeId = config.activeProviderConnectionId;
  if (!activeId) return 'no active connection; run /connect login or /connect use';
  const connection = config.providerConnections.find(item => item.id === activeId);
  if (!connection) return 'active connection not found; run /connect status then /connect use <connection-id>';
  if (connection.status === 'pending') return 'connection setup pending; finish login/browser flow or rerun /connect login';
  if (connection.status === 'error') return 'connection setup error; rerun /connect login for this provider';
  if (connection.authType !== 'account-auth' && !connection.apiKey?.trim()) return 'credential missing; run /connect login <provider> --api-key <key>';
  if (needsUserEndpoint(connection.provider) && !connection.baseUrl?.trim()) return 'base URL missing; rerun /connect login with --base-url <url>';
  if (needsUserEndpoint(connection.provider) && !connection.model?.trim()) return 'model missing; run /model use <model-id> or rerun /connect login with --model <model>';
  return 'configured; live endpoint readiness not checked';
}

function hotspotDirs(paths: readonly string[]): string[] {
  const weights = new Map<string, number>();
  for (const file of paths) {
    const segments = file.split('/');
    const dir = segments.length > 1 ? segments.slice(0, -1).join('/') : '.';
    weights.set(dir, (weights.get(dir) ?? 0) + 1);
  }
  return [...weights].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([dir]) => dir);
}
