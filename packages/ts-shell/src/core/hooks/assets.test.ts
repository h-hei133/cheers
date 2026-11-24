import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProfileContext, withProfile } from '../paths/profile/context.js';
import { resolveCompletionHookCommand, resolveWriteHookCommand, writeHookCommand, completionHookCommand } from './artifact.js';
import { HookDispatcher } from './hookDispatcher.js';
import { registerDeclaredHooks } from './registration.js';
import { CANONICAL_WRITE_MATCHER } from './translation.js';

const scratch = fileURLToPath(new URL('../../../../../.tmp/', import.meta.url));
let root: string;
beforeEach(() => {
  fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'hook-assets-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const pinnedRoot = fileURLToPath(new URL('../../../../../.normproof/', import.meta.url));
const readPin = (name: string) => fs.readFileSync(path.join(pinnedRoot, name));
const manifest = JSON.parse(readPin('bundle.json').toString('utf8')) as {
  baseCommit: string;
  archiveSha256: string;
};
const writeArtifact = JSON.parse(readPin('write-gate/artifact.json').toString('utf8')) as {
  sha256: string;
};
const stopArtifact = JSON.parse(readPin('completion-gate/artifact.json').toString('utf8')) as {
  sha256: string;
};

it('preserves file-backed declarations and gives bundled hooks stable permission identities', () => {
  expect(writeHookCommand({ version: 1, path: '.normproof/write-gate/cli.mjs', sha256: writeArtifact.sha256, nodeFloor: '20.3.0' }))
    .toContain('.normproof/write-gate/cli.mjs');
  expect(completionHookCommand({ version: 1, path: '.normproof/completion-gate/cli.mjs', sha256: stopArtifact.sha256, nodeFloor: '20.3.0' }))
    .toContain('.normproof/completion-gate/cli.mjs');
  expect(writeHookCommand({ version: 1, protocolVersion: 2, workerProtocol: 1, path: 'bundled:write',
    sha256: writeArtifact.sha256, nodeFloor: '20.3.0' })).toBe(`bundled-hook write ${writeArtifact.sha256}`);
  expect(completionHookCommand({ version: 1, path: 'bundled:stop', sha256: stopArtifact.sha256, nodeFloor: '20.3.0' }))
    .toBe(`bundled-hook stop ${stopArtifact.sha256}`);
});

it('materializes exact bundled artifacts only in the active profile and reuses verified bytes', async () => {
  const profile = createProfileContext({ homeDir: root });
  await withProfile(profile, async () => {
    const admitted = () => {};
    const write = await resolveWriteHookCommand({ version: 1, protocolVersion: 2, workerProtocol: 1,
      path: 'bundled:write', sha256: writeArtifact.sha256, nodeFloor: '20.3.0' }, root, admitted);
    const stop = await resolveCompletionHookCommand({ version: 1, path: 'bundled:stop',
      sha256: stopArtifact.sha256, nodeFloor: '20.3.0' }, root, admitted);
    const writePath = path.join(profile.root, 'hook-artifacts', `write-${writeArtifact.sha256}.mjs`);
    const stopPath = path.join(profile.root, 'hook-artifacts', `stop-${stopArtifact.sha256}.mjs`);
    expect(write).toMatchObject({ bundledPath: writePath });
    expect(stop).toMatchObject({ bundledPath: stopPath });
    expect(fs.readFileSync(writePath).equals(readPin('write-gate/cli.mjs'))).toBe(true);
    expect(fs.readFileSync(stopPath).equals(readPin('completion-gate/cli.mjs'))).toBe(true);
    expect(await resolveWriteHookCommand({ version: 1, protocolVersion: 2, workerProtocol: 1,
      path: 'bundled:write', sha256: writeArtifact.sha256, nodeFloor: '20.3.0' }, root, admitted)).toEqual(write);
  });
  expect(fs.readdirSync(root)).toEqual(['.cheers']);
  expect(manifest.baseCommit).toMatch(/^[a-f0-9]{40}$/);
  expect(manifest.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
});

it('refuses a conflicting existing profile artifact without replacing it', async () => {
  const profile = createProfileContext({ homeDir: root });
  const directory = path.join(profile.root, 'hook-artifacts');
  fs.mkdirSync(directory, { mode: 0o700 });
  const target = path.join(directory, `write-${writeArtifact.sha256}.mjs`);
  fs.writeFileSync(target, 'conflicting bytes', { flag: 'wx', mode: 0o600 });
  const before = fs.readFileSync(target);
  await withProfile(profile, async () => {
    const outcome = await resolveWriteHookCommand({ version: 1, protocolVersion: 2, workerProtocol: 1,
      path: 'bundled:write', sha256: writeArtifact.sha256, nodeFloor: '20.3.0' }, root, () => {});
    expect(outcome).toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'artifact_unreadable' } });
  });
  expect(fs.readFileSync(target)).toEqual(before);
});

