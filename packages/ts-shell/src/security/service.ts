import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LocalCommandResult } from '../core/commands/types.js';
import type { ToolGateOptions } from '../turn/tools.js';
import { preparationContext } from '../turn/preparation.js';
import { redactReportText } from '../core/security/redaction.js';
import { prepareScan, planPreview, recheckPlan, reprepareScan } from './analysis/plan.js';
import type { ScanRecord, SecurityState } from './analysis/model.js';
import { unknownCoverage } from './analysis/model.js';
import { parseSarif } from './analysis/sarif.js';
import { analyzerTool } from './analysis/native.js';
import { readSecurityInput } from './analysis/read.js';
import { runSecurityTool } from './analysis/gate.js';
import { type SecurityStore } from './findings/store.js';
import { compareScans } from './findings/comparison.js';
import { prepareRemediation, remediationTool } from './remediation/proposal.js';
import { verifiesRemediation } from './remediation/verification.js';
import { securityReport, scanReport, sortedFindings } from './view/report.js';
import { exportReport, exportTool } from './view/export.js';
import { SecurityPublication } from './findings/publication.js';
import { inspectionState, securityInspection, type SecurityInspectionSnapshot } from './view/inspection.js';
import type { ExecutionService } from '../runtime/execution/types.js';
import { readOperation, captureOperationScope } from '../edit/recovery/operation/store.js';

