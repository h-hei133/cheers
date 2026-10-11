import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readContextEntry, renderContextEntry } from './entry.js';
import { parseContextAttachment } from './syntax.js';
import { runContextAttachmentCommand } from './command.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it('records provenance, read-only permission, bounds, and turn-limited persistence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-context-')); roots.push(root);
  fs.writeFileSync(path.join(root, 'notes.md'), 'bounded notes', 'utf8');
  const entry = readContextEntry({ root, target: 'notes.md' });
  expect(entry.permissions).toBe('read-only');
  expect(entry.persistence).toBe('turn');
  expect(renderContextEntry(entry)).toContain('source="user"');
  expect(renderContextEntry(entry)).toContain('max_bytes=');
});

it('rejects write-like attachment syntax and keeps add bounded', () => {
  expect(parseContextAttachment(['add', 'notes.md', '--write'])).toEqual({ error: expect.any(String) });
  expect(parseContextAttachment(['add', 'notes.md', '--persist', 'session'])).toEqual({ name: 'add', path: 'notes.md', persistence: 'session' });
});

it('keeps session persistence explicit and reports attached metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-context-')); roots.push(root);
  fs.writeFileSync(path.join(root, 'notes.md'), 'bounded notes', 'utf8');
  const blocked = runContextAttachmentCommand(['add', 'notes.md', '--persist', 'session'], { root });
  expect(blocked.status).toBe('blocked');
  const added = runContextAttachmentCommand(['add', 'notes.md'], { root });
  expect(added.status).toBe('ok');
  expect(added.output).toContain('permissions: read-only');
  expect(added.output).toContain('persistence: turn');
});
