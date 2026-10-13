import fs from 'node:fs';
import path from 'node:path';
import { createDefaultExecutionService, type CommandExecutionResult, type ExecutionService } from '../../runtime/execution/service.js';
import { planSandboxedCommand, readSandboxRules } from '../../sandbox/osSandbox.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';
import { redactReportText } from '../../core/security/redaction.js';
import { assertInventory } from '../archive/storage.js';
import { versionPath } from '../store/state.js';
import type { VersionRecord } from '../model.js';
import type { ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import type { DenyRule } from '../../core/shell/approval/deny.js';
import { sourceFile } from '../registry/sources.js';

export interface ExecutionHost {
  readonly file: string;
  readonly root: string;
  readonly check: () => void;
  readonly denyRules: () => readonly DenyRule[];
  readonly execution?: ExecutionService;
}
export function scriptArgs(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32 || value.some(entry => typeof entry !== 'string' || entry.length > 1024 || entry.includes('\0'))) throw new Error('Extension args require at most 32 bounded strings.');
  return [...value] as string[];
}
export async function executeScript(host: ExecutionHost, record: VersionRecord, script: string, argv: readonly string[], current: () => void,
  context: ToolExecutionContext): Promise<ToolExecutionResult> {
  current(); host.check();
  if (process.platform !== 'linux') throw new Error('Isolated extension script execution currently requires Linux bubblewrap.');
  // Shell code cannot prove path-specific compliance. Refuse policies the current
  // sandbox cannot enforce rather than letting an approved process evade file denials.
  if (host.denyRules().some(rule => ['read', 'write', 'edit', 'apply_patch', 'glob', 'grep', '*'].includes(rule.tool))) throw new Error('Extension scripts are unavailable with file deny rules that cannot be enforced by this sandbox.');
  const owned = versionPath(record, host.file); assertInventory(owned, record);
  const entry = record.manifest.scripts.find(value => value.name === script); if (!entry) throw new Error('Unknown extension script.');
  const absolute = path.join(owned, entry.path);
  const parent = path.dirname(host.file); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const home = fs.mkdtempSync(path.join(parent, '.run-')); fs.chmodSync(home, 0o700);
  let result: CommandExecutionResult | undefined; let dispatched = false; let cleanupUnknown = false; let output = ''; let bytes = 0;
  const abort = new AbortController(); const cancel = () => abort.abort(); context.abortSignal?.addEventListener('abort', cancel, { once: true });
  if (context.abortSignal?.aborted) cancel();
  try {
    const stored = readSandboxRules(host.root);
    if ((stored.network?.allowedDomains ?? []).length) throw new Error('Extension network grant is unsupported; execution was refused.');
    if ((stored.filesystem?.allowRead ?? []).length || (stored.filesystem?.allowWrite ?? []).length) throw new Error('Extension scripts cannot inherit broader filesystem sandbox grants.');
    const readOnly = [...(record.manifest.permissions.workspace === 'read' ? [host.root] : []), owned, host.file, sourceFile()];
    const plan = planSandboxedCommand({ shell: '/bin/sh', shellArgs: [absolute, ...argv], workspaceRoot: host.root,
      rules: { enabled: true, failClosed: true, network: { allowedDomains: [] }, filesystem: { allowRead: [owned], allowWrite: [home], denyRead: [...stored.filesystem?.denyRead ?? []] } }, readOnlyRoots: readOnly, isolateProcesses: true, sessionCreated: true });
    if (plan.state !== 'isolated' || !plan.command || !plan.args) throw new Error(plan.notice ?? 'Extension sandbox unavailable; no script ran.');
    current(); host.check(); assertInventory(owned, record); abort.signal.throwIfAborted();
    dispatched = true;
    result = await (host.execution ?? createDefaultExecutionService()).runCommand({ operationKind: 'command.run', command: plan.command, args: plan.args,
      cwd: host.root, workspaceRoot: host.root, authority: { mode: 'sandbox-approved', source: 'tool-runtime-approval', reason: 'Exact extension identity, separate grant and ordinary prepared-tool approval.' },
      caller: 'extension-runtime', reason: 'Run an explicitly granted isolated extension script.', reportSafeCommand: `extension:${record.source}:${record.manifest.name}@${record.manifest.version}:${record.digest}:${script}`,
      timeoutMs: 30_000, abortSignal: abort.signal, cleanupTreeOnExit: true, captureOutput: false,
      env: { PATH: '/usr/bin:/bin', HOME: home, USERPROFILE: home, TMPDIR: '/tmp', EXTENSION_WORKSPACE: host.root, EXTENSION_INPUT: JSON.stringify({ args: argv }) },
      onOutput: chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 256 * 1024) { abort.abort(); return; } output += chunk; },
    });
  } catch (error) {
    if (!dispatched) throw error;
    return { success: false, output: `Extension native dispatch occurred, but its execution outcome and cleanup are unknown; the private runtime home was retained. Source ${record.source}; SHA256 ${record.digest}.`,
      metadata: { extension: record.manifest.name, source: record.source, version: record.manifest.version, digest: record.digest, cleanup: 'unknown' } };
  } finally {
    context.abortSignal?.removeEventListener('abort', cancel);
    // Never delete data while a process tree may still own it.
    if (!result?.terminationFailed && (!dispatched || result)) { try { fs.rmSync(home, { recursive: true }); } catch { cleanupUnknown = true; } }
    else cleanupUnknown = true;
  }
  const success = result!.status === 'completed' && result!.exitCode === 0 && !result!.terminationFailed && !cleanupUnknown;
  const detail = redactUnsafeReportText(redactReportText(output, 16_000, { projectRoot: host.root }), new Set(), 16_000);
  return { success, output: `${detail}\nExtension execution: ${result!.status}; exit ${result!.exitCode}; receipt ${result!.receipt.receiptId}; source ${record.source}; SHA256 ${record.digest}.${cleanupUnknown ? ' Cleanup is unknown.' : ''}`,
    metadata: { extension: record.manifest.name, source: record.source, version: record.manifest.version, digest: record.digest, executionReceipt: result!.receipt, cleanup: cleanupUnknown ? 'unknown' : 'confirmed' } };
}
