import type { RuntimeExecutionReceiptProjection } from '../../runtime/execution/types.js';

export interface SourceSnapshot { readonly path: string; readonly digest: string; readonly identity: string; readonly bytes: number }
export interface ScanPlan {
  readonly id: string; readonly root: string; readonly rootIdentity: string;
  readonly executable: SourceSnapshot; readonly version: string; readonly rules: SourceSnapshot;
  readonly sources: readonly SourceSnapshot[]; readonly sourceDigest: string;
  readonly env: Readonly<Record<string, string>>; readonly argv: readonly (readonly string[])[];
  readonly fingerprint: string;
}
export interface Finding {
  readonly fingerprint: string; readonly occurrence: string; readonly rule: string;
  readonly path: string; readonly line: number; readonly column?: number; readonly endLine?: number;
  readonly severity: 'error' | 'warning' | 'note' | 'none'; readonly message: string;
  readonly evidenceDigest: string; readonly sourceDigest: string;
}
export interface Coverage { readonly status: 'complete' | 'partial' | 'unknown'; readonly scanned: readonly string[]; readonly missing: readonly string[]; readonly notes: readonly string[] }
export type ScanStatus = 'planned' | 'permission-pending' | 'running' | 'completed' | 'partial' | 'denied' | 'blocked' | 'failed' | 'timeout' | 'cancelled' | 'unknown';
export interface ScanRecord {
  readonly durability?: 'unknown';
  readonly failureClass?: 'analyzer-unavailable' | 'version-mismatch' | 'input-changed' | 'report-invalid' | 'output-limit' | 'execution-failed';
  readonly id: string; readonly createdAt: string; readonly origin: 'local' | 'import'; readonly plan: ScanPlan;
  readonly status: ScanStatus; readonly note: string; readonly findings: readonly Finding[]; readonly coverage: Coverage;
  readonly receipts: readonly RuntimeExecutionReceiptProjection[]; readonly reportDigest?: string;
  readonly verificationOf?: string;
}
export interface Disposition { readonly scanId: string; readonly fingerprint: string; readonly state: 'open' | 'false-positive' | 'accepted-risk'; readonly reason: string; readonly at: string }
export interface Remediation {
  readonly durability?: 'unknown';
  readonly id: string; readonly scanId: string; readonly fingerprint: string; readonly input: string;
  readonly digest: string; readonly expectedHashes: Readonly<Record<string, string>>;
  readonly afterHashes: Readonly<Record<string, string>>; readonly preview: string;
  readonly status: 'proposed' | 'permission-pending' | 'denied' | 'blocked' | 'applied' | 'partial' | 'unknown' | 'verified';
  readonly operationId?: string; readonly verificationId?: string;
}
export interface SecurityState { readonly version: 1; readonly scans: readonly ScanRecord[]; readonly dispositions: readonly Disposition[]; readonly remediations: readonly Remediation[] }
export const unknownCoverage: Coverage = Object.freeze({ status: 'unknown', scanned: [], missing: [], notes: ['Coverage has not been observed.'] });
