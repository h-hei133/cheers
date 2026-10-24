import { createHash } from 'node:crypto';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import { redactReportText } from '../../core/security/redaction.js';
import type { Disposition, Remediation, ScanRecord, SecurityState } from '../analysis/model.js';
import { admitJsonSource } from '../analysis/json.js';

export interface SecurityInspectionItem {
  readonly identity: string;
  readonly kind: 'scan' | 'remediation';
  readonly id: string;
  readonly targetId: string;
  readonly status: string;
  readonly durability: 'persisted' | 'unknown';
  readonly owner: 'live' | 'none';
  readonly summary: string;
  readonly detail: readonly string[];
}

export interface SecurityInspectionSnapshot {
  readonly identity: { readonly sessionId: string; readonly workspaceRoot: string };
  readonly version: string;
  readonly items: readonly SecurityInspectionItem[];
}

export type SecurityInspection = { readonly state: 'ready'; readonly snapshot: SecurityInspectionSnapshot }
  | { readonly state: 'unavailable' | 'stale' };

export interface SecurityInspector {
  read(): SecurityInspection;
  /** Cancellable acquisition for interactive views; direct command reads remain synchronous. */
  readAsync?(signal?: AbortSignal): Promise<SecurityInspection>;
  subscribe(listener: (inspection: SecurityInspection) => void, signal?: AbortSignal): () => void;
}

export interface SecurityInspectionContext {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly liveScanId?: string;
  readonly liveRemediationId?: string;
}

const safe = (text: string): string => neutraliseForDisplay(redactReportText(text, 1200));

function scanItem(scan: ScanRecord, context: SecurityInspectionContext, dispositions: readonly Disposition[]): SecurityInspectionItem {
  const owner = scan.id === context.liveScanId ? 'live' : 'none';
  const orphaned = owner === 'none' && (scan.status === 'running' || scan.status === 'permission-pending');
  const status = orphaned ? 'unknown' : scan.status;
  const dispositionByFingerprint = new Map(dispositions.filter(item => item.scanId === scan.id).map(item => [item.fingerprint, item.state]));
  const detail = [
    `Scan ${scan.id}`,
    `Status: ${status}${orphaned ? ' (no live local owner; no automatic replay)' : ''}`,
    `Origin: ${scan.origin}; persistence: ${scan.durability ?? 'persisted'}`,
    `Analyzer: ${safe(scan.plan.version)}; rules digest: ${safe(scan.plan.rules.digest)}`,
    `Coverage: ${scan.coverage.status}; findings: ${scan.findings.length}`,
    ...scan.coverage.notes.slice(0, 8).map(note => safe(note)),
    ...scan.findings.slice(0, 20).map(finding => safe(`${finding.severity} ${finding.rule} ${finding.path}:${finding.line} ${finding.fingerprint}: ${finding.message}; disposition: ${dispositionByFingerprint.get(finding.fingerprint) ?? 'open'}`)),
    ...(scan.findings.length > 20 ? [`${scan.findings.length - 20} additional findings are retained.`] : []),
    ...(scan.receipts.length ? [`Execution receipts: ${scan.receipts.length}`] : []),
    ...(scan.verificationOf ? [`Verification of: ${scan.verificationOf}`] : []),
    safe(scan.note),
  ];
  return { identity: `${context.sessionId}/scan/${scan.id}`, kind: 'scan', id: scan.id, targetId: scan.id,
    status, durability: scan.durability ?? 'persisted', owner, summary: `${status} · ${scan.findings.length} findings`, detail: detail.map(safe) };
}

