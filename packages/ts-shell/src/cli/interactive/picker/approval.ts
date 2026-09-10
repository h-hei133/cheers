import type { EscalationPrompt } from "../../../sandbox/index.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";

/**
 * In-place approval escalation picker.
 *
 * Prompts the user with three clear choices (allow-once, allow-always, deny)
 * when a modifying tool requests escalation in ask mode.
 */
export function approvalPicker(
  prompt: EscalationPrompt,
  onSettle: (decision: "deny" | "allow-once" | "allow-always") => void,
): Picker {
  const toolName = prompt.context?.toolName || "tool";
  const operation = prompt.context?.operation ? ` (${prompt.context.operation})` : "";
  const target = prompt.context?.target ? ` on '${prompt.context.target}'` : "";
  return {
    title: `Permission: ${toolName}${operation}`,
    form: "panel",
    empty: "No options",
    filterable: false,
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
      const choice = ids[0] as "deny" | "allow-once" | "allow-always" | undefined;
      onSettle(choice ?? "deny");
      return undefined;
    },
    previewEnd: () => {
      onSettle("deny");
    },
  };
}
