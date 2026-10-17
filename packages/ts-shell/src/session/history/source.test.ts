import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createProfileContext } from '../../core/paths/profile/context.js';
import { collectHistory } from './source.js';
import { historyFiles } from './files.js';

it('projects the graph from captured transcript/state bytes without a second filesystem acquisition', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-history-source-'));
  try {
    const workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
    const source = createProfileContext({ name: 'source', homeDir: home, env: {} });
    const target = createProfileContext({ name: 'target', homeDir: home, env: {} });
    const document = { kind: 'session-history' as const, version: 1 as const, sourceId: 'original', title: 'Captured history', leafId: 'message',
      nodes: [{ id: 'root', kind: 'session-root' as const }, { id: 'message', parentId: 'root', kind: 'turn-message' as const }],
      entries: [{ id: 'message', role: 'user' as const, content: 'captured-revision-A', timestamp: '2026-01-01T00:00:00.000Z' }] };
    const captured = new Map<string, string>();
    for (const file of historyFiles(document, 'original', workspace, document.entries[0]!.timestamp)) {
      const absolute = path.join(source.root, file.relative); fs.mkdirSync(path.dirname(absolute), { recursive: true });
      captured.set(absolute, file.content);
      // A detached reread would observe different content than the digest owner.
      fs.writeFileSync(absolute, file.content.replaceAll('captured-revision-A', 'unbound-revision-B'));
    }
    const read = vi.fn((absolute: string) => captured.get(absolute));
    const files = collectHistory({ source, target, workspace, read,
      entries: directory => fs.existsSync(directory) ? fs.readdirSync(directory) : [] });
    expect(files.some(file => file.content.includes('captured-revision-A'))).toBe(true);
    expect(files.some(file => file.content.includes('unbound-revision-B'))).toBe(false);
    expect(read.mock.calls.map(([file]) => path.basename(file))).toEqual(['metadata.json', 'transcript.jsonl', 'state.json']);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
