import fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile } from '../paths/profile/context.js';
import { AgentRegistryScanner } from './agentRegistryScanner.js';

vi.mock('node:os', async original => {
  const module = await original<typeof import('node:os')>();
  return { ...module, tmpdir: vi.fn(module.tmpdir) };
});

let home: string;
let legacy: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-peers-'));
  vi.mocked(os.tmpdir).mockReturnValue(home);
  legacy = path.join(home, `ts-socks-${process.getuid?.() ?? 1000}`);
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'session-foreign.sock'), 'synthetic descriptor');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

it('withholds unqualified legacy peers when constructed before named profile installation', () => {
  const scanner = new AgentRegistryScanner(home);
  const profile = createProfileContext({ name: 'work', homeDir: home, env: {} });
  withProfile(profile, () => {
    expect(scanner.scanAllReachableAgents().filter(agent => agent.kind === 'local_session')).toEqual([]);
  });
  fs.renameSync(profile.root, `${profile.root}-retired`);
  fs.mkdirSync(profile.root);
  expect(() => scanner.scanAllReachableAgents()).toThrow('changed identity');
});

it('preserves legacy peer discovery for the default profile', () => {
  const profile = createProfileContext({ homeDir: home, env: {} });
  const peers = withProfile(profile, () => new AgentRegistryScanner(home).scanAllReachableAgents());
  expect(peers.filter(agent => agent.kind === 'local_session').map(agent => agent.id)).toEqual(['foreign']);
});
