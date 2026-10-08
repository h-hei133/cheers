import { lstatSync } from 'node:fs';
import path from 'node:path';
import { sameValue } from '../../config/values.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { createRequestLedger, initializeRequestScope } from '../../core/agent/request/ledger.js';
import { ModelAdmissionError, type BudgetConstraint, type LedgerBinding, type RequestLedgerStore, type RequestScope } from '../../core/agent/request/model.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import { projectSessionFileLayout, validateSessionId, type SessionFileLayout } from './sessionFileLayout.js';
import { readSessionMetadataRecord } from './sessionStore.js';
import { readStateSnapshotRequired } from './sessionStateStore.js';
import { withFileLock, writeJsonFileAtomic } from './sessionFileStore.js';

interface RequestStoreHost { readonly getSessionDirPath: (sessionId: string) => string }
export interface RequestStoreView { readonly state: SessionStateSnapshot; readonly projectRoot: string }

/** A feature supplies admission policy; the session owner supplies publication and identity. */
export function sessionRequestStore(host: RequestStoreHost, session: Session, scope: RequestScope,
  guard: (view: RequestStoreView) => BudgetConstraint): RequestLedgerStore {
  const layout = layoutFor(host, session.id);
  const binding: LedgerBinding = { sessionId: session.id, sessionCreatedAt: session.createdAt, directoryIdentity: directoryIdentity(layout) };
  return {
    transaction: (admit, update) => {
      let persistence: ModelAdmissionError['persistence'] = 'unchanged';
      try {
        return withFileLock(layout.stateLockPath, () => {
          if (layoutFor(host, session.id).sessionDir !== layout.sessionDir || directoryIdentity(layout) !== binding.directoryIdentity) throw new ModelAdmissionError('unavailable');
          const current = readCurrent(layout, binding);
          const decoded = current.state.requestLedger === undefined ? createRequestLedger(binding) : decodeRequestLedger(current.state.requestLedger);
          if (!decoded || !sameBinding(decoded, binding)) throw new ModelAdmissionError('unavailable');
          // A missing pre-metering scope has unknown history, including budget-off history.
          const ledger = initializeRequestScope(decoded, scope, true);
          const constraint = admit ? guard(current) : {};
          const changed = update(ledger, constraint);
          if (sameValue(changed.ledger, decoded)) return changed.value;
          const latest = readCurrent(layout, binding);
          if (!sameValue(latest.state, current.state) || latest.projectRoot !== current.projectRoot
            || directoryIdentity(layout) !== binding.directoryIdentity || layoutFor(host, session.id).sessionDir !== layout.sessionDir) throw new ModelAdmissionError('unavailable');
          persistence = 'unknown';
          const next = { ...current.state, requestLedger: changed.ledger };
          writeJsonFileAtomic(layout.statePath, next);
          const confirmed = readCurrent(layout, binding);
          if (!sameValue(confirmed.state, next) || confirmed.projectRoot !== current.projectRoot || directoryIdentity(layout) !== binding.directoryIdentity) throw new ModelAdmissionError('unavailable', 'unknown');
          if (admit) guard(confirmed);
          persistence = 'persisted';
          return changed.value;
        }, { createParent: false, recovery: 'local-dead' });
      } catch (error) {
        throw new ModelAdmissionError(error instanceof ModelAdmissionError ? error.code : 'unavailable', persistence);
      }
    },
  };
}

function readCurrent(layout: SessionFileLayout, binding: LedgerBinding): RequestStoreView {
  const metadata = readSessionMetadataRecord(layout.metadataPath);
  const state = readStateSnapshotRequired(layout.statePath);
  if (!metadata || metadata.id !== binding.sessionId || metadata.createdAt !== binding.sessionCreatedAt
    || !state || typeof state !== 'object' || Array.isArray(state) || typeof metadata.projectRoot !== 'string'
    || typeof state.projectRoot !== 'string') throw new ModelAdmissionError('unavailable');
  const root = captureWorkspaceRoot(metadata.projectRoot, metadata.projectRoot, 'read');
  const stateRoot = captureWorkspaceRoot(state.projectRoot, state.projectRoot, 'read');
  if (root.path !== stateRoot.path || root.identity !== stateRoot.identity) throw new ModelAdmissionError('unavailable');
  return { state, projectRoot: root.path };
}

function sameBinding(first: LedgerBinding, second: LedgerBinding): boolean {
  return first.sessionId === second.sessionId && first.sessionCreatedAt === second.sessionCreatedAt && first.directoryIdentity === second.directoryIdentity;
}
function directoryIdentity(layout: SessionFileLayout): string {
  const stat = lstatSync(layout.sessionDir, { bigint: true });
  if (!stat.isDirectory()) throw new ModelAdmissionError('unavailable');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
function layoutFor(host: RequestStoreHost, sessionId: string): SessionFileLayout {
  if (validateSessionId(sessionId) !== sessionId || sessionId === '.' || sessionId === '..') throw new ModelAdmissionError('unavailable');
  const directory = host.getSessionDirPath(sessionId);
  const layout = projectSessionFileLayout({ sessionsDir: path.dirname(directory), sessionId });
  if (layout.sessionDir !== directory) throw new ModelAdmissionError('unavailable');
  return layout;
}
