import type { EscalationPrompt } from "../../../core/shell/approval/contract.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { OverlayHost, Picker } from "../overlay.js";
import type { Pager } from '../../../presentation/tui/chrome/pager.js';
import { createReport, reportText, span } from '../../../core/commands/report/projection.js';

/** Approval owns its preview lifecycle as well as its choices. */
export function promptApproval(prompt: EscalationPrompt, host: { readonly pager: Pick<Pager, 'open' | 'close'>;
  readonly overlay: Pick<OverlayHost, 'open' | 'close'>; readonly render: () => void }): Promise<InteractiveApprovalResult> {
  host.pager.close();
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: InteractiveApprovalResult) => {
      if (settled) return; settled = true;
      if (prompt.context?.preview) host.pager.close();
      host.overlay.close(); resolve(result);
    };
    host.overlay.open(approvalPicker(prompt, settle));
    const preview = approvalPreview(prompt);
    if (preview) host.pager.open(preview.title, reportText(preview), preview);
    host.render();
  });
}

export function approvalPreview(prompt: EscalationPrompt) {
  const preview = prompt.context?.preview;
  return preview ? createReport({ title: prompt.context.previewKind === 'execution' ? 'Review execution request — close to choose approval' : 'Review file plan — close to choose approval', facts: { permission: 'pending' },
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
  /** Group ids the user approved; a whole-plan approval selects every group. */
  readonly selected?: readonly string[];
}

export type InteractiveApprovalResult = ApprovalDecision | ApprovalSettleResult;

export function approvalPicker(
  prompt: EscalationPrompt,
  onSettle: (result: ApprovalSettleResult) => void,
): Picker {
  const toolName = prompt.context?.toolName || "tool";
  const operation = prompt.context?.operation ? ` (${prompt.context.operation})` : "";
  const target = prompt.context?.target ? ` on '${prompt.context.target}'` : "";
  const permitted = (choice: ApprovalDecision) => !prompt.options.length || prompt.options.some(option => option.value === choice);
  return {
    title: `Permission: ${toolName}${operation}`,
    form: "panel",
    empty: "No options",
    filterable: false,
    ...(prompt.context?.preview ? { initialSelection: 'deny', footer: prompt.context.previewKind === 'execution'
      ? 'Preview closed. Choose Allow once to execute this request.' : 'Preview closed. Choose Allow once to apply this exact plan.' } : {}),
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
    ].filter(option => permitted(option.id as ApprovalDecision)),
    apply: async (ids): Promise<undefined> => {
      const choice = ids[0] as ApprovalDecision | undefined;
      const decision = choice && permitted(choice) ? choice : "deny";
      const selected = decision !== "deny" && prompt.context?.selections?.length
        ? prompt.context.selections.map(selection => selection.id) : undefined;
      onSettle({ decision, ...(selected ? { selected } : {}) });
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
