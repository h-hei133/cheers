import { runCopyCommand } from "../../../core/commands/copyCommandRuntime.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Block } from "../../../presentation/tui/transcript/blocks.js";
import type { Transcript } from "../../../presentation/tui/transcript/container.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Copy chooser.
 *
 * Dragging across the terminal copies cells, which means it also copies the
 * indentation that makes a transcript readable — the pasted text comes back with
 * every line prefixed by spaces. Copying a block by identity instead puts its
 * source text on the clipboard exactly as it arrived.
 */

const MAX_BLOCKS = 30;
const SUMMARY_LENGTH = 70;
const DRAG_ID = "drag";

export interface CopyPickerInput {
  readonly transcript: Transcript;
  readonly context: CommandContext;
  /** Whether drag-to-copy currently owns the mouse. */
  readonly mouseCopy: boolean;
  toggleMouseCopy(enabled: boolean): Promise<string | undefined>;
}

export function copyPicker(input: CopyPickerInput): Picker {
  const blocks = input.transcript.recent(MAX_BLOCKS).filter((block) => block.text.trim().length > 0);
  return {
    title: "Copy",
    form: "panel",
    empty: "Nothing in the transcript to copy yet.",
    async load(): Promise<readonly Option[]> {
      return [
        {
          id: DRAG_ID,
          label: input.mouseCopy ? "drag to copy: on" : "drag to copy: off",
          detail: input.mouseCopy
            ? "selecting with the mouse copies the text without the layout; shift-drag for the terminal's own selection"
            : "let a mouse drag copy text directly, stripped of gutters and padding",
          note: "toggle",
        },
        ...blocks.map<Option>((block, index) => ({
          id: String(index),
          label: label(block),
          detail: summarise(block.text),
          note: `${block.text.length} chars`,
        })),
      ];
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (chosen === DRAG_ID) return { note: await input.toggleMouseCopy(!input.mouseCopy) };
      const block = blocks[Number(chosen)];
      if (!block) return undefined;
      const result = await runCopyCommand([block.text], input.context);
      return { note: result.output };
    },
  };
}

function label(block: Block): string {
  return block.title ? `${block.kind} ${block.title}` : block.kind;
}

/** First non-empty line, shortened, so a row identifies the block at a glance. */
function summarise(text: string): string {
  const first = text.split("\n").find((line) => line.trim().length > 0) ?? "";
  const trimmed = first.trim();
  return trimmed.length > SUMMARY_LENGTH ? `${trimmed.slice(0, SUMMARY_LENGTH - 1)}…` : trimmed;
}