it('leaves an unapproved artifact absent when admission is lost during publication', async () => {
  const profile = createProfileContext({ homeDir: root });
  let checks = 0;
  await withProfile(profile, async () => {
    const outcome = await resolveWriteHookCommand({ version: 1, path: 'bundled:write',
      sha256: writeArtifact.sha256, nodeFloor: '20.3.0' }, root, () => {
      if (++checks > 4) throw new Error('Registration withdrawn');
    });
    expect(outcome).toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown' } });
  });
  expect(checks).toBeGreaterThan(4);
  expect(fs.existsSync(path.join(profile.root, 'hook-artifacts', `write-${writeArtifact.sha256}.mjs`))).toBe(false);
});

it('rejects a profile artifact directory redirected through a symbolic link', async () => {
  const profile = createProfileContext({ homeDir: root });
  const outside = path.join(root, 'other');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(profile.root, 'hook-artifacts'), 'dir');
  await withProfile(profile, async () => {
    const outcome = await resolveCompletionHookCommand({ version: 1, path: 'bundled:stop',
      sha256: stopArtifact.sha256, nodeFloor: '20.3.0' }, root, () => {});
    expect(outcome).toMatchObject({ decision: 'unknown', reasonCode: 'artifact_unreadable' });
  });
  expect(fs.readdirSync(outside)).toEqual([]);
});

it('keeps the packaged asset manifest attributable to the pinned source and gate digests', () => {
  const assets = JSON.parse(fs.readFileSync(new URL('./assets.json', import.meta.url), 'utf8')) as {
    version: number;
    sourceCommit: string;
    gates: { write: { sha256: string }; stop: { sha256: string } };
  };
  expect(assets).toMatchObject({ version: 1, sourceCommit: manifest.baseCommit,
    gates: { write: { sha256: writeArtifact.sha256 }, stop: { sha256: stopArtifact.sha256 } } });
});

it('uses the declared bundled gates only after project hook approval and keeps absent proof explicit', async () => {
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  const profile = createProfileContext({ homeDir: root });
  const workspace = path.join(root, 'project');
  const writeGate = { version: 1, protocolVersion: 2, workerProtocol: 1, path: 'bundled:write', sha256: writeArtifact.sha256, nodeFloor: '20.3.0' };
  const completionGate = { version: 1, path: 'bundled:stop', sha256: stopArtifact.sha256, nodeFloor: '20.3.0' };
  fs.mkdirSync(path.join(workspace, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.normproof'));
  fs.writeFileSync(path.join(workspace, '.agents/hooks.json'), JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: CANONICAL_WRITE_MATCHER, hooks: [{ writeGate }] }],
    Stop: [{ hooks: [{ completionGate }] }],
  } }));
  fs.writeFileSync(path.join(workspace, '.normproof/write-rules.json'), JSON.stringify({ version: '0.2.0', rules: [
    { id: 'local-name', kind: 'filenameTokens', tokens: ['-draft'], pattern: 'src/**', message: 'Use a responsibility-based filename.' },
  ] }));
  const write = { eventName: 'PreToolUse' as const, workspaceRoot: workspace, sessionId: 'bundled-gates', timestamp: '2026-01-01T00:00:00Z',
    toolName: 'write', toolCallId: 'call', args: { path: 'src/unreviewed-draft.ts', content: 'export const value = 1;' } };
  const stop = { eventName: 'Stop' as const, workspaceRoot: workspace, sessionId: write.sessionId, timestamp: write.timestamp,
    attemptId: 'attempt', reentryCount: 0, stop_hook_active: false, turnsExecuted: 1, finalOutput: '' };
  const dispatcher = new HookDispatcher();
  try {
    await withProfile(profile, async () => {
      registerDeclaredHooks(dispatcher, workspace, { homeDir: root });
      expect(await dispatcher.dispatch(stop)).toMatchObject({ decision: 'unknown', reasonCode: 'not_authorized' });
      expect(fs.existsSync(path.join(profile.root, 'hook-artifacts'))).toBe(false);
      const requestApproval = vi.fn(async () => 'allow-once' as const);
      registerDeclaredHooks(dispatcher, workspace, { homeDir: root, requestApproval });
      expect(await dispatcher.dispatch(write)).toMatchObject({ decision: 'block', reasonCode: 'violation' });
      const absent = await dispatcher.dispatch(stop);
      expect(absent).toMatchObject({ stopChecks: [expect.objectContaining({ proofVerdict: 'not_reported',
        reasonCode: 'not_configured', stopDisposition: 'completed_unproven' })] });
      expect(absent.stopChecks?.[0]?.architecture).toBeUndefined();
      expect(requestApproval).toHaveBeenCalledTimes(2);
    });
  } finally { await dispatcher.dispatch({ ...stop, eventName: 'SessionEnd' }); }
  expect(fs.readdirSync(path.join(workspace, '.normproof'))).toEqual(['write-rules.json']);
}, 40_000);
