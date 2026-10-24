import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { SessionManager } from '../../../../session/SessionManager.js';
import type { Session } from '../../../../session/schema/sessionRecord.js';
import { projectSessionMetadata } from '../../../../session/schema/sessionMetadataCodec.js';
import { buildSessionStateSnapshot } from '../../../../session/schema/sessionStateSnapshot.js';
import { createMessageTranscriptEvent, createTranscriptHeader } from '../../../../session/sessionEventCodec.js';
import { SessionCatalog } from '../../../../session/store/catalog/index.js';
import { createSessionStoreLayout, projectSessionFileLayout } from '../../../../session/store/sessionFileLayout.js';
import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { Picker } from '../../overlay.js';
import { sessionPicker } from '../session.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'session-page-lifetime-')); roots.push(root);
  const layout = createSessionStoreLayout(root);
  const timestamp = '2026-10-07T00:00:00.000Z';
  for (const id of ['current', 'saved-a', 'saved-b', 'saved-c']) {
    const session: Session = { id, projectRoot: '/workspace', createdAt: timestamp, updatedAt: timestamp,
      status: 'completed', turns: [{ id: `${id}-prompt`, role: 'user', content: `Conversation ${id}`, timestamp }] };
    const files = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: id });
    fs.mkdirSync(files.sessionDir, { recursive: true });
    fs.writeFileSync(files.metadataPath, JSON.stringify(projectSessionMetadata(session)));
    fs.writeFileSync(files.statePath, JSON.stringify(buildSessionStateSnapshot(session, undefined)));
    fs.writeFileSync(files.transcriptPath, [createTranscriptHeader({ sessionId: id, timestamp, cwd: session.projectRoot }),
      createMessageTranscriptEvent(session.turns[0]!)].map(event => JSON.stringify(event)).join('\n') + '\n');
  }
  const catalog = new SessionCatalog(layout);
  const manager = { catalog, files: { sizes: vi.fn(async () => new Map()) } } as unknown as SessionManager;
  const picker = sessionPicker({ sessionManager: manager, context: () => ({ sessionId: 'current', projectRoot: '/workspace', busy: false }),
    initialLimit: 1, resume: vi.fn(async () => undefined) });
  return { picker, catalog };
}

async function finish(picker: Picker, signal?: AbortSignal): Promise<readonly Option[]> {
  await picker.load(signal);
  return new Promise(resolve => {
    picker.subscribe!(rows => { if (rows.some(row => row.id === 'action:more')) resolve(rows); });
  });
}

it('hands a real catalogue to the next picker after closing the previous listing', async () => {
  const { picker } = fixture();
  const previous = new AbortController();
  try {
    await finish(picker, previous.signal);
    const outcome = await picker.apply(['action:more']);
    expect(outcome?.next).toBeDefined();
    previous.abort(new Error('Previous overlay released'));
    const next = outcome!.next!;
    try {
      await expect(finish(next, new AbortController().signal)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'saved-a' }), expect.objectContaining({ id: 'action:more' }),
      ]));
      expect(next.detail?.('saved-a')).toBeDefined();
    } finally { next.previewEnd?.(); }
  } finally { picker.previewEnd?.(); }
});