function remediationItem(remediation: Remediation, context: SecurityInspectionContext): SecurityInspectionItem {
  const owner = remediation.id === context.liveRemediationId ? 'live' : 'none';
  const orphaned = owner === 'none' && remediation.status === 'permission-pending';
  const knownStatus = ['proposed', 'permission-pending', 'denied', 'blocked', 'applied', 'partial', 'unknown', 'verified'].includes(remediation.status);
  const status = orphaned || !knownStatus ? 'unknown' : remediation.status;
  const detail = [
    `Remediation ${remediation.id}`,
    `Target scan: ${remediation.scanId}`,
    `Fingerprint: ${remediation.fingerprint}`,
    `Status: ${status}${orphaned ? ' (no live owner; no automatic replay)' : ''}`,
    `Persistence: ${remediation.durability ?? 'persisted'}`,
    `Proposal digest: ${remediation.digest}`,
    ...(remediation.operationId ? [`Operation: ${remediation.operationId}`] : []),
    ...(remediation.verificationId ? [`Verification: ${remediation.verificationId}`] : []),
    safe(remediation.preview),
  ];
  return { identity: `${context.sessionId}/remediation/${remediation.id}`, kind: 'remediation', id: remediation.id,
    targetId: remediation.scanId, status, durability: remediation.durability ?? 'persisted', owner,
    summary: safe(`${status} · ${remediation.fingerprint.slice(0, 12)}`), detail: detail.map(safe) };
}

export function securityInspection(
  state: SecurityState,
  context: SecurityInspectionContext,
  signal?: AbortSignal,
): SecurityInspectionSnapshot {
  signal?.throwIfAborted();
  admitJsonSource([context, state], 8 * 1024 * 1024);
  signal?.throwIfAborted();
  return projectSecurityInspection(state, context, signal);
}

/** Interactive acquisition yields around the bounded source admission and synchronous hash. */
export async function securityInspectionAsync(
  state: SecurityState,
  context: SecurityInspectionContext,
  signal?: AbortSignal,
): Promise<SecurityInspectionSnapshot> {
  await yieldForAbort(signal);
  admitJsonSource([context, state], 8 * 1024 * 1024);
  await yieldForAbort(signal);
  const snapshot = projectSecurityInspection(state, context, signal);
  await yieldForAbort(signal);
  return snapshot;
}

function projectSecurityInspection(
  state: SecurityState,
  context: SecurityInspectionContext,
  signal?: AbortSignal,
): SecurityInspectionSnapshot {
  signal?.throwIfAborted();
  if (state.scans.length + state.remediations.length > 96) throw new Error('Retained diagnostics exceed source limits.');
  const items: SecurityInspectionItem[] = [];
  for (const scan of state.scans) {
    signal?.throwIfAborted();
    items.push(scanItem(scan, context, state.dispositions));
  }
  for (const remediation of state.remediations) {
    signal?.throwIfAborted();
    items.push(remediationItem(remediation, context));
  }
  signal?.throwIfAborted();
  const version = createHash('sha256').update(JSON.stringify([context, state])).digest('hex');
  signal?.throwIfAborted();
  return { identity: { sessionId: context.sessionId, workspaceRoot: context.workspaceRoot }, version, items };
}

/** Only unpersisted observed effects override fresh storage in an inspector. */
export function inspectionState(
  saved: SecurityState,
  scans: Iterable<ScanRecord>,
  remediations: Iterable<Remediation>,
  signal?: AbortSignal,
): SecurityState {
  signal?.throwIfAborted();
  const observedScans = new Map(saved.scans.map(scan => [scan.id, scan]));
  const observedRemediations = new Map(saved.remediations.map(item => [item.id, item]));
  if (observedScans.size + observedRemediations.size > 96) throw new Error('Retained diagnostics exceed source limits.');
  for (const scan of scans) {
    signal?.throwIfAborted();
    if (scan.durability !== 'unknown') continue;
    observedScans.set(scan.id, scan);
    if (observedScans.size + observedRemediations.size > 96) throw new Error('Retained diagnostics exceed source limits.');
  }
  for (const remediation of remediations) {
    signal?.throwIfAborted();
    if (remediation.durability !== 'unknown') continue;
    observedRemediations.set(remediation.id, remediation);
    if (observedScans.size + observedRemediations.size > 96) throw new Error('Retained diagnostics exceed source limits.');
  }
  signal?.throwIfAborted();
  return { ...saved, scans: [...observedScans.values()], remediations: [...observedRemediations.values()] };
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}
