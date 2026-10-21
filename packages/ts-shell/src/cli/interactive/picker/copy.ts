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
 * source text on the clipboard exactly as it arrived, whole, however it was
 * laid out on screen.
 */

const SUMMARY_LENGTH = 70;
const PAGE_SIZE = 100;
const MORE_ID = "__more__";

export interface CopyPickerOptions {
  readonly offset?: number;
  readonly pageSize?: number;
}

export function copyPicker(
  transcript: Transcript,
  context: CommandContext,
  options: CopyPickerOptions = {},
): Picker {
  const entries = [...transcript.copyable()].reverse().filter(block => block.text.trim().length > 0)
    .map((block, index) => ({ id: String(index), label: label(block), text: block.text }));
  const revision = transcript.revision;
  const pageSize = Number.isSafeInteger(options.pageSize) ? Math.min(PAGE_SIZE, Math.max(1, options.pageSize!)) : PAGE_SIZE;
  const offset = Number.isSafeInteger(options.offset) ? Math.min(Math.max(0, options.offset!), Math.max(0, entries.length - 1)) : 0;
  return copyPage(transcript, context, entries, revision, pageSize, offset);
}

interface CopyEntry { readonly id: string; readonly label: string; readonly text: string }

/** Every page shares the original source revision and unformatted text. */
function copyPage(transcript: Transcript, context: CommandContext, entries: readonly CopyEntry[], revision: number,
  pageSize: number, initialOffset: number, initialQuery = ''): Picker {
  let offset = initialOffset;
  let query = initialQuery;
  let offered: readonly CopyEntry[] = [];
  let total = 0;
  const project = (filter: string): readonly Option[] => {
    const needle = filter.trim().toLowerCase();
    if (needle !== query) offset = 0;
    query = needle;
    const matches = query ? entries.filter(entry => `${entry.label} ${entry.text}`.toLowerCase().includes(query)) : entries;
    total = matches.length;
    offered = matches.slice(offset, offset + pageSize);
    const rows = offered.map<Option>(entry => ({ id: entry.id, label: entry.label,
      detail: summarise(entry.text), note: `${entry.text.length} chars` }));
    if (offset + pageSize < total) rows.push({ id: MORE_ID, label: 'More blocks',
      detail: 'Continue to older blocks', note: `${total - offset - pageSize} remaining` });
    return rows;
  };
  project(query);
  return {
    title: "Copy block",
    form: "panel",
    initialFilter: query,
    empty: "Nothing in the transcript to copy yet.",
    status: () => `Source revision ${revision}; blocks ${total === 0 ? '0' : `${offset + 1}-${offset + offered.length}`} of ${total}${offset + pageSize < total ? '; more available' : '; end of blocks'}`,
    filterOptions: project,
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      return project(query);
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (ids.length !== 1) return undefined;
      if (transcript.revision !== revision) {
        return { note: "Transcript changed after this copy list opened; reopen /copy before copying." };
      }
      if (ids[0] === MORE_ID) {
        return offset + pageSize < total
          ? { next: copyPage(transcript, context, entries, revision, pageSize, offset + pageSize, query) } : undefined;
      }
      const entry = offered.find(candidate => candidate.id === ids[0]);
      if (!entry) return undefined;
      const result = await runCopyCommand([entry.text], { ...context, rawCommandArgs: undefined });
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
