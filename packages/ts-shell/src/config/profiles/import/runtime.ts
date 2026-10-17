import path from 'node:path';
import { assertProfileIdentity, type ProfileContext } from '../../../core/paths/profile/context.js';
import { assertUnlinkedPath } from '../../../core/paths/profile/identity.js';
import { withFileLock } from '../../../session/store/sessionFileStore.js';
import type { ImportPlan } from './model.js';
import { planImport } from './plan.js';
import { checkJournal, prepareJournal, readJournal, stageFiles, writeJournal, type ImportJournal } from './journal.js';
import { checkDestinations, ImportConflict, publishFiles } from './publish.js';

export interface ImportOutcome {
  readonly status: 'complete' | 'rejected' | 'conflict' | 'unknown';
  readonly operation: string;
  readonly reason?: string;
}

/** Confirmation authorizes this exact versioned selection, never a re-planned payload. */
export function applyImport(plan: ImportPlan, confirmation: string, admission: () => string | undefined = () => undefined): ImportOutcome {
  const operation = plan.digest;
  if (confirmation !== operation) return { status: 'rejected', operation, reason: 'The import preview digest must be confirmed exactly.' };
  let journal: ImportJournal | undefined; let started = false;
  try {
    const check = () => {
      const refusal = admission(); if (refusal) throw new Error('Profile import admission changed.');
      assertProfileIdentity(plan.request.target); assertUnlinkedPath(plan.request.target.root);
    };
    check();
    const lock = path.join(plan.request.target.root, '.profile-import.lock'); assertUnlinkedPath(lock);
    return withFileLock(lock, () => {
      check();
      const current = planImport(plan.request);
      if (current.digest !== operation) return { status: 'rejected' as const, operation, reason: 'Import sources changed; request a new preview.' };
      started = true;
      journal = prepareJournal(current);
      try {
        checkJournal(journal); checkDestinations(current, journal);
        stageFiles(current, journal);
        journal.status = 'publishing'; writeJournal(journal);
        // Recheck admission/source ownership immediately before consumer effects.
        check();
        if (planImport(plan.request).digest !== operation) throw new Error('Import sources changed before publication.');
        publishFiles(current, journal, check);
        check(); checkJournal(journal);
        journal.status = 'complete'; writeJournal(journal);
        return { status: 'complete' as const, operation };
      } catch (error) {
        try { journal.status = error instanceof ImportConflict ? 'conflict' : 'unknown'; writeJournal(journal); } catch { /* Retain uncertain storage untouched. */ }
        throw error;
      }
    }, { createParent: false });
  } catch (error) {
    const status = error instanceof ImportConflict ? 'conflict' : started ? 'unknown' : 'rejected';
    return { status, operation, reason: status === 'conflict' ? 'Destination content conflicts; retained data was not overwritten.'
      : status === 'unknown' ? 'Import completion is unverified. Inspect or explicitly recover this operation.' : 'Import was not admitted; request a fresh preview.' };
  }
}

export function recoverImport(target: ProfileContext, operation: string, confirmation?: string, admission?: () => string | undefined): ImportOutcome | { readonly status: 'preview'; readonly plan: ImportPlan; readonly previous: ImportJournal['status'] } {
  assertProfileIdentity(target); assertUnlinkedPath(target.root);
  const journal = readJournal(target.root, operation);
  if (!journal || journal.request.target.rootIdentity !== target.rootIdentity) throw new Error('Import operation does not belong to the selected target.');
  const plan = planImport(journal.request);
  if (plan.digest !== operation) throw new Error('Import source revisions changed; recovery was not admitted.');
  if (confirmation === undefined) return { status: 'preview', plan, previous: journal.status };
  return applyImport(plan, confirmation, admission);
}
