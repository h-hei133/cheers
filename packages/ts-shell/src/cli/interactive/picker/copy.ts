import { runCopyCommand } from "../../../core/commands/copyCommandRuntime.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Transcript } from "../../../presentation/tui/transcript/container.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { CopySource, copySummary, type CopyEntry } from './copy/source.js';

/**
 * Copy chooser.
 *
 * Dragging across the terminal copies cells, which means it also copies the
 * indentation that makes a transcript readable — the pasted text comes back with
 * every line prefixed by spaces. Copying a block by identity instead puts its
 * source text on the clipboard exactly as it arrived, whole, however it was
 * laid out on screen.
 */

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
  const revision = transcript.revision;
  const pageSize = Number.isSafeInteger(options.pageSize) ? Math.min(PAGE_SIZE, Math.max(1, options.pageSize!)) : PAGE_SIZE;
  const offset = Number.isSafeInteger(options.offset) ? Math.max(0, options.offset!) : 0;
  return copyPage(transcript, context, undefined, revision, pageSize, offset);
}

/** Every page shares the original source revision and unformatted text. */
function copyPage(transcript: Transcript, context: CommandContext, source: CopySource | undefined, revision: number,
  pageSize: number, initialOffset: number, initialQuery = ''): Picker {
  let offset = initialOffset;
  let query = initialQuery;
  let offered: readonly CopyEntry[] = [];
  let total = 0;
  let closed = false;
  const release = (): void => { closed = true; source = undefined; offered = []; };
  const admission = (): string | undefined => {
    if (context.signal?.aborted) return 'Copy cancelled. Reopen /copy before choosing a source.';
    try { return context.admission?.(); }
    catch { return 'Copy is unavailable. Reopen /copy before choosing a source.'; }
  };
  const project = (filter: string): readonly Option[] => {
    const needle = filter.trim().toLowerCase();
    if (needle !== query) offset = 0;
    query = needle;
    const page = source?.page(query, offset, pageSize);
    total = page?.total ?? 0;
    offered = page?.entries ?? [];
    const rows = offered.map<Option>(entry => ({ id: entry.id, label: entry.label,
      detail: copySummary(entry.text), note: `${entry.text.length} chars` }));
    if (offset + pageSize < total) rows.push({ id: MORE_ID, label: 'More blocks',
      detail: 'Continue to older blocks', note: `${total - offset - pageSize} remaining` });
    return rows;
  };
  return {
    isCurrent: () => admission() === undefined,
    title: "Copy block",
    form: "panel",
    initialFilter: query,
    empty: "Nothing in the transcript to copy yet.",
    loadError: 'Copy sources are unavailable, changed, or beyond browsing limits. No source was selected.',
    status: () => `Source revision ${revision}; blocks ${total === 0 ? '0' : `${offset + 1}-${offset + offered.length}`} of ${total}${offset + pageSize < total ? '; more available' : '; end of blocks'}`,
    filterOptions: project,
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      if (closed) throw new Error('Copy picker is closed.');
      const blocked = admission();
      if (blocked) throw new Error(blocked);
      if (transcript.revision !== revision) throw new Error('Transcript changed after this copy list opened.');
      if (!source) {
        source = new CopySource(transcript, signal);
        const count = source.page('', 0, 0).total;
        offset = Math.min(offset, Math.max(0, count - 1));
      }
      return project(query);
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (closed || ids.length !== 1) return undefined;
      const blocked = admission();
      if (blocked) { release(); return { note: blocked }; }
      if (transcript.revision !== revision) {
        release();
        return { note: "Transcript changed after this copy list opened; reopen /copy before copying." };
      }
      if (ids[0] === MORE_ID) {
        if (!source || offset + pageSize >= total) return undefined;
        const next = copyPage(transcript, context, source, revision, pageSize, offset + pageSize, query);
        release();
        return { next };
      }
      const entry = offered.find(candidate => candidate.id === ids[0]);
      if (!entry) return undefined;
      release();
      const result = await runCopyCommand([entry.text], { ...context, rawCommandArgs: undefined });
      return { note: result.output };
    },
    previewEnd: release,
  };
}