export interface SecurityHost {
  readonly sessionId: string;
  readonly store: SecurityStore; readonly root: () => string; readonly homeParent: () => string;
  readonly gate: (tool?: 'bash' | 'apply_patch' | 'security_propose') => ToolGateOptions; readonly busy: () => boolean; readonly sourceAccess: (absolute: string) => void;
  readonly execution?: ExecutionService;
}
export class SecurityService {
  private active?: { readonly id: string; readonly controller: AbortController };
  private applying?: string;
  readonly publication: SecurityPublication;
  constructor(readonly host: SecurityHost) { this.publication = new SecurityPublication(host.store); }
  state(): SecurityState { const state = this.host.store.read(); return { ...state,
    scans: state.scans.map(item => this.publication.scans.get(item.id) ?? item),
    remediations: state.remediations.map(item => this.publication.remediations.get(item.id) ?? item) }; }
  inspection(): SecurityInspectionSnapshot {
    const state = inspectionState(this.host.store.read(), this.publication.scans.values(), this.publication.remediations.values());
    return securityInspection(state, { sessionId: this.host.sessionId, workspaceRoot: this.host.root(), liveScanId: this.active?.id, liveRemediationId: this.applying });
  }
  inspectionRevision(): string | undefined {
    const source = this.host.store.revision?.();
    return source === undefined ? undefined : JSON.stringify([source, this.host.root(), this.publication.revision, this.active?.id, this.applying]);
  }
  subscribeInspection(listener: () => void): () => void {
    return this.publication.subscribe(listener);
  }
  plan(executable: string, version: string, rules: string, files: readonly string[]): LocalCommandResult {
    this.assertIdle(); const plan = prepareScan({ root: this.host.root(), executable, version, rules, files,
      home: path.join(this.host.homeParent(), `security-${randomUUID()}`), sourceAccess: this.host.sourceAccess });
    const scan: ScanRecord = { id: plan.id, createdAt: new Date().toISOString(), origin: 'local', plan, status: 'planned',
      note: 'Frozen preview only; no analyzer has run.', findings: [], coverage: unknownCoverage, receipts: [] };
    this.publication.scan(scan);
    return securityReport('Security plan', planPreview(plan).split('\n'), { scanId: plan.id, planId: plan.id, status: 'planned', planFingerprint: plan.fingerprint });
  }
  async scan(id: string, verificationOf?: string): Promise<LocalCommandResult> {
    this.assertIdle(); const scan = this.scanRecord(id);
    if (scan.status !== 'planned' || scan.origin !== 'local') throw new Error('Only an unexecuted local plan can be scanned. Create a new plan or explicitly validate; no automatic replay.');
    if (path.dirname(scan.plan.env.HOME!) !== this.host.homeParent()) throw new Error('Security runtime home does not match this session.');
    const options = this.host.gate(); this.active = { id, controller: new AbortController() };
    try {
      const pending = { ...scan, ...(verificationOf ? { verificationOf } : {}), status: 'permission-pending' as const,
        note: 'Frozen scan is awaiting its ordinary execution approval.' }; this.publication.scan(pending);
      const tool = analyzerTool(pending, next => this.publication.scan(next), this.host.execution);
      await runSecurityTool(tool, { command: `security scan ${id} ${scan.plan.fingerprint}` }, options, this.active.controller.signal, id);
      const observed = this.publication.scans.get(id) ?? this.scanRecord(id);
      if (['permission-pending', 'running'].includes(observed.status)) {
        this.publication.scan({ ...observed, status: 'unknown', note: 'Analyzer result publication was not confirmed; inspect retained execution receipts before retrying.' });
      }
      return scanReport(this.publication.scans.get(id) ?? this.scanRecord(id));
    } finally { this.active = undefined; this.publication.notify(); }
  }
  status(id?: string): LocalCommandResult {
    const scan = this.publication.scans.get(id ?? '') ?? this.scanRecord(id); return scanReport(scan, ['running', 'permission-pending'].includes(scan.status) && this.active?.id !== scan.id);
  }
  cancel(id?: string): LocalCommandResult {
    if (!this.active || id && this.active.id !== id) return securityReport('Security cancellation', ['No matching live local security scan. Retained unknown work is not replayed or declared stopped.'], { status: 'no-live-owner' });
    this.active.controller.abort(); return securityReport('Security cancellation', ['Cancellation requested; process cleanup and final execution evidence are pending.'], { scanId: this.active.id, status: 'cancellation-requested' });
  }
  scans(): LocalCommandResult {
    return securityReport('Security scan history', this.state().scans.map(scan => `${scan.id} ${['running', 'permission-pending'].includes(scan.status) && this.active?.id !== scan.id ? 'unknown (no live owner)' : scan.status} ${scan.origin} findings=${scan.findings.length} coverage=${scan.coverage.status}`),
      { scanIds: this.state().scans.map(scan => scan.id) });
  }
  show(id: string, fingerprint?: string): LocalCommandResult {
    const scan = this.scanRecord(id); const state = this.state();
    const findings = sortedFindings(scan.findings.filter(item => !fingerprint || item.fingerprint === fingerprint));
    if (fingerprint && !findings.length) throw new Error('Finding fingerprint was not found.');
    return securityReport('Security findings', findings.flatMap(item => {
      const history = state.dispositions.filter(entry => entry.scanId === scan.id && entry.fingerprint === item.fingerprint);
      const remediation = state.remediations.filter(entry => entry.scanId === scan.id && entry.fingerprint === item.fingerprint).at(-1);
      return [`${item.severity} ${item.rule} ${JSON.stringify(path.relative(scan.plan.root, item.path))}:${item.line}${item.column ? ':' + item.column : ''}`,
        `Fingerprint: ${item.fingerprint}; occurrence: ${item.occurrence}`, item.message,
        `Evidence SHA-256: ${item.evidenceDigest}; source SHA-256: ${item.sourceDigest}`, `Disposition: ${history.at(-1)?.state ?? 'open'}`,
        ...history.map(entry => `${entry.at}: ${entry.state}; reason: ${entry.reason}`), `Remediation: ${remediation?.status ?? 'unverified'}${remediation?.id ? ' ' + remediation.id : ''}`];
    }), { scanId: scan.id, fingerprints: findings.map(item => item.fingerprint), occurrences: findings.map(item => item.occurrence) });
  }
  async importReport(selected: string, id: string): Promise<LocalCommandResult> {
    this.assertIdle(); const original = this.scanRecord(id); recheckPlan(original.plan, this.host.sourceAccess);
    const text = await readSecurityInput(original.plan.root, selected, this.host.sourceAccess, this.host.execution);
    recheckPlan(original.plan, this.host.sourceAccess); const parsed = parseSarif(text, original.plan); const importedId = randomUUID();
    const imported: ScanRecord = { ...original, ...parsed, plan: { ...original.plan, id: importedId }, id: importedId, createdAt: new Date().toISOString(),
      origin: 'import', status: 'partial', receipts: [], coverage: { ...unknownCoverage, notes: [...parsed.notes, 'Imported SARIF has no local execution or observed selected-file coverage. Imported fixed/validated claims are untrusted data.'] },
      note: 'Imported analyzer evidence; local source/coverage/remediation are unverified.' };
    this.publication.scan(imported); return scanReport(imported);
  }
  async exportReport(id: string, target: string): Promise<LocalCommandResult> {
    this.assertIdle(); const scan = this.scanRecord(id); const prepared = exportTool(scan.plan.root, target, exportReport(scan, this.state()));
    const result = await runSecurityTool(prepared.tool, prepared.args, this.host.gate('apply_patch'));
    return securityReport('Security export', [result.output, 'Complete export publication requires a committed native edit receipt.'],
      { scanId: scan.id, status: result.metadata?.status === 'committed' ? 'exported' : 'unverified', exportDigest: prepared.digest,
        operationId: typeof result.metadata?.operationId === 'string' ? result.metadata.operationId : null });
  }
  compare(baselineId: string, currentId: string): LocalCommandResult {
    const comparison = compareScans(this.scanRecord(baselineId), this.scanRecord(currentId));
    return securityReport('Security comparison', [comparison.comparable ? 'Same analyzer/rules/selected file scope.' : 'Analyzer/rules/scope differ; comparison is unknown.',
      ...comparison.entries.map(item => `${item.state} ${item.fingerprint}`)], { comparable: comparison.comparable, entries: comparison.entries });
  }
  disposition(id: string, fingerprint: string, decision: 'open' | 'false-positive' | 'accepted-risk', reason: string): LocalCommandResult {
    this.assertIdle(); const scan = this.scanRecord(id);
    if (!['open', 'false-positive', 'accepted-risk'].includes(decision) || !scan.findings.some(item => item.fingerprint === fingerprint) || !reason.trim() || reason.length > 2000) throw new Error('A real finding and explicit bounded disposition reason are required.');
    const safe = redactReportText(reason, 2000); if (!safe) throw new Error('Disposition reason is empty after redaction.');
    this.host.store.write(state => ({ ...state, dispositions: [...state.dispositions, { scanId: id, fingerprint, state: decision, reason: safe, at: new Date().toISOString() }] }));
    this.publication.notify();
    return this.show(id, fingerprint);
  }
  propose(id: string, fingerprint: string, input: string, currentModelCall = false): LocalCommandResult {
    if (currentModelCall) { if (this.active || this.host.gate('security_propose').admission?.()) throw new Error('Security proposal is not admitted for the current request.'); }
    else this.assertIdle();
    const scan = this.scanRecord(id); const finding = scan.findings.find(item => item.fingerprint === fingerprint);
    if (!finding) throw new Error('Select an actual finding before proposing remediation.');
    const proposal = prepareRemediation(scan, finding, input, preparationContext('apply_patch', this.host.gate('apply_patch')));
    this.publication.remediation(proposal);
    return securityReport('Security remediation proposal', [`Proposal: ${proposal.id}; advisory only. No write has run.`, proposal.preview,
      'Apply this exact proposal separately through ordinary patch approval, then validate the finding.'], { proposalId: proposal.id, status: 'proposed', patchDigest: proposal.digest });
  }
  async apply(id: string, fingerprint: string, proposalId: string): Promise<LocalCommandResult> {
    this.assertIdle(); const proposal = this.state().remediations.find(item => item.id === proposalId && item.scanId === id && item.fingerprint === fingerprint);
    if (!proposal || !['proposed', 'denied', 'blocked'].includes(proposal.status)) throw new Error('An uncommitted exact finding proposal is required; applied/unknown work is never replayed.');
    const original = this.scanRecord(id); const finding = original.findings.find(item => item.fingerprint === fingerprint);
    if (original.origin !== 'local' || !finding || Object.keys(proposal.expectedHashes).length !== 1 || Object.keys(proposal.afterHashes).length !== 1
      || proposal.expectedHashes[finding.path] !== finding.sourceDigest || !proposal.afterHashes[finding.path]) throw new Error('Security patch authorization no longer matches its native finding.');
    this.applying = proposal.id;
    try {
      const pending = { ...proposal, status: 'permission-pending' as const }; this.publication.remediation(pending);
      const result = await runSecurityTool(remediationTool(proposal, next => this.publication.remediation(next)),
        { input: proposal.input, expectedHashes: proposal.expectedHashes }, this.host.gate('apply_patch'), undefined, proposal.id);
      const observed = this.state().remediations.find(item => item.id === proposalId)!;
      if (observed.status === 'permission-pending') this.publication.remediation({ ...observed, status: 'unknown' });
      return securityReport('Security patch', [result.output, 'Applied and native verified are separate states.'], { proposalId, status: this.state().remediations.find(item => item.id === proposalId)!.status });
    } finally { this.applying = undefined; this.publication.notify(); }
  }
  async validate(id: string, fingerprint?: string): Promise<LocalCommandResult> {
    this.assertIdle(); const original = this.scanRecord(id);
    if (fingerprint && !original.findings.some(item => item.fingerprint === fingerprint)) throw new Error('Finding fingerprint was not found.');
    const plan = reprepareScan(original.plan, this.host.sourceAccess);
    const verification: ScanRecord = { id: plan.id, createdAt: new Date().toISOString(), origin: 'local', plan, status: 'planned', findings: [], coverage: unknownCoverage,
      receipts: [], note: 'Explicit same-rule/scope/version reanalysis has not executed.', verificationOf: id };
    this.publication.scan(verification); await this.scan(verification.id, id); const observed = this.publication.scans.get(verification.id) ?? this.scanRecord(verification.id);
    let currentProof = false;
    try {
      if (this.host.gate('bash').admission?.()) throw new Error('admission');
      recheckPlan(observed.plan, this.host.sourceAccess); currentProof = true;
    } catch { /* Post-tool hooks may invalidate historical native observations. */ }
    for (const proposal of this.state().remediations.filter(item => item.scanId === id && (!fingerprint || item.fingerprint === fingerprint))) {
      if (!currentProof || !proposal.operationId) continue;
      try { const receipt = readOperation(captureOperationScope({ sessionId: this.host.gate().sessionId, workspaceRoot: original.plan.root }), proposal.operationId);
        if (this.host.gate('bash').admission?.()) throw new Error('admission');
        recheckPlan(observed.plan, this.host.sourceAccess);
        if (verifiesRemediation(original, observed, proposal, receipt)) this.publication.remediation({ ...proposal, status: 'verified', verificationId: observed.id }); }
      catch { currentProof = false; /* Unavailable/stale current proof cannot establish fixed. */ }
    }
    return securityReport('Security verification', [scanReport(observed).output,
      ...(currentProof ? [] : ['Current verification refused: source, rules, analyzer, workspace, grants or native receipt changed after observation. Historical scan evidence is retained.']),
      ...this.state().remediations.filter(item => item.scanId === id && (!fingerprint || item.fingerprint === fingerprint)).map(item => `${item.fingerprint}: ${item.status}`)],
      { scanId: observed.id, verificationOf: id, status: currentProof ? observed.status : 'unverified', verificationStatus: currentProof ? 'current' : 'unverified', coverage: observed.coverage.status,
        verifiedProposalIds: this.state().remediations.filter(item => item.verificationId === observed.id && item.status === 'verified').map(item => item.id) });
  }
  scanRecord(id?: string): ScanRecord { const scans = this.state().scans; const scan = id ? scans.find(item => item.id === id) : scans.at(-1);
    if (!scan) throw new Error('Security scan was not found in this bound session.'); return scan; }
  assertIdle(): void { if (this.active || this.host.busy()) throw new Error('Another session operation is active; security mutations are blocked.'); }
}
