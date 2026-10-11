import path from 'node:path';
import type { CommandDataTransfer, CommandDataEffectResult } from '../../core/commands/transfer/contract.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { captureWorkspaceRoot, selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { inspectWorkspaceFile } from '../../core/workspace/files.js';
import { filePublication } from '../../edit/authority/publication.js';
import { runCopyCommand } from '../../core/commands/copyCommandRuntime.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';
import { openConversationLink } from './links.js';
import { commandGateFor, installCommandGate } from './access.js';

const MAX_BYTES = 2 * 1024 * 1024;

export function installDataTransfer(context: ShellRuntimeContext, gate: (tool?: string) => ToolGateOptions): void {
  installCommandGate(context, gate);
}

/** Capture the current command's identity; later session switches revoke its file authority. */
export function dataTransferFor(context: ShellRuntimeContext): CommandDataTransfer | undefined {
  const gate = commandGateFor(context);
  if (!gate) return undefined;
  const session = context.session.id;
  const cwd = context.cwd;
  const workspace = captureWorkspaceRoot(cwd, cwd, 'read');
  const configured = configurationAdmission(context);
  const admission = () => {
    try {
      return configured() ?? (context.session.id !== session || context.cwd !== cwd
        || captureWorkspaceRoot(cwd, cwd, 'read').identity !== workspace.identity
        ? 'Command session or workspace changed.' : undefined);
    } catch { return 'Command workspace is unavailable.'; }
  };
  const sourceAccess = (absolute: string, options: ToolGateOptions) => {
    const refused = admission() ?? options.admission?.();
    if (refused) throw new Error(refused);
    assertSourceAccess(absolute, cwd, context.session.workspaceRoots, options.permissionScope, context.runtimeConfig.denyRules);
  };
  return {
    openLink: ({ url }) => openConversationLink(url, gate('bash'), admission),
    async read(input) {
      try {
        if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > MAX_BYTES) throw new Error('Invalid transfer size limit.');
        const options = gate('read');
        const target = path.resolve(cwd, input.path);
        const root = selectWorkspaceRoot(cwd, context.session.workspaceRoots ?? [], target, 'read');
        const file = inspectWorkspaceFile(root, path.relative(root, target), absolute => sourceAccess(absolute, options), input.maxBytes);
        if (file.state !== 'exists') return { outcome: 'failed', reason: 'Import file does not exist.' };
        return { outcome: 'read', content: file.content };
      } catch (error) { return { outcome: 'blocked', reason: safeReason(error) }; }
    },
    async write(input) {
      try {
        const options = gate('apply_patch');
        const target = path.resolve(cwd, input.path);
        selectWorkspaceRoot(cwd, context.session.workspaceRoots ?? [], target, 'write');
        sourceAccess(target, options);
        const current = () => {
          try { sourceAccess(target, gate('apply_patch')); return undefined; }
          catch (error) { return safeReason(error); }
        };
        let refusal: CommandDataEffectResult['outcome'] | undefined;
        const tool = { ...filePublication(target, input.content, MAX_BYTES, current, current, 'Export'),
          onRefusal: (_args: unknown, _context: unknown, state: 'blocked' | 'denied' | 'cancelled' | 'failed') => { refusal = state; } };
        const result = await runPreparedTool(tool, {}, { ...options, admission: current }, undefined, undefined, 'Export', { eventKey: 'dataExport' });
        const status = result.metadata?.status;
        const outcome: CommandDataEffectResult['outcome'] = !result.isError && status === 'persisted' ? 'committed'
          : status === 'unverified' || result.metadata?.publication === 'unverified' ? 'unknown'
            : refusal ?? (status === 'unchanged' && result.isError ? 'failed' : 'blocked');
        return { outcome, reason: redactUnsafeReportText(result.output, undefined, 1024) };
      } catch (error) { return { outcome: 'blocked', reason: safeReason(error) }; }
    },
    async copy({ content }) {
      const refused = admission();
      if (refused) return { outcome: 'blocked', reason: refused };
      if (Buffer.byteLength(content) > MAX_BYTES) return { outcome: 'blocked', reason: 'Clipboard text exceeds 2 MiB.' };
      const copied = await runCopyCommand([content], { cwd, sessionId: session, rawCommandArgs: content });
      return { outcome: copied.state?.clipboard === 'copied' ? 'committed' : copied.state?.clipboard === 'offered' ? 'unknown' : 'failed', reason: copied.output };
    },
  };
}

function safeReason(error: unknown): string {
  return redactUnsafeReportText(error instanceof Error ? error.message : 'Data transfer unavailable.', undefined, 1024);
}
