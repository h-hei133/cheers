import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as childProcess from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureWorkspaceRoot } from '../core/workspace/roots.js';
import { workspaceSandboxPolicy } from './workspace.js';
import { planSandboxedCommand } from './osSandbox.js';

vi.mock('node:child_process', async () => ({
  ...await vi.importActual<typeof childProcess>('node:child_process'), spawnSync: vi.fn(),
}));
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
let fixture: string, primary: string, extra: string, hidden: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-sandbox-'));
  primary = path.join(fixture, 'primary'); extra = path.join(fixture, 'read"root'); hidden = path.join(extra, 'hidden');
  for (const folder of [primary, extra, hidden, path.join(fixture, 'home')]) fs.mkdirSync(folder);
  vi.stubEnv('HOME', path.join(fixture, 'home')); vi.stubEnv('USERPROFILE', path.join(fixture, 'home'));
  fs.mkdirSync(path.join(primary, '.agents'));
  fs.writeFileSync(path.join(primary, '.agents/sandbox.json'), JSON.stringify({ enabled: true,
    filesystem: { allowWrite: [fixture], denyRead: [hidden] } }));
  vi.mocked(childProcess.spawnSync).mockReturnValue({ status: 0, stdout: 'launcher\n' } as ReturnType<typeof childProcess.spawnSync>);
});
afterEach(() => { Object.defineProperty(process, 'platform', platformDescriptor); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });

describe('workspace sandbox access', () => {
  it('mounts explicit read roots after writable ancestors and hides denied children last', () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'linux' });
    const policy = workspaceSandboxPolicy(primary, [captureWorkspaceRoot(extra, primary, 'read')]);
    const plan = planSandboxedCommand({ workspaceRoot: primary, shell: '/bin/sh', shellArgs: ['-c', 'true'], ...policy });
    expect(plan.state).toBe('isolated');
    const args = plan.args!;
    const write = args.findIndex((arg, index) => arg === '--bind' && args[index + 1] === fixture);
    const read = args.findLastIndex((arg, index) => arg === '--ro-bind' && args[index + 1] === extra);
    const deny = args.findIndex((arg, index) => arg === '--tmpfs' && args[index + 1] === hidden);
    const temp = args.findIndex((arg, index) => arg === '--tmpfs' && args[index + 1] === '/tmp');
    const workspace = args.findIndex((arg, index) => arg === '--bind' && args[index + 1] === primary);
    expect(write).toBeGreaterThan(-1); expect(read).toBeGreaterThan(write); expect(deny).toBeGreaterThan(read);
    expect(workspace).toBeGreaterThan(temp);
  });

  it('denies writes to read roots even beneath the macOS temp and configured write grants', () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'darwin' });
    const policy = workspaceSandboxPolicy(primary, [captureWorkspaceRoot(extra, primary, 'read')]);
    const plan = planSandboxedCommand({ workspaceRoot: primary, shell: '/bin/sh', shellArgs: [], ...policy });
    expect(plan.state).toBe('isolated');
    const profile = plan.args![1]!;
    const deny = `(deny file-write* (subpath ${JSON.stringify(extra)}))`;
    expect(profile).toContain('(allow file-write* (subpath "/tmp"))');
    expect(profile.indexOf(deny)).toBeGreaterThan(profile.indexOf(`(allow file-write* (subpath ${JSON.stringify(fixture)}))`));
    expect(profile.indexOf(`(deny file-read* (subpath ${JSON.stringify(hidden)}))`)).toBeGreaterThan(profile.indexOf(deny));
  });
});
