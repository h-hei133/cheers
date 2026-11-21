import fs from 'node:fs';
import path from 'node:path';
import { hashContent, inspectWorkspaceFile, pathIdentity, type FileState } from '../../../core/workspace/files.js';
import { isRecord } from '../../../core/values/record.js';
import { normalizePathIdentity } from '../../continuation/roots.js';
import { NAVIGATION_LIMITS } from '../../query/navigation/limits.js';
import { classifyTranscriptLine, createTranscriptHeader, TRANSCRIPT_FORMAT_VERSION } from '../../sessionEventCodec.js';
import { parseTranscript } from '../../transcript/read.js';
import { assertNoPromptIntent } from '../prompt/intent.js';
import { writeTextFileAtomic } from '../sessionFileStore.js';
import { validateSessionId, type SessionFileLayout } from '../sessionFileLayout.js';
import { readStateSnapshotRequired, withSessionStateLock } from '../sessionStateStore.js';
import { readSessionMetadataRecord } from '../sessionStore.js';
import { fileVersion, readSessionFileVersion } from '../version.js';

export interface TranscriptMigrationOptions {
  readonly direction?: 'upgrade' | 'rollback';
  readonly confirmation?: string;
  readonly admission?: () => string | undefined;
}

export type TranscriptMigrationResult =
  | { readonly status: 'preview'; readonly version: number; readonly targetVersion: number; readonly confirmation: string; readonly bytes: number }
  | { readonly status: 'committed'; readonly version: number }
  | { readonly status: 'unchanged' | 'unknown'; readonly reason: string };

type File = Extract<FileState, { state: 'exists' }>;
type Direction = NonNullable<TranscriptMigrationOptions['direction']>;

class MigrationRefusal extends Error {}

/** The ordinary transcript remains the only file that session readers and writers use. */
export function migrateSessionTranscript(resolveLayout: () => SessionFileLayout, sessionId: string,
  options: TranscriptMigrationOptions): TranscriptMigrationResult {
  const { direction = 'upgrade', confirmation, admission } = options;
  let attempted = false;
  try {
    if (validateSessionId(sessionId) !== sessionId || sessionId === '.' || sessionId === '..' || !['upgrade', 'rollback'].includes(direction)) {
      return { status: 'unchanged', reason: 'Invalid transcript migration request.' };
    }
    const layout = resolveLayout();
    if (confirmation === undefined) {
      if (admission?.()) return { status: 'unchanged', reason: 'Transcript migration was refused.' };
      const preview = capturePlan(layout, sessionId, direction).preview;
      if (admission?.()) return { status: 'unchanged', reason: 'Transcript migration was refused.' };
      return preview;
    }
    return withSessionStateLock(layout, () => {
      const plan = capturePlan(layout, sessionId, direction);
      if (confirmation !== plan.preview.confirmation) throw new MigrationRefusal('The saved transcript changed. Review the operation again.');
      const checkOwner = () => {
        if (resolveLayout().sessionDir !== layout.sessionDir || pathIdentity(layout.sessionDir) !== plan.directory
          || stateVersion(layout) !== plan.stateVersion) throw new MigrationRefusal('The saved session changed. Review the operation again.');
      };
      const checkSource = () => {
        if (admission?.()) throw new MigrationRefusal('Transcript migration was refused.');
        checkOwner();
        if (readSessionFileVersion(layout) !== plan.version) throw new MigrationRefusal('The saved transcript changed. Review the operation again.');
      };
      checkSource();
      if (plan.archive.state === 'absent') {
        writeTextFileAtomic(path.join(layout.sessionDir, plan.archiveName), plan.original, 0o400, {
          createParent: false,
          beforeRename: () => {
            checkSource();
            if (readFile(layout, plan.archiveName).state !== 'absent') throw new MigrationRefusal('The retained transcript changed. Review the operation again.');
          },
        });
      }
      const archive = assertArchive(layout, plan.archiveName, plan.original, plan.archive.state === 'exists' ? plan.archive.identity : undefined);
      checkOwner();
      syncDirectory(layout.sessionDir);
      writeTextFileAtomic(layout.transcriptPath, plan.replacement, plan.source.mode & 0o777, {
        createParent: false,
        beforeRename: () => {
          checkSource();
          assertArchive(layout, plan.archiveName, plan.original, archive.identity);
          checkOwner();
          if (readSessionFileVersion(layout) !== plan.version) throw new MigrationRefusal('The saved transcript changed. Review the operation again.');
        },
        onRenameStart: () => { attempted = true; },
      });
      checkOwner();
      syncDirectory(layout.sessionDir);
      const current = readFile(layout, path.basename(layout.transcriptPath));
      if (current.state !== 'exists' || current.content !== plan.replacement) throw new Error('Transcript readback failed.');
      checkOwner();
      return { status: 'committed', version: plan.preview.targetVersion };
    }, { requireExisting: true, recovery: 'local-dead' });
  } catch (error) {
    if (attempted) return { status: 'unknown', reason: 'Transcript publication is unverified. Inspect the saved transcript before retrying.' };
    return { status: 'unchanged', reason: error instanceof MigrationRefusal ? error.message : 'The saved transcript is unavailable for migration.' };
  }
}

