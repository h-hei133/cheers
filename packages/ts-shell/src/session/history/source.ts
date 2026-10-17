import path from 'node:path';
import fs from 'node:fs';
import { assertUnlinkedPath } from '../../core/paths/profile/identity.js';
import { createHash } from 'node:crypto';
import { createSessionStoreLayout, validateSessionId } from '../store/sessionFileLayout.js';
import type { ProfileContext } from '../../core/paths/profile/context.js';
import { parseTranscript } from '../transcript/sessionTranscript.js';
import { historyFiles } from './files.js';
import { exportHistory, parseHistory } from './model.js';
import type { SessionThreadSnapshot } from '../schema/sessionThread.js';

/** Source-profile history is read through its captured layout, never a temporary runtime. */
export function collectHistory(input: {
  readonly source: ProfileContext;
  readonly target: ProfileContext;
  readonly workspace: string;
  readonly excludedSessionId?: string;
  readonly read: (absolute: string) => string | undefined;
  readonly entries: (directory: string) => readonly string[];
}): ReturnType<typeof historyFiles> {
  const layout = createSessionStoreLayout(input.source.homeDir, input.source);
  const seen = new Set<string>();
  const files: ReturnType<typeof historyFiles>[number][] = [];
  for (const directory of layout.sessionsSearchDirs) {
    for (const name of input.entries(directory)) {
      validateSessionId(name);
      if (name === '.' || name === '..' || name === input.excludedSessionId || seen.has(name)) continue;
      seen.add(name);
      const base = path.join(directory, name);
      assertUnlinkedPath(base);
      if (!fs.lstatSync(base).isDirectory()) continue;
      const raw = input.read(path.join(base, 'metadata.json'));
      if (raw === undefined) continue;
      const metadata: unknown = JSON.parse(raw);
      if (!metadata || typeof metadata !== 'object' || !('projectRoot' in metadata) || metadata.projectRoot !== input.workspace) continue;
      if (!('id' in metadata) || metadata.id !== name || !('createdAt' in metadata) || typeof metadata.createdAt !== 'string'
        || !Number.isFinite(Date.parse(metadata.createdAt)) || ('title' in metadata && typeof metadata.title !== 'string')) {
        throw new Error('Import session metadata is invalid.');
      }
      const transcript = input.read(path.join(base, 'transcript.jsonl'));
      const state = input.read(path.join(base, 'state.json'));
      if (transcript === undefined) throw new Error('Import session transcript is missing.');
      const decoded = parseTranscript(transcript);
      if (!decoded.events.some(event => event.type === 'message' || event.type === 'command-output') && !decoded.warnings.length) continue;
      const document = parseHistory(exportHistory(name, input.workspace, ('title' in metadata ? metadata.title as string : undefined),
        { captured: { transcript: decoded, thread: state === undefined ? undefined : (JSON.parse(state) as { thread?: SessionThreadSnapshot }).thread },
          now: () => new Date(metadata.createdAt as string) }));
      const id = `sess_profile_${createHash('sha256').update(input.source.rootIdentity + '\0' + input.target.rootIdentity + '\0' + input.workspace + '\0' + name).digest('hex').slice(0, 32)}`;
      files.push(...historyFiles(document, id, input.workspace, metadata.createdAt));
    }
  }
  return files;
}
