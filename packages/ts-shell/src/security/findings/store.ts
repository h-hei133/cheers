import { sameValue } from '../../config/values.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionRevision, readBoundSessionState, publishBoundSessionState, type BoundSessionHost } from '../../session/store/bound.js';
import { admitJsonSource, boundedJson } from '../analysis/json.js';
import type { ScanRecord, SecurityState, Remediation } from '../analysis/model.js';

export interface SecurityStore {
  read(): SecurityState;
  /** No payload cache: optional source freshness for subscribed polling only. */
  revision?(): string;
  write(update: (state: SecurityState) => SecurityState): void;
}
/** The retained security document is embedded in a larger original session source. */
export const SECURITY_SESSION_READ_LIMITS = Object.freeze({ metadataBytes: 256 * 1024, stateBytes: 8 * 1024 * 1024 });
export function decodeSecurity(value: unknown): SecurityState {
  if (value === undefined) return { version: 1, scans: [], dispositions: [], remediations: [] };
  admitJsonSource(value);
  const state = boundedJson(JSON.stringify(value)) as unknown as SecurityState;
  if (state.version !== 1 || !Array.isArray(state.scans) || state.scans.length > 32 || !Array.isArray(state.dispositions)
    || state.dispositions.length > 512 || !Array.isArray(state.remediations) || state.remediations.length > 64) throw new Error('Security session state is unavailable.');
  for (const scan of state.scans) if (!scan || typeof scan.id !== 'string' || scan.id !== scan.plan?.id || typeof scan.plan.root !== 'string'
    || !Array.isArray(scan.plan.sources) || !Array.isArray(scan.findings) || !Array.isArray(scan.receipts) || !scan.coverage
    || !['planned', 'permission-pending', 'running', 'completed', 'partial', 'denied', 'blocked', 'failed', 'timeout', 'cancelled', 'unknown'].includes(scan.status)) throw new Error('Security scan state is malformed.');
  for (const item of state.dispositions) if (!item || !['open', 'false-positive', 'accepted-risk'].includes(item.state) || typeof item.reason !== 'string' || !item.reason.trim()) throw new Error('Security disposition state is malformed.');
  for (const item of state.remediations) if (!item || typeof item.id !== 'string' || typeof item.input !== 'string' || !item.expectedHashes || !item.afterHashes) throw new Error('Security remediation state is malformed.');
  return freezeDeep(state);
}
export function securityStore(host: BoundSessionHost, current: () => Session): SecurityStore {
  return { read: () => decodeSecurity(readBoundSessionState(host, current(), SECURITY_SESSION_READ_LIMITS).state.security),
    revision: () => readBoundSessionRevision(host, current()), write: update => {
    const session = current(); const baseline = readBoundSessionState(host, session);
    publishBoundSessionState(host, session, baseline, (state, previous) => sameValue(state.security, previous.security),
      state => ({ ...state, security: decodeSecurity(update(decodeSecurity(state.security))) }));
  } };
}
export function retainScan(store: SecurityStore, scan: ScanRecord): void {
  store.write(state => {
    const previous = state.scans.find(item => item.id === scan.id);
    if (scan.status === 'permission-pending' && (!previous || previous.status !== 'planned')) throw new Error('Security scan is already claimed or no longer planned.');
    if (previous && previous.plan.fingerprint !== scan.plan.fingerprint) throw new Error('Security scan identity changed before publication.');
    const scans = [...state.scans.filter(item => item.id !== scan.id), scan];
    if (scans.length > 32) throw new Error('Security history has reached its 32-scan retention limit; retained evidence was preserved.');
    return { ...state, scans };
  });
}
export function retainRemediation(store: SecurityStore, remediation: Remediation): void {
  store.write(state => {
    const previous = state.remediations.find(item => item.id === remediation.id);
    if (remediation.status === 'permission-pending' && (!previous || !['proposed', 'denied', 'blocked'].includes(previous.status))) throw new Error('Security patch is already claimed or no longer proposed.');
    if (previous && previous.digest !== remediation.digest) throw new Error('Security patch identity changed before publication.');
    return { ...state, remediations: [...state.remediations.filter(item => item.id !== remediation.id), remediation] };
  });
}
export function scanById(store: SecurityStore, id?: string): ScanRecord {
  const scans = store.read().scans; const scan = id ? scans.find(item => item.id === id) : scans.at(-1);
  if (!scan) throw new Error('Security scan was not found in this bound session.'); return scan;
}
