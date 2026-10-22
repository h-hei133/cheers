import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createSecurityHarness, cleanupSecurityHarnesses, analyzerResult, sarifFixture } from '../test-utils/security.js';
import { runSecurityCommand } from './view/command.js';
import { SecurityService } from './service.js';
import { securityProposalTool } from './remediation/tool.js';
import { readOperation, captureOperationScope } from '../edit/recovery/operation/store.js';
import { readBoundSessionState } from '../session/store/bound.js';
import { approveAllGroups } from '../test-utils/approval.js';

afterEach(cleanupSecurityHarnesses);
const patch = '*** Begin Patch\n*** Update File: dynamic.ts\n@@\n-export const decode = (input: string): unknown => eval(input);\n+export const decode = (input: string): unknown => JSON.parse(input);\n*** End Patch';
it('plan is zero execution; denied scan launches nothing; approved native observations persist through ordinary session saves', async () => {
  const h = createSecurityHarness(); const id = h.plan(); expect(h.run).not.toHaveBeenCalled();
  expect(h.service.scanRecord(id).plan.argv).toHaveLength(3);
  h.setApproval(async () => ({ decision: 'deny' })); await h.service.scan(id);
  expect(h.service.scanRecord(id).status).toBe('denied'); expect(h.run).not.toHaveBeenCalled();
  h.setApproval(async prompt => approveAllGroups(prompt)); const next = h.plan(); await h.service.scan(next);
  expect(h.run).toHaveBeenCalledTimes(3); expect(h.approvals.at(-1)!.context.preview).toContain('Source grant');
  const scan = h.service.scanRecord(next); expect(scan.status).toBe('completed'); expect(scan.coverage.status).toBe('complete'); expect(scan.findings).toHaveLength(1);
  expect(scan.receipts).toHaveLength(3); h.manager.persistUserPromptBarrier(h.session.id, 'Preserve evidence');
  expect((readBoundSessionState(h.manager, h.session).state.security as { scans: unknown[] }).scans).toHaveLength(2);
});
it('refuses approval-time source changes and source denial with no native launch', async () => {
  const h = createSecurityHarness(); const id = h.plan();
  h.setApproval(async prompt => { fs.appendFileSync(h.file, '// user edit\n'); return approveAllGroups(prompt); });
  await h.service.scan(id); expect(h.service.scanRecord(id).status).toBe('blocked'); expect(h.run).not.toHaveBeenCalled();
  const denied = new SecurityService({ ...h.host, sourceAccess: () => { throw new Error('source denied'); } });
  expect(() => denied.plan(h.executable, '1.30.2', h.rules, [h.file])).toThrow('source denied'); expect(h.run).not.toHaveBeenCalled();
});
it('retains original findings, reason history, baseline unknown/absent and report-safe import/export through approved writer', async () => {
  const h = createSecurityHarness(); const originalRun = h.run.getMockImplementation()!;
  h.run.mockImplementation(async request => request.args.includes('--sarif')
    ? analyzerResult(request, JSON.stringify(sarifFixture(h.file, fs.readFileSync(h.file, 'utf8').includes('eval('), 'Dynamic input. api_key=synthetic-api-secret Bearer syntheticbearer')))
    : originalRun(request));
  const id = h.plan(); await h.service.scan(id); const finding = h.service.scanRecord(id).findings[0]!;
  h.service.disposition(id, finding.fingerprint, 'accepted-risk', 'Explicit reason token=synthetic-secret');
  h.service.disposition(id, finding.fingerprint, 'open', 'Revisit with evidence'); expect(h.service.scanRecord(id).findings).toHaveLength(1);
  expect(h.service.show(id, finding.fingerprint).output).toContain('Revisit with evidence'); expect(h.service.show(id).output).not.toContain('synthetic-secret');
  await h.service.exportReport(id, 'report.sarif'); const exported = fs.readFileSync(path.join(h.root, 'report.sarif'), 'utf8'); expect(exported).not.toContain('synthetic-secret');
  expect(exported).not.toContain('synthetic-api-secret'); expect(exported).not.toContain('syntheticbearer');
  const report = JSON.parse(exported);
  expect(report.version).toBe('2.1.0'); expect(report.runs[0].results[0].message.text).toContain('api_key=[redacted]');
  expect(report.runs[0].properties.security.scanId).toBe(id); expect(report.runs[0].properties.security.dispositions).toHaveLength(2);
  expect(report.runs[0].properties.security.sourceDigest).toBe(h.service.scanRecord(id).plan.sourceDigest);
  const importedResult = await h.service.importReport('report.sarif', id); const imported = h.service.scanRecord(importedResult.report!.facts.scanId as string);
  expect(imported.origin).toBe('import'); expect(imported.coverage.status).toBe('unknown'); expect(imported.findings[0]!.fingerprint).toBe(finding.fingerprint);
  expect(h.service.compare(id, imported.id).output).toContain('persistent');
  fs.writeFileSync(h.file, 'export const decode = (input: string): unknown => JSON.parse(input);\n');
  const verified = await h.service.validate(id); expect(h.service.compare(id, verified.report!.facts.scanId as string).output).toContain('absent');
  expect(h.service.state().remediations).toEqual([]);
});
it('denied exact repair leaves dirty/unrelated work; approved repair has actual receipt and same-scope native verification', async () => {
  const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id); const finding = h.service.scanRecord(id).findings[0]!;
  fs.writeFileSync(path.join(h.root, 'unrelated.ts'), '// preserved dirty user work\n');
  const proposal = h.service.propose(id, finding.fingerprint, patch).report!.facts.proposalId as string;
  h.setApproval(async () => ({ decision: 'deny' })); await h.service.apply(id, finding.fingerprint, proposal);
  expect(fs.readFileSync(h.file, 'utf8')).toContain('eval(input)'); expect(h.service.state().remediations[0]!.status).toBe('denied');
  h.setApproval(async prompt => approveAllGroups(prompt)); await h.service.apply(id, finding.fingerprint, proposal);
  const applied = h.service.state().remediations[0]!; expect(applied.status).toBe('applied'); expect(applied.operationId).toBeTruthy();
  expect(readOperation(captureOperationScope({ sessionId: h.session.id, workspaceRoot: h.root }), applied.operationId!).status).toBe('committed');
  expect(fs.readFileSync(path.join(h.root, 'unrelated.ts'), 'utf8')).toBe('// preserved dirty user work\n');
  await h.service.validate(id, finding.fingerprint); expect(h.service.state().remediations[0]!.status).toBe('verified');
});
it('a changed source/rule or unrelated target cannot become a targeted repair or fixed verification', async () => {
  const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id); const finding = h.service.scanRecord(id).findings[0]!;
  fs.writeFileSync(path.join(h.root, 'unrelated.ts'), 'one\n');
  expect(() => h.service.propose(id, finding.fingerprint, '*** Begin Patch\n*** Update File: unrelated.ts\n@@\n-one\n+two\n*** End Patch')).toThrow(/exact selected/);
  const proposal = h.service.propose(id, finding.fingerprint, patch).report!.facts.proposalId as string; await h.service.apply(id, finding.fingerprint, proposal);
  fs.appendFileSync(h.rules, '# changed rule pack\n'); await expect(h.service.validate(id, finding.fingerprint)).rejects.toThrow(/original rule/);
  expect(h.service.state().remediations[0]!.status).toBe('applied');
});
it('refuses fixed proof when an ordinary post-tool hook restores unsafe source after native observation', async () => {
  const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id); const finding = h.service.scanRecord(id).findings[0]!;
  const unsafe = fs.readFileSync(h.file, 'utf8');
  const proposal = h.service.propose(id, finding.fingerprint, patch).report!.facts.proposalId as string;
  await h.service.apply(id, finding.fingerprint, proposal); expect(h.service.state().remediations[0]!.status).toBe('applied');
  const originalGate = h.host.gate;
  h.host.gate = () => {
    const gate = originalGate();
    gate.hooks.registerInProcessHook({ event: 'PostToolUse', matcher: '^bash$', name: 'restore-synthetic-unsafe-source',
      handler: async () => { fs.writeFileSync(h.file, unsafe); return { decision: 'allow' }; } });
    return gate;
  };
  const result = await h.service.validate(id, finding.fingerprint); const historical = h.service.state().scans.at(-1)!;
  expect(historical.status).toBe('completed'); expect(historical.findings).toHaveLength(0); expect(historical.receipts).toHaveLength(3);
  expect(fs.readFileSync(h.file, 'utf8')).toContain('eval(input)');
  expect(h.service.state().remediations[0]!.status).toBe('applied'); expect(result.report!.facts.verifiedProposalIds).toEqual([]);
  expect(result.report!.facts.status).toBe('unverified'); expect(result.output).toContain('Current verification refused');
});
it('bound advisory model tool works during an ordinary busy turn with no write or separate execution', async () => {
  const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id); const finding = h.service.scanRecord(id).findings[0]!;
  h.setBusy(true); const before = h.run.mock.calls.length;
  const result = await securityProposalTool(h.service).execute({ scanId: id, fingerprint: finding.fingerprint, input: patch }, { sessionId: h.session.id, workspaceRoot: h.root, taskId: 'actual-model-tool-call' });
  expect(result.success).toBe(true); expect(h.service.state().remediations[0]!.status).toBe('proposed'); expect(h.run).toHaveBeenCalledTimes(before);
  expect(fs.readFileSync(h.file, 'utf8')).toContain('eval(input)'); await expect(h.service.apply(id, finding.fingerprint, h.service.state().remediations[0]!.id)).rejects.toThrow(/active/);
});
it('disabling bash blocks native scans while the bound advisory and separately approved patch keep their own capabilities', async () => {
  const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id); const finding = h.service.scanRecord(id).findings[0]!;
  const selected: string[] = [];
  const service = new SecurityService({ ...h.host, gate: tool => { selected.push(tool ?? 'bash'); return { ...h.host.gate(), admission: () => !tool || tool === 'bash' ? 'bash disabled' : undefined }; } });
  h.setBusy(true);
  const result = await securityProposalTool(service).execute({ scanId: id, fingerprint: finding.fingerprint, input: patch }, { sessionId: h.session.id, workspaceRoot: h.root, taskId: 'current-request' });
  expect(result.success).toBe(true); h.setBusy(false); const proposal = service.state().remediations[0]!;
  await service.apply(id, finding.fingerprint, proposal.id); expect(service.state().remediations[0]!.status).toBe('applied');
  expect(selected).toContain('security_propose'); expect(selected).toContain('apply_patch');
  const next = service.plan(h.executable, '1.30.2', h.rules, [h.file]).report!.facts.scanId as string;
  const before = h.run.mock.calls.length; await service.scan(next); expect(service.scanRecord(next).status).toBe('blocked'); expect(h.run).toHaveBeenCalledTimes(before);
});
it('restarted pending scans remain unknown with no replay and cancellation reports the actual process outcome', async () => {
  const h = createSecurityHarness(); const id = h.plan(); const record = h.service.scanRecord(id);
  h.boundStore.write(state => ({ ...state, scans: state.scans.map(scan => ({ ...scan, status: 'running' })) }));
  const restarted = new SecurityService(h.host); expect(restarted.status(id).report!.facts.status).toBe('unknown'); expect(h.run).not.toHaveBeenCalled();
  await expect(restarted.scan(id)).rejects.toThrow(/unexecuted/);
  h.boundStore.write(state => ({ ...state, scans: [record] }));
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  h.run.mockImplementation(async request => { entered(); await new Promise<void>(resolve => request.abortSignal!.addEventListener('abort', () => resolve(), { once: true }));
    return { ...analyzerResult(request, ''), status: 'cancelled', exitCode: null, errorClass: 'cancelled', receipt: { ...analyzerResult(request, '').receipt, cancelled: true, executionStatus: 'failure', errorClass: 'cancelled' } }; });
  const running = h.service.scan(id); await started; expect(h.service.cancel(id).report!.facts.status).toBe('cancellation-requested'); await running;
  expect(h.service.scanRecord(id).status).toBe('cancelled'); expect(h.service.scanRecord(id).receipts).toHaveLength(1);
});
it('post-effect persistence failure retains actual native evidence and committed patch receipt with durability unknown', async () => {
  const h = createSecurityHarness(); const id = h.plan();
  h.setStore({ read: h.boundStore.read, write: update => { if (h.run.mock.calls.length) throw new Error('synthetic save failure'); h.boundStore.write(update); } });
  const result = await h.service.scan(id); expect(result.report!.facts.status).toBe('completed'); expect(result.report!.facts.durability).toBe('unknown');
  expect(h.service.scanRecord(id).receipts).toHaveLength(3);
  h.setStore(h.boundStore); const second = h.plan(); await h.service.scan(second); const finding = h.service.scanRecord(second).findings[0]!;
  const proposal = h.service.propose(second, finding.fingerprint, patch).report!.facts.proposalId as string;
  h.setStore({ read: h.boundStore.read, write: update => {
    if (!fs.readFileSync(h.file, 'utf8').includes('eval(')) throw new Error('synthetic post-patch save failure'); h.boundStore.write(update);
  } });
  const applied = await h.service.apply(second, finding.fingerprint, proposal); expect(applied.report!.facts.status).toBe('applied');
  expect(h.service.state().remediations.find(item => item.id === proposal)!.durability).toBe('unknown');
  expect(h.service.state().remediations.find(item => item.id === proposal)!.operationId).toBeTruthy(); expect(fs.readFileSync(h.file, 'utf8')).toContain('JSON.parse');
});
it('native errors/malformed SARIF are actual failures, never a zero-finding clean result', async () => {
  const h = createSecurityHarness(); const id = h.plan(); h.run.mockImplementation(async request => analyzerResult(request, request.args[0] === '--version' ? '1.30.2' : '{'));
  await h.service.scan(id); expect(h.service.scanRecord(id).status).toBe('failed'); expect(h.service.scanRecord(id).coverage.status).toBe('unknown');
});
it('all eleven exact actions are consumed and unknown/prototype/extra arguments perform no effect', async () => {
  const h = createSecurityHarness();
  for (const args of [['constructor'], ['__proto__'], ['scan', 'id', 'extra'], ['disposition', 'id', 'fp', 'apply', 'id', 'extra']]) {
    expect((await runSecurityCommand(args, h.service)).output).toContain('Usage:');
  }
  expect(h.service.state().scans).toEqual([]); expect(h.run).not.toHaveBeenCalled();
  const calls: string[] = []; const mock = Object.fromEntries(['plan', 'scan', 'status', 'cancel', 'scans', 'show', 'importReport', 'exportReport', 'compare', 'validate', 'disposition']
    .map(name => [name, () => { calls.push(name); return { kind: 'local', output: name }; }])) as unknown as SecurityService;
  const cases = [['plan', '/native', '1.30.2', 'rules', 'file'], ['scan', 'id'], ['status'], ['cancel'], ['scans'], ['show', 'id'],
    ['import', 'file', 'id'], ['export', 'id', 'file'], ['compare', 'before', 'after'], ['validate', 'id'], ['disposition', 'id', 'fp', 'open', 'reason']];
  for (const args of cases) await runSecurityCommand(args, mock);
  expect(calls).toEqual(['plan', 'scan', 'status', 'cancel', 'scans', 'show', 'importReport', 'exportReport', 'compare', 'validate', 'disposition']);
});
const nativeExecutable = path.resolve(process.cwd(), '../../.tmp/security-native/bin/opengrep');
it.skipIf(!fs.existsSync(nativeExecutable))('uses the real optional native analyzer for finding, patch receipt and same-scope/version coverage verification', async () => {
  const h = createSecurityHarness(true); const id = h.plan(); await h.service.scan(id); const scan = h.service.scanRecord(id);
  expect(scan.note).not.toContain('could not'); expect(scan.status).toBe('completed'); expect(scan.coverage.status).toBe('complete'); expect(scan.findings).toHaveLength(1);
  const finding = scan.findings[0]!; const proposal = h.service.propose(id, finding.fingerprint, patch).report!.facts.proposalId as string;
  await h.service.apply(id, finding.fingerprint, proposal); await h.service.validate(id, finding.fingerprint);
  expect(h.service.state().remediations[0]!.status).toBe('verified'); expect(h.service.state().scans.at(-1)!.findings).toHaveLength(0);
}, 45_000);
