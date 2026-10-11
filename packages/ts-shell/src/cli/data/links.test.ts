import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openConversationLink } from './links.js';
import type { ToolGateOptions } from '../../turn/tools.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-link-'));
  fs.writeFileSync(path.join(root, 'xdg-open'), '#!/bin/sh\nprintf "%s" "$1" > "$CHEERS_LINK_PROBE"\n', { mode: 0o700 });
  vi.stubEnv('PATH', `${root}${path.delimiter}${process.env.PATH ?? ''}`);
  vi.stubEnv('CHEERS_LINK_PROBE', path.join(root, 'launched'));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function gate(overrides: Partial<ToolGateOptions> = {}): ToolGateOptions {
  return { sessionId: 'sess_link', workspaceRoot: root, permissionScope: 'ask', agentMode: 'build', emit: () => {},
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never,
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'allow-once', respondedAt: 1 }), ...overrides };
}

it('opens only the approved exact URL through native execution', async () => {
  const url = 'https://example.invalid/a?first=1&second=2';
  expect(await openConversationLink(url, gate(), () => undefined)).toMatchObject({ outcome: 'committed' });
  expect(fs.readFileSync(path.join(root, 'launched'), 'utf8')).toBe(url);
});

it('keeps denial and Plan refusal distinct and launches neither', async () => {
  expect(await openConversationLink('https://example.invalid/', gate({ escalationPromptHandler: async prompt =>
    ({ promptId: prompt.id, decision: 'deny', respondedAt: 1 }) }), () => undefined)).toMatchObject({ outcome: 'denied' });
  expect(await openConversationLink('https://example.invalid/', gate({ agentMode: 'plan', permissionScope: 'allow-all' }), () => undefined))
    .toMatchObject({ outcome: 'blocked' });
  expect(fs.existsSync(path.join(root, 'launched'))).toBe(false);
});

it('revokes a pending approval when the originating session changes', async () => {
  let changed = false;
  const result = await openConversationLink('https://example.invalid/', gate({ escalationPromptHandler: async prompt => {
    changed = true; return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 };
  } }), () => changed ? 'Session changed.' : undefined);
  expect(result.outcome).toBe('blocked');
  expect(fs.existsSync(path.join(root, 'launched'))).toBe(false);
});

it('blocks credentials and unsafe protocols before approval, and preserves a post-launch verification failure', async () => {
  const approve = vi.fn(gate().escalationPromptHandler!);
  for (const url of ['file:///etc/hosts', 'https://user:secret@example.invalid/', 'https://example.invalid/\n']) {
    expect(await openConversationLink(url, gate({ escalationPromptHandler: approve }), () => undefined)).toMatchObject({ outcome: 'blocked' });
  }
  expect(approve).not.toHaveBeenCalled();
  const result = await openConversationLink('https://example.invalid/', gate({ hooks: { dispatch: async event => {
    if (event.eventName === 'PostToolUse') throw new Error('lost result publication');
    return { decision: 'allow' };
  } } as never }), () => undefined);
  expect(fs.existsSync(path.join(root, 'launched'))).toBe(true);
  expect(result.outcome).toBe('unknown');
});
