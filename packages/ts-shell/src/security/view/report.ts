import type { LocalCommandResult } from '../../core/commands/types.js';
import type { ReportValue } from '../../core/commands/report/contract.js';
import { redactReportText } from '../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import type { Finding, ScanRecord } from '../analysis/model.js';

export function securityReport(title: string, lines: readonly string[], facts: Record<string, ReportValue> = {}): LocalCommandResult {
  const safe = lines.map(line => neutraliseForDisplay(redactReportText(line, 20_000, { preserveLines: true })));
  return { kind: 'local', output: safe.join('\n'), report: { version: 1, title, facts,
    lines: safe.map(text => ({ kind: 'text', spans: [{ text, role: 'text' }] })) } };
}
export function scanReport(scan: ScanRecord, orphaned = false): LocalCommandResult {
  const status = orphaned ? 'unknown' : scan.status;
  return securityReport('Security scan', [`Scan: ${scan.id}`, `Status: ${status}${orphaned ? ' (no live local owner; no automatic replay)' : ''}`,
    scan.note, `Persistence: ${scan.durability ?? 'persisted'}`, `Origin: ${scan.origin}; analyzer ${scan.plan.version}; rules SHA-256 ${scan.plan.rules.digest}`,
    `Coverage: ${scan.coverage.status}; observed ${scan.coverage.scanned.length}/${scan.plan.sources.length} selected files`,
    ...scan.coverage.notes, `Findings: ${scan.findings.length}. Dispositions preserve original evidence.`,
    'This selected-rule/file analysis does not prove the repository secure.'], { scanId: scan.id, status, origin: scan.origin,
      findings: scan.findings.length, coverage: scan.coverage.status, durability: scan.durability ?? 'persisted', failureClass: scan.failureClass ?? null, planFingerprint: scan.plan.fingerprint });
}
export function sortedFindings(findings: readonly Finding[]): Finding[] {
  const order = ['error', 'warning', 'note', 'none'];
  return [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule) || a.occurrence.localeCompare(b.occurrence));
}
