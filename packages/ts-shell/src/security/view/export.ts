import path from 'node:path';
import { createPatchToolDefinition } from '../../edit/patch/tool.js';
import type { ToolDefinition } from '../../tools/types.js';
import { redactExportText } from '../../core/security/redaction.js';
import { digest } from '../analysis/source.js';
import type { ScanRecord, SecurityState } from '../analysis/model.js';

/** Redact values before serialization so credential patterns cannot consume JSON syntax. */
function redactData(value: unknown, budget: { nodes: number }, depth = 0): unknown {
  if (++budget.nodes > 100_000 || depth > 24) throw new Error('Complete security export exceeds its structural budget.');
  if (typeof value === 'string') return redactExportText(value);
  if (Array.isArray(value)) return value.map(item => redactData(item, budget, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactData(item, budget, depth + 1)]));
  return value;
}
export function exportReport(scan: ScanRecord, state: SecurityState): string {
  const relative = (absolute: string) => path.relative(scan.plan.root, absolute).split(path.sep).map(encodeURIComponent).join('/');
  const report = { version: '2.1.0', runs: [{ tool: { driver: { name: 'Opengrep OSS', semanticVersion: scan.plan.version,
    rules: [...new Set(scan.findings.map(item => item.rule))].map(id => ({ id })) } },
    invocations: [{ executionSuccessful: scan.status === 'completed' }],
    results: scan.findings.map(finding => ({ ruleId: finding.rule, level: finding.severity, message: { text: finding.message },
      fingerprints: { 'cheersSemantic/v1': finding.fingerprint }, properties: { occurrence: finding.occurrence, evidenceDigest: finding.evidenceDigest, sourceDigest: finding.sourceDigest },
      locations: [{ physicalLocation: { artifactLocation: { uri: relative(finding.path) }, region: { startLine: finding.line,
        ...(finding.column ? { startColumn: finding.column } : {}), ...(finding.endLine ? { endLine: finding.endLine } : {}) } } }] })),
    properties: { security: { origin: scan.origin, scanId: scan.id, status: scan.status, planFingerprint: scan.plan.fingerprint,
      ruleDigest: scan.plan.rules.digest, analyzerDigest: scan.plan.executable.digest, sourceDigest: scan.plan.sourceDigest,
      sources: scan.plan.sources.map(source => ({ path: relative(source.path), digest: source.digest })), reportDigest: scan.reportDigest,
      coverage: { ...scan.coverage, scanned: scan.coverage.scanned.map(relative), missing: scan.coverage.missing.map(relative) },
      dispositions: state.dispositions.filter(item => item.scanId === scan.id),
      remediations: state.remediations.filter(item => item.scanId === scan.id).map(item => ({ id: item.id, fingerprint: item.fingerprint,
        status: item.status, patchDigest: item.digest, operationId: item.operationId, verificationId: item.verificationId })),
      notProvenClaims: ['Exported/imported status is not local remediation proof.', 'No whole-repository security claim.'] } } }] };
  const text = JSON.stringify(redactData(report, { nodes: 0 }), null, 2) + '\n';
  if (Buffer.byteLength(text) > 512 * 1024) throw new Error('Complete security export exceeds its 512 KiB budget; no truncated export was written.');
  return text;
}
export function exportTool(root: string, target: string, content: string): { tool: ToolDefinition; args: Record<string, unknown>; digest: string } {
  const relative = path.relative(root, path.resolve(root, target));
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || /[\r\n\0]/.test(relative)) throw new Error('Security export must select one new workspace file.');
  const input = ['*** Begin Patch', `*** Add File: ${relative}`, ...content.trimEnd().split('\n').map(line => '+' + line), '*** End Patch'].join('\n');
  return { tool: createPatchToolDefinition(), args: { input }, digest: digest(content) };
}
