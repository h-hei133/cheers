import type { EscalationPrompt, EscalationResponse } from '../shell/approval/contract.js';
import { neutraliseForDisplay } from '../text/safety.js';
import { hookFingerprint } from './trust.js';
import { hookApprovalDecision, type HookApprovalRequest } from './types.js';

/** The host collects an answer; only the dispatcher may remember the fingerprint. */
export function createHookApprovalRequest(
  handler?: (prompt: EscalationPrompt) => Promise<EscalationResponse>,
): HookApprovalRequest {
  return async hook => {
    if (!handler) return 'deny';
    const message = [
      `${neutraliseForDisplay(hook.sourcePath)} declares a command to run on the ${neutraliseForDisplay(hook.event)} event.`,
      hook.matcher ? `Applies to: ${neutraliseForDisplay(hook.matcher)}` : 'Applies to all tools.',
      '', 'Command:', `  ${neutraliseForDisplay(hook.command)}`, '',
      'Approval is remembered for this exact event, matcher and command in this file; changing any asks again.',
    ].join('\n');
    const response = await handler({
      id: `hook-approval-${Date.now()}`,
      title: 'Run a command this project asks for?',
      message,
      context: {
        toolName: 'hook', operation: neutraliseForDisplay(hook.event), target: neutraliseForDisplay(hook.command),
        callBinding: hookFingerprint(hook), grantOwner: 'caller',
        preview: message, previewKind: 'execution',
      },
      options: [
        { value: 'allow-once', label: 'Allow once', description: 'Run this hook once.' },
        { value: 'allow-always', label: 'Allow and remember', description: 'Remember this exact hook until withdrawn or changed.' },
        { value: 'deny', label: 'Deny', description: 'Do not run it.' },
      ],
      defaultOption: 'deny', recommendedAction: 'Review the command before allowing it.', severity: 'high',
    });
    return hookApprovalDecision(response.decision);
  };
}
