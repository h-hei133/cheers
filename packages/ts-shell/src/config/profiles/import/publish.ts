import fs from 'node:fs';
import path from 'node:path';
import { assertUnlinkedPath } from '../../../core/paths/profile/identity.js';
import { hashContent, inspectWorkspaceFile, workspaceFilePath } from '../../../core/workspace/files.js';
import { IMPORT_LIMITS, type ImportPlan } from './model.js';
import { checkJournal, type ImportJournal } from './journal.js';

export class ImportConflict extends Error {
  constructor() { super('Import conflicts with retained destination content; nothing was overwritten.'); }
}

function targetState(plan: ImportPlan, relative: string, journal: ImportJournal) {
  return inspectWorkspaceFile(plan.request.target.root, relative, () => checkJournal(journal), IMPORT_LIMITS.fileBytes);
}

/** Detect all currently visible conflicts before exposing another consumer file. */
export function checkDestinations(plan: ImportPlan, journal: ImportJournal): void {
  for (const file of plan.files) {
    const state = targetState(plan, file.relative, journal);
    if (state.state === 'exists' && state.content !== file.content) throw new ImportConflict();
  }
}

export function publishFiles(plan: ImportPlan, journal: ImportJournal, admission: () => void = () => {}): void {
  checkDestinations(plan, journal);
  for (const [index, file] of plan.files.entries()) {
    admission();
    checkJournal(journal);
    const target = workspaceFilePath(plan.request.target.root, file.relative);
    const stage = path.join(journal.directory.path, `${index}.stage`);
    assertUnlinkedPath(stage);
    const staged = inspectWorkspaceFile(journal.directory.path, path.basename(stage), () => checkJournal(journal), IMPORT_LIMITS.fileBytes);
    if (staged.state !== 'exists' || staged.hash !== hashContent(file.content)) throw new Error('Import staging content is unverified.');
    const before = targetState(plan, file.relative, journal);
    if (before.state === 'absent') {
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      checkJournal(journal); assertUnlinkedPath(target);
      try { fs.linkSync(stage, target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Another creator can only be reconciled by reading its actual bytes.
      }
    }
    const after = targetState(plan, file.relative, journal);
    if (after.state !== 'exists' || after.content !== file.content) throw new ImportConflict();
  }
  admission();
  checkDestinations(plan, journal);
}
