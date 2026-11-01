import { describe, expect, it, vi } from 'vitest';
import { createHookApprovalRequest } from './approval.js';
import { hookFingerprint } from './trust.js';
import { approvalPicker, promptApproval } from '../../cli/interactive/picker/approval.js';
import type { EscalationPrompt } from '../shell/approval/contract.js';

const hook = { event: 'PreToolUse', command: './check.sh', matcher: 'bash', sourcePath: '/public/project/.agents/hooks.json' };

describe('hook approval presentation', () => {
  it('refuses without an answer host', async () => {
    expect(await createHookApprovalRequest()(hook)).toBe('deny');
  });

  it('retains remember semantics and labels from the hook owner', async () => {
    const handler = vi.fn(async (prompt: EscalationPrompt) => ({ promptId: prompt.id, decision: 'allow-always' as const, respondedAt: 1 }));
    expect(await createHookApprovalRequest(handler)(hook)).toBe('allow-always');
    const prompt = handler.mock.calls[0]![0];
    expect(prompt.context).toMatchObject({ grantOwner: 'caller', callBinding: hookFingerprint(hook) });
    expect(prompt.context.explicitApproval).toBeUndefined();
    const rows = await approvalPicker(prompt, () => {}).load();
    expect(rows.find(row => row.id === 'allow-always')).toMatchObject({ label: 'Allow and remember',
      detail: 'Remember this exact hook until withdrawn or changed.' });
  });

  it('neutralises every displayed field while binding the original exact declaration', async () => {
    const unsafe = { command: 'echo safe\n\u001b[2Jforged', matcher: 'bash\nforged', event: 'PreToolUse\rforged', sourcePath: '/public/\nforged' };
    const handler = vi.fn(async (prompt: EscalationPrompt) => ({ promptId: prompt.id, decision: 'deny' as const, respondedAt: 1 }));
    await createHookApprovalRequest(handler)(unsafe);
    const prompt = handler.mock.calls[0]![0];
    expect(prompt.context.target).not.toMatch(/[\n\r\u001b]/);
    expect(prompt.context.operation).not.toMatch(/[\n\r\u001b]/);
    expect(prompt.message).not.toContain('\u001b'); expect(prompt.message).not.toContain('safe\n');
    expect(prompt.message).not.toContain('bash\n'); expect(prompt.message).not.toContain('/public/\n');
    expect(prompt.context.callBinding).toBe(hookFingerprint(unsafe));
  });

  it('shows source, matcher and command through the actual approval preview host', async () => {
    const open = vi.fn(), overlayOpen = vi.fn();
    const request = createHookApprovalRequest(async prompt => {
      const result = promptApproval(prompt, { pager: { open, close() {} }, overlay: { open: overlayOpen, close() {} }, render() {} });
      expect(open).toHaveBeenCalledOnce();
      expect(open.mock.calls[0]![1]).toContain(hook.sourcePath);
      expect(open.mock.calls[0]![1]).toContain('Applies to: bash');
      expect(open.mock.calls[0]![1]).toContain(hook.command);
      const picker = overlayOpen.mock.calls[0]![0];
      expect(picker.footer).toBe('Preview closed. Choose an approval for this request.');
      await picker.apply(['allow-always']);
      const settled = await result;
      return { promptId: prompt.id, decision: typeof settled === 'string' ? settled : settled.decision, respondedAt: 1 };
    });
    expect(await request(hook)).toBe('allow-always');
  });
});
