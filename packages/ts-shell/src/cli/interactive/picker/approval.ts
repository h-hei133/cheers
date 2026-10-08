import type { EscalationPrompt } from "../../../core/shell/approval/contract.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";
import { createReport, span } from '../../../core/commands/report/projection.js';

export function approvalPreview(prompt: EscalationPrompt) {
  const preview = prompt.context?.preview;
  return preview ? createReport({ title: 'Review file plan — close to choose approval', facts: { permission: 'pending' },
    lines: preview.split('\n').map(text => ({ kind: 'text', spans: [span(text, 'code')] })) }) : undefined;
}

/**
 * In-place approval escalation picker.
 *
 * Prompts the user with three clear choices (allow-once, allow-always, deny)
 * when a modifying tool requests escalation in ask mode.
 */
export type ApprovalDecision = "deny" | "allow-once" | "allow-always";

export interface ApprovalSettleResult {
  readonly decision: ApprovalDecision;
  readonly reason?: string;
}

export type InteractiveApprovalResult = ApprovalDecision | ApprovalSettleResult;

export function approvalPicker(
  prompt: EscalationPrompt,
  onSettle: (result: ApprovalSettleResult) => void,
): Picker {
  const toolName = prompt.context?.toolName || "tool";
  const operation = prompt.context?.operation ? ` (${prompt.context.operation})` : "";
  const target = prompt.context?.target ? ` on '${prompt.context.target}'` : "";
  return {
    title: `Permission: ${toolName}${operation}`,
    form: "panel",
    empty: "No options",
    filterable: false,
    ...(prompt.context?.preview ? { initialSelection: 'deny', footer: 'Preview closed. Choose Allow once to apply this exact plan.' } : {}),
    load: async (): Promise<readonly Option[]> => [
      {
        id: "allow-once",
        label: "Allow once",
        detail: `Allow ${toolName}${target} this time`,
        note: "1 / y",
      },
      {
        id: "allow-always",
        label: "Allow always for this command/session",
        detail: "Remember this grant and do not ask again in this session",
        note: "2 / a",
      },
      {
        id: "deny",
        label: "Deny",
        detail: "Block this action and return failure to model",
        note: "3 / n / d / esc",
      },
    ],
    apply: async (ids): Promise<undefined> => {
      const choice = ids[0] as ApprovalDecision | undefined;
      onSettle({ decision: choice ?? "deny" });
      return undefined;
    },
    onDeny: (reason?: string) => {
      onSettle({ decision: "deny", reason });
    },
    previewEnd: () => {
      onSettle({ decision: "deny" });
    },
  };
}
