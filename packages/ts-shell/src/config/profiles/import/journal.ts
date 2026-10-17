import fs from 'node:fs';
import path from 'node:path';
import { assertProfileIdentity } from '../../../core/paths/profile/context.js';
import { assertDirectoryIdentity, assertUnlinkedPath, directoryIdentity, type DirectoryIdentity } from '../../../core/paths/profile/identity.js';
import { hashContent, inspectWorkspaceFile, readTextFile } from '../../../core/workspace/files.js';
import { writeTextFileAtomic } from '../../../session/store/sessionFileStore.js';
import { IMPORT_LIMITS, type ImportPlan, type ImportRequest } from './model.js';

export interface ImportJournal {
  readonly version: 1;
  readonly digest: string;
  readonly request: ImportRequest;
  readonly directory: DirectoryIdentity;
  readonly files: readonly { readonly relative: string; readonly hash: string; readonly metadata: boolean }[];
  status: 'prepared' | 'publishing' | 'complete' | 'conflict' | 'unknown';
}

export function importDirectory(targetRoot: string, digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('A full profile operation digest is required.');
  const directory = path.join(targetRoot, '.imports', digest);
  assertUnlinkedPath(directory);
  return directory;
}

export function checkJournal(journal: ImportJournal): void {
  assertProfileIdentity(journal.request.source); assertProfileIdentity(journal.request.target); assertDirectoryIdentity(journal.request.workspace);
  const directory = importDirectory(journal.request.target.root, journal.digest);
  if (journal.directory.path !== directory) throw new Error('Import journal directory binding is invalid.');
  assertDirectoryIdentity(journal.directory);
}

export function readJournal(targetRoot: string, digest: string): ImportJournal | undefined {
  const text = readTextFile(path.join(importDirectory(targetRoot, digest), 'journal.json'), IMPORT_LIMITS.fileBytes);
  if (text === undefined) return undefined;
  const value = JSON.parse(text) as ImportJournal;
  if (value.version !== 1 || value.digest !== digest || value.request?.target?.root !== targetRoot
    || !Array.isArray(value.files) || value.files.length > IMPORT_LIMITS.files
    || !['prepared', 'publishing', 'complete', 'conflict', 'unknown'].includes(value.status)) throw new Error('Import journal is invalid.');
  checkJournal(value);
  return value;
}

export function writeJournal(journal: ImportJournal): void {
  checkJournal(journal);
  const target = path.join(journal.directory.path, 'journal.json'); assertUnlinkedPath(target);
  const text = JSON.stringify(journal, null, 2) + '\n';
  if (Buffer.byteLength(text) > IMPORT_LIMITS.fileBytes) throw new Error('Import journal exceeds its size limit.');
  writeTextFileAtomic(target, text, 0o600);
  checkJournal(journal);
  if (readTextFile(target, IMPORT_LIMITS.fileBytes) !== text) throw new Error('Import journal publication is unverified.');
}

export function prepareJournal(plan: ImportPlan): ImportJournal {
  const existing = readJournal(plan.request.target.root, plan.digest);
  const files = plan.files.map(file => ({ relative: file.relative, hash: hashContent(file.content), metadata: file.metadata }));
  if (existing) {
    if (JSON.stringify(existing.request) !== JSON.stringify(plan.request) || JSON.stringify(existing.files) !== JSON.stringify(files)) throw new Error('Import journal conflicts with its current plan.');
    return existing;
  }
  const directory = importDirectory(plan.request.target.root, plan.digest);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const journal: ImportJournal = { version: 1, digest: plan.digest, request: plan.request, directory: directoryIdentity(directory), files, status: 'prepared' };
  writeJournal(journal);
  return journal;
}

export function stageFiles(plan: ImportPlan, journal: ImportJournal): void {
  for (const [index, file] of plan.files.entries()) {
    checkJournal(journal);
    const target = path.join(journal.directory.path, `${index}.stage`); assertUnlinkedPath(target);
    const existing = inspectWorkspaceFile(journal.directory.path, path.basename(target), () => checkJournal(journal), IMPORT_LIMITS.fileBytes);
    if (existing.state === 'exists' && existing.content !== file.content) throw new Error('Import staging content is unverified.');
    if (existing.state === 'absent') writeTextFileAtomic(target, file.content, 0o600);
    checkJournal(journal);
    if (readTextFile(target, IMPORT_LIMITS.fileBytes) !== file.content) throw new Error('Import staging publication is unverified.');
  }
}
