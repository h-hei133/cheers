import { runCopyCommand } from "../../../core/commands/copyCommandRuntime.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Block } from "../../../presentation/tui/transcript/blocks.js";
import type { Transcript } from "../../../presentation/tui/transcript/container.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";

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

export function copyPicker(transcript: Transcript, context: CommandContext): Picker {
  const blocks = transcript.recent(MAX_BLOCKS).filter((block) => block.text.trim().length > 0);
  return {
    title: "Copy block",
    form: "panel",
    empty: "Nothing in the transcript to copy yet.",
    async load(): Promise<readonly Option[]> {
      return blocks.map<Option>((block, index) => ({
        id: String(index),
        label: label(block),
        detail: summarise(block.text),
        note: `${block.text.length} chars`,
      }));
    },
    async apply(ids: readonly string[]): Promise<string | undefined> {
      const block = blocks[Number(ids[0])];
      if (!block) return undefined;
      const result = await runCopyCommand([block.text], context);
      return result.output;
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
