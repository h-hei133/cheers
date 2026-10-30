import type { EscalationPrompt } from "../../../core/shell/approval/contract.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { OverlayHost, Picker } from "../overlay.js";
import type { Pager } from '../../../presentation/tui/chrome/pager.js';
import { createReport, reportText, span } from '../../../core/commands/report/projection.js';

/** Approval owns its preview lifecycle as well as its choices. */
export function promptApproval(prompt: EscalationPrompt, host: { readonly pager: Pick<Pager, 'open' | 'close'>;
  readonly overlay: Pick<OverlayHost, 'open' | 'close'>; readonly render: () => void }, signal?: AbortSignal): Promise<InteractiveApprovalResult> {
  if (signal?.aborted) return Promise.resolve({ decision: 'deny', reason: 'Operation cancelled before approval.' });
  host.pager.close();
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (result: InteractiveApprovalResult) => {
      if (settled) return; settled = true;
      signal?.removeEventListener('abort', cancel);
      try {
        try { if (prompt.context?.preview) host.pager.close(); }
        finally { host.overlay.close(); }
      } catch (error) {
        if (signal?.aborted) resolve({ decision: 'deny', reason: 'Operation cancelled before approval.' });
        else reject(error);
        return;
      }
      resolve(result);
    };
    const cancel = () => {
      // A failed terminal cleanup must not strand the cancelled tool's drain.
      // The denied answer carries no write authority even if dismissal fails.
      settle({ decision: 'deny', reason: 'Operation cancelled before approval.' });
    };
    const chooseGroups = () => {
      if (settled) return;
      host.overlay.close();
      host.pager.close();
      host.overlay.open(hunkPicker(prompt, selected => {
        if (settled) return;
        const ids = selected.selected ?? [];
        if (!prompt.context.selectionPreview || ids.length === 0) {
          settle(selected);
          return;
        }
        let refined: { readonly preview: string; readonly revision: string };
        try {
          refined = prompt.context.selectionPreview(ids);
        } catch (error) {
          settle({ decision: 'deny', reason: error instanceof Error ? error.message : 'The selected patch subset could not be prepared.' });
          return;
        }
        const selectedIds = new Set(ids);
        const refinedPrompt: EscalationPrompt = {
          ...prompt,
          context: {
            ...prompt.context,
            preview: refined.preview,
            previewKind: 'file-plan',
            selections: prompt.context.selections?.filter(selection => selectedIds.has(selection.id)),
            selectionRevision: refined.revision,
          },
        };
        host.overlay.close();
        host.overlay.open(approvalPicker(refinedPrompt, decision => settle({
          ...decision,
          ...(decision.decision === 'deny' ? {} : { selected: ids, selectionRevision: refined.revision }),
        })));
        const preview = approvalPreview(refinedPrompt);
        if (preview) host.pager.open(preview.title, reportText(preview), preview);
        host.render();
      }, settle));
      host.render();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      host.overlay.open(approvalPicker(prompt, settle, chooseGroups));
      if (settled) return;
      const preview = approvalPreview(prompt);
      if (preview) host.pager.open(preview.title, reportText(preview), preview);
      host.render();
    } catch (error) {
      settled = true;
      signal?.removeEventListener('abort', cancel);
      reject(error);
    }
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
  /** Exact selected-subset revision shown in the final approval preview. */
  readonly selectionRevision?: string;
}

export type InteractiveApprovalResult = ApprovalDecision | ApprovalSettleResult;

export function approvalPicker(
  prompt: EscalationPrompt,
  onSettle: (result: ApprovalSettleResult) => void,
  onChooseGroups?: () => void,
): Picker {
  const toolName = prompt.context?.toolName || "tool";
  const persistentAllowed = toolName !== 'apply_patch';
  const operation = prompt.context?.operation ? ` (${prompt.context.operation})` : "";
  const target = prompt.context?.target ? ` on '${prompt.context.target}'` : "";
  const permitted = (choice: ApprovalDecision) => !prompt.options.length || prompt.options.some(option => option.value === choice);
  const selectable = Boolean(onChooseGroups && permitted('allow-once') && (prompt.context?.selections?.length ?? 0) > 1);
  return {
    title: `Permission: ${toolName}${operation}`,
    form: "panel",
    empty: "No options",
    filterable: false,
    ...(prompt.context?.preview ? { initialSelection: 'deny', footer: prompt.context.previewKind === 'execution'
      ? 'Preview closed. Choose Allow once to execute this request.' : 'Preview closed. Choose Allow once to apply this exact plan.' } : {}),
    load: async (): Promise<readonly Option[]> => [
      ...(selectable ? [{ id: 'choose-groups', label: 'Choose groups…', detail: 'Apply only the selected groups of this plan',
        note: '4 / g' }] : []),
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
    ].filter(option => (option.id === 'choose-groups' || permitted(option.id as ApprovalDecision))
      && (persistentAllowed || option.id !== 'allow-always')),
    apply: async (ids): Promise<undefined> => {
      if (ids[0] === 'choose-groups' && selectable && onChooseGroups) { onChooseGroups(); return undefined; }
      const choice = ids[0] as ApprovalDecision | undefined;
      const decision = choice && permitted(choice) ? choice : "deny";
      const selected = decision !== "deny" && prompt.context?.selections?.length
        ? prompt.context.selections.map(selection => selection.id) : undefined;
      onSettle({
        decision,
        ...(selected ? { selected } : {}),
        ...(decision !== 'deny' && prompt.context?.selectionRevision
          ? { selectionRevision: prompt.context.selectionRevision } : {}),
      });
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

/** Group selection for a multi-group plan; every group starts selected. */
function hunkPicker(
  prompt: EscalationPrompt,
  onSelect: (result: ApprovalSettleResult) => void,
  onDeny: (result: ApprovalSettleResult) => void,
): Picker {
  return {
    title: 'Apply which groups?',
    form: 'panel',
    multiple: true,
    empty: 'No groups',
    filterable: false,
    footer: 'Space toggles; Enter applies the selected groups.',
    load: async (): Promise<readonly Option[]> => (prompt.context?.selections ?? []).map(selection => ({
      id: selection.id, label: selection.label, detail: selection.files?.join(', '), selected: true })),
    apply: async (ids): Promise<undefined> => {
      if (ids.length === 0) { onDeny({ decision: 'deny' }); return undefined; }
      onSelect({ decision: 'allow-once', selected: [...ids] });
      return undefined;
    },
    onDeny: (reason?: string) => { onDeny({ decision: 'deny', ...(reason ? { reason } : {}) }); },
    previewEnd: () => { onDeny({ decision: 'deny' }); },
  };
}
