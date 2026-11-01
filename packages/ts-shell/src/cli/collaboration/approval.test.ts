import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import { createCliEscalationPromptHandler } from '../../entrypoints/cliApprovalModule.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { approveOperation } from './approval.js';
import type { CollaborationComposition } from './model.js';

class QuietRenderer extends StreamingRenderer { override renderLine(): void {} }
let root: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../.tmp/', import.meta.url));
  fs.mkdirSync(scratch, { recursive: true }); root = fs.mkdtempSync(path.join(scratch, 'collaboration-approval-'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

it.each(['change ACL', 'select profile'])('binds the actual collaboration %s preview across persisted-policy reload', async operation => {
  const policyPath = path.join(root, 'policy.json');
  const interactive = vi.fn().mockResolvedValueOnce('allow-always').mockResolvedValue('deny');
  const handlerFor = () => createCliEscalationPromptHandler(new QuietRenderer(), null, () => 'compact', new ApprovalTrustPolicy(policyPath),
    () => root, undefined, undefined, undefined, () => 'ask', interactive);
  let handler = handlerFor();
  const host = { context: { projectRoot: root, session: { id: 'approval', createdAt: '2026-11-01T00:00:00.000Z' } },
    gate: () => ({ workspaceRoot: root, sessionId: 'approval', permissionScope: 'ask', hooks: new HookDispatcher(), emit() {},
      escalationPromptHandler: handler }) } as unknown as CollaborationComposition;
  const executed = vi.fn(async () => ({ success: true, output: 'confirmed' }));
  const preview = 'Reviewed destination and principal A';
  expect(await approveOperation(host, operation, preview, executed)).toMatchObject({ ok: true, output: 'confirmed' });
  handler = handlerFor();
  expect(await approveOperation(host, operation, preview, executed)).toMatchObject({ ok: true, output: 'confirmed' });
  expect(interactive).toHaveBeenCalledOnce();
  expect((await approveOperation(host, operation, 'Reviewed destination and principal B', executed)).ok).toBe(false);
  expect(interactive).toHaveBeenCalledTimes(2); expect(executed).toHaveBeenCalledTimes(2);
  expect(fs.readFileSync(policyPath, 'utf8')).not.toContain(preview);
});
