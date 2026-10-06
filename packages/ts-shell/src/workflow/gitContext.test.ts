import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { getWorkflowGitContext, getWorkflowGitDiagnostics } from './gitContext.js';
import { runDiagnoseCommand, runWorkflowStatusCommand } from '../core/commands/localCommandRuntime.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { renderReport } from '../presentation/tui/report/renderer.js';
import { stripAnsi } from '../presentation/tui/text/ansi.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diagnosis-')); execFileSync('git', ['init', '-q', root]); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('detects repository git state in an isolated workspace', () => {
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-qm', 'initial'], { cwd: root });
  const context = getWorkflowGitContext(root);
  expect(context.insideGit).toBe(true); expect(context.branch).toBeTruthy(); expect(context.root).toBe(root);
});

it('counts the complete inventory before selecting files and preserves NUL-delimited rename destinations', () => {
  fs.writeFileSync(path.join(root, '## original'), 'content');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'initial'], { cwd: root });
  const target = ' name -> 世界\nwith tab\t ';
  fs.renameSync(path.join(root, '## original'), path.join(root, target));
  execFileSync('git', ['add', '-A'], { cwd: root });
  for (let index = 0; index < 16; index++) fs.writeFileSync(path.join(root, `file-${index}`), 'untracked');
  const limited = getWorkflowGitDiagnostics(root, { limit: 2 });
  expect(limited).toMatchObject({ statusAvailable: true, stagedCount: 1, untrackedCount: 16 });
  expect(limited.entries).toHaveLength(2);
  const all = getWorkflowGitDiagnostics(root);
  expect(all.entries.find(entry => entry.staged)?.path).toBe(target);
  expect(all.entries).toHaveLength(17);
});

it('keeps failed Git status unknown in diagnostics and workflow status', async () => {
  fs.writeFileSync(path.join(root, '.git/index'), 'invalid index');
  expect(getWorkflowGitDiagnostics(root)).toMatchObject({ insideGit: true, statusAvailable: false });
  const result = await runDiagnoseCommand({ cwd: root });
  expect(result.report?.facts.git).toMatchObject({ status: 'unavailable', clean: null, staged: null, unstaged: null });
  expect(result.output).toContain('working tree has not been verified');
  expect(result.output).not.toContain('Working tree is clean');
  expect((await runWorkflowStatusCommand({ cwd: root })).output).toContain('has not been verified');
});

it('keeps provider readiness unchecked and credentials out of semantic and narrow reports', async () => {
  const runtimeConfig = { ...getRuntimeConfig(root), activeProviderConnectionId: 'fixture', providerConnections: [{
    id: 'fixture', provider: 'openai' as const, authType: 'api-key' as const, apiKey: 'SYNTHETIC_PRIVATE_CREDENTIAL',
    baseUrl: 'https://private.invalid/SYNTHETIC_ENDPOINT', model: 'fixture', status: 'connected' as const,
    createdAt: 'now', updatedAt: 'now',
  }] };
  const result = await runDiagnoseCommand({ cwd: root, runtimeConfig });
  expect(result.report?.facts).toMatchObject({ connectionId: 'fixture', providerReadiness: 'not-checked', git: { clean: true } });
  expect(result.output).toContain('configured; live endpoint readiness not checked');
  const serialized = JSON.stringify(result.report);
  expect(serialized).not.toContain('SYNTHETIC_PRIVATE_CREDENTIAL'); expect(serialized).not.toContain('SYNTHETIC_ENDPOINT');
  expect(stripAnsi(renderReport(result.report!, 35).join('\n')).replace(/\s+/g, ' ')).toContain('Provider readiness: not checked');
  expect(Object.isFrozen(result.report?.facts.git)).toBe(true);
});
