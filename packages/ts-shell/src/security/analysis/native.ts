import { mkdirSync, lstatSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createDefaultExecutionService, type ExecutionService, type CommandExecutionResult } from '../../runtime/execution/service.js';
import type { ToolDefinition } from '../../tools/types.js';
import { planPreview, recheckPlan } from './plan.js';
import { parseSarif } from './sarif.js';
import { observedCoverage } from './coverage.js';
import type { ScanRecord } from './model.js';
import { digest } from './source.js';

export function analyzerTool(scan: ScanRecord, publish: (scan: ScanRecord) => ScanRecord,
  execution: Pick<ExecutionService, 'runCommand'> = createDefaultExecutionService()): ToolDefinition {
  let current = scan;
  const update = (next: ScanRecord) => { current = next; current = publish(next); };
  return { name: 'bash', description: 'Run the exact reviewed local security analyzer commands.',
    argsSchema: { type: 'object', required: ['command'], additionalProperties: false, properties: { command: { const: `security scan ${scan.id} ${scan.plan.fingerprint}` } } },
    onRefusal: (_args, _context, status) => update({ ...current, status: status === 'denied' ? 'denied' : status === 'cancelled' ? 'cancelled' : 'blocked', note: `Security scan ${status}; no analyzer was dispatched.` }),
    prepare: (_args, context) => {
      if (context.workspaceRoot !== scan.plan.root) throw new Error('Security scan root changed.');
      recheckPlan(scan.plan, context.assertSourceAccess);
      return { targets: [], previewKind: 'execution', permissionArgs: { command: `security scan ${scan.id} ${scan.plan.fingerprint}` }, preview: planPreview(scan.plan),
        execute: async actual => {
          const controller = new AbortController(); const abort = () => controller.abort(); let bytes = 0; let exceeded = false;
          actual.abortSignal?.addEventListener('abort', abort, { once: true }); if (actual.abortSignal?.aborted) controller.abort();
          let directoryIdentity: string | undefined;
          const results: CommandExecutionResult[] = [];
          try {
            recheckPlan(scan.plan, actual.assertSourceAccess); actual.abortSignal?.throwIfAborted();
            const home = scan.plan.env.HOME!;
            if (path.resolve(home) !== home || lstatSync(path.dirname(home)).isSymbolicLink()) throw new Error('Analyzer runtime directory is unavailable.');
            mkdirSync(home, { mode: 0o700 }); const stat = lstatSync(home); directoryIdentity = `${stat.dev}:${stat.ino}`;
            update({ ...current, status: 'running', note: 'Approved native analyzer started; coverage and findings are pending.' });
            for (const [index, args] of scan.plan.argv.entries()) {
              recheckPlan(scan.plan, actual.assertSourceAccess); controller.signal.throwIfAborted();
              const result = await execution.runCommand({ operationKind: 'command.run', command: scan.plan.executable.path, args,
                cwd: home, workspaceRoot: scan.plan.root, env: scan.plan.env, timeoutMs: 30_000, abortSignal: controller.signal, cleanupTreeOnExit: true,
                authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'Frozen security analyzer passed ordinary execution approval.' },
                caller: 'security-analysis', reason: 'Local analyzer with exact frozen source/rule/version grants', reportSafeCommand: `security scan ${scan.id} pass ${index + 1}`,
                onOutput: chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 8 * 1024 * 1024) { exceeded = true; controller.abort(); } } });
              results.push(result);
              update({ ...current, receipts: results.map(item => ({ ...item.receipt, outputSummary: 'Native analyzer output retained only as bounded normalized security evidence.' })) });
              if (result.terminationFailed) { update({ ...current, status: 'unknown', note: 'Analyzer process-tree cleanup could not be confirmed; do not replay automatically.' }); break; }
              if (exceeded) throw new Error('Analyzer output exceeded its budget.');
              if (result.status !== 'completed' || result.exitCode !== 0) {
                update({ ...current, status: result.status === 'timeout' ? 'timeout' : result.status === 'cancelled' ? 'cancelled' : 'failed',
                  failureClass: result.spawnErrorCode === 'ENOENT' ? 'analyzer-unavailable' : 'execution-failed',
                  note: result.spawnErrorCode === 'ENOENT' ? 'Analyzer executable is unavailable.' : `Analyzer ${result.status}; exit ${result.exitCode ?? 'unknown'}. Coverage was not established.` }); break;
              }
              recheckPlan(scan.plan, actual.assertSourceAccess);
              if (index === 0 && result.stdout.trim() !== scan.plan.version) throw new Error('Analyzer observed version does not match the frozen expected version.');
              if (index === 1) {
                update({ ...current, reportDigest: digest(result.stdout) });
                const parsed = parseSarif(result.stdout, scan.plan);
                update({ ...current, ...parsed, note: `Native SARIF observed ${parsed.findings.length} findings; selected-file coverage is pending.` });
              }
            }
            if (current.status === 'running' && results.length === 3) {
              const report = parseSarif(results[1]!.stdout, scan.plan);
              const coverage = observedCoverage(results[2]!.stdout, scan.plan, report.findings, report.notes);
              update({ ...current, ...report, coverage, status: coverage.status === 'complete' ? 'completed' : 'partial',
                note: `Native analyzer observed ${report.findings.length} findings; selected-file coverage ${coverage.status}. This does not prove the repository secure.` });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : '';
            const failureClass = /version does not match/.test(message) ? 'version-mismatch' as const : /Security input changed|workspace changed/.test(message) ? 'input-changed' as const
              : /exceeded its budget/.test(message) ? 'output-limit' as const : /SARIF|Security report|coverage output|coverage findings|Native finding/.test(message) ? 'report-invalid' as const : 'execution-failed' as const;
            if (!['unknown', 'completed', 'partial'].includes(current.status)) update({ ...current, status: actual.abortSignal?.aborted ? 'cancelled' : results.length ? 'failed' : 'blocked',
              failureClass, note: /Security input changed|workspace changed|version does not match|exceeded its budget/.test(message) ? message
                : failureClass === 'report-invalid' ? 'Security analyzer report is malformed, unsupported or inconsistent; valid native coverage was not established.' : 'Security scan could not establish verified native evidence.' });
          } finally {
            actual.abortSignal?.removeEventListener('abort', abort);
            if (directoryIdentity && current.status !== 'unknown') {
              try { const stat = lstatSync(scan.plan.env.HOME!); if (`${stat.dev}:${stat.ino}` !== directoryIdentity || stat.isSymbolicLink()) throw new Error('identity'); rmSync(scan.plan.env.HOME!, { recursive: true }); }
              catch { update({ ...current, status: 'unknown', note: 'Analyzer runtime cleanup could not be confirmed.' }); }
            }
          }
          return { success: current.status === 'completed' && !current.durability, output: current.note, metadata: { securityScanId: current.id, status: current.status, coverage: current.coverage.status, durability: current.durability ?? 'persisted' } };
        } };
    }, async execute() { throw new Error('Security scan requires its original prepared and approved call.'); } };
}