function capturePlan(layout: SessionFileLayout, sessionId: string, direction: Direction) {
  assertNoPromptIntent(layout);
  const version = readSessionFileVersion(layout);
  const directory = pathIdentity(layout.sessionDir);
  const boundState = stateVersion(layout);
  const metadata = readSessionMetadataRecord(layout.metadataPath, NAVIGATION_LIMITS.metadataBytes);
  const state = readStateSnapshotRequired(layout.statePath, NAVIGATION_LIMITS.stateBytes);
  if (!isRecord(state) || !['active', 'interrupted', 'completed', 'completed_unproven', 'error', 'terminated'].includes(state.status)) {
    throw new MigrationRefusal('The saved session state is unavailable.');
  }
  const root = savedRoot(metadata?.projectRoot, state.projectRoot);
  if (!metadata || metadata.id !== sessionId || typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt)) || !root) {
    throw new MigrationRefusal('The saved session identity is unavailable.');
  }
  if (state.pendingPrompt !== undefined || (state.runPhase !== undefined && state.runPhase !== 'idle')) {
    throw new MigrationRefusal('Finish or recover the active turn before migrating its transcript.');
  }
  const source = readFile(layout, path.basename(layout.transcriptPath));
  if (source.state !== 'exists') throw new MigrationRefusal('The saved transcript is unavailable.');
  const decoded = parseTranscript(source.content, NAVIGATION_LIMITS.transcriptLines);
  if (decoded.warnings.length || new Set(decoded.events.map(event => event.id)).size !== decoded.events.length) {
    throw new MigrationRefusal('The transcript contains unreadable or ambiguous records.');
  }
  const header = `${JSON.stringify(createTranscriptHeader({ sessionId, timestamp: metadata.createdAt, cwd: root }))}\n`;
  let original: string;
  if (direction === 'upgrade') {
    if (decoded.version !== 0) throw new MigrationRefusal('The saved transcript already uses the current format.');
    const first = source.content.trimStart().split('\n', 1)[0] ?? '';
    if (classifyTranscriptLine(first).kind === 'header') throw new MigrationRefusal('This legacy transcript header requires a different conversion.');
    original = source.content;
  } else {
    if (decoded.version !== TRANSCRIPT_FORMAT_VERSION || !source.content.startsWith(header)) {
      throw new MigrationRefusal('The saved transcript is unavailable for rollback.');
    }
    original = source.content.slice(header.length);
  }
  const replacement = direction === 'upgrade' ? header + original : original;
  if (Buffer.byteLength(replacement) > NAVIGATION_LIMITS.transcriptBytes) throw new MigrationRefusal('The transcript exceeds the migration size limit.');
  const archiveName = `transcript.${hashContent(original)}.bak`;
  const archive = readFile(layout, archiveName);
  if ((archive.state === 'exists' && archive.content !== original) || (archive.state === 'absent' && direction === 'rollback')) {
    throw new MigrationRefusal('An exact transcript backup is unavailable for this operation.');
  }
  assertNoPromptIntent(layout);
  if (pathIdentity(layout.sessionDir) !== directory || readSessionFileVersion(layout) !== version) {
    throw new MigrationRefusal('The saved session changed while preparing transcript migration.');
  }
  const targetVersion = direction === 'upgrade' ? TRANSCRIPT_FORMAT_VERSION : 0;
  const receipt = hashContent(JSON.stringify([direction, sessionId, metadata.createdAt, root, directory, version, source.hash,
    direction === 'rollback' && archive.state === 'exists' ? archive.identity : null]));
  const preview = { status: 'preview', version: decoded.version, targetVersion, confirmation: receipt,
    bytes: Buffer.byteLength(source.content) } as const;
  return { directory, version, stateVersion: boundState, source, original, replacement, archiveName, archive, preview };
}

function savedRoot(metadataRoot: unknown, stateRoot: unknown): string | undefined {
  const metadata = typeof metadataRoot === 'string' ? metadataRoot.trim() : undefined;
  const state = typeof stateRoot === 'string' ? stateRoot.trim() : undefined;
  const root = metadata || state;
  if (!root || !path.isAbsolute(root) || (metadata && state && normalizePathIdentity(metadata) !== normalizePathIdentity(state))) return undefined;
  return root;
}

function readFile(layout: SessionFileLayout, name: string): FileState {
  return inspectWorkspaceFile(layout.sessionDir, name, undefined, NAVIGATION_LIMITS.transcriptBytes);
}

function assertArchive(layout: SessionFileLayout, name: string, contents: string, identity?: string): File {
  const result = readFile(layout, name);
  if (result.state !== 'exists' || result.content !== contents || (identity !== undefined && result.identity !== identity)) {
    throw new MigrationRefusal('The retained transcript changed. Review the operation again.');
  }
  return result;
}

function stateVersion(layout: SessionFileLayout): string {
  return JSON.stringify([layout.metadataPath, layout.statePath].map(file => fileVersion(fs.lstatSync(file))));
}

function syncDirectory(directory: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0));
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
