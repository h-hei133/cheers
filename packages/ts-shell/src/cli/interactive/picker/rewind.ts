import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { SessionMessage } from "../../../session/schema/sessionMessage.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { RewindSource, type RewindPoint } from './rewind/source.js';
export { rewindPoints, type RewindPoint } from './rewind/source.js';

/**
 * Going back to an earlier point in the conversation.
 *
 * Reached by pressing Escape twice, because it is the gesture for "no, back up"
 * and the second press is what distinguishes backing out of a keystroke from
 * backing out of a direction. The list is the questions that were asked, newest
 * first, since that is what a person remembers about where the conversation went
 * wrong.
 *
 * Choosing one puts that question back in the prompt to be asked differently, and
 * moves the conversation to that point. What came after is not erased — it stays
 * in the session, so returning to that direction later finds it intact. Files are
 * untouched: reconsidering the question and reverting the work are separate
 * decisions, and `/undo` is the other one.
 */

const PAGE_SIZE = 25;
const SUMMARY_LENGTH = 72;

interface RewindPage {
  readonly offset?: number;
  readonly query?: string;
  readonly selectedId?: string;
}

export interface RewindPickerInput {
  readonly turns?: readonly SessionMessage[];
  readonly readTurns?: (signal?: AbortSignal) => Promise<RewindTurns> | RewindTurns;
  readonly version?: string;
  readonly unavailable?: boolean;
  readonly admission?: () => string | undefined;
  readonly signal?: AbortSignal;
  /** A one-based recent point, a stable entry id, or initial search text. */
  readonly selector?: string;
  /** Make `point` active again, and put its prompt back in the composer. */
  rewind(point: RewindPoint): Promise<PickerOutcome | undefined>;
}

type RewindTurns = readonly SessionMessage[] | {
  readonly turns: readonly SessionMessage[];
  readonly version?: string;
};

export function rewindPicker(input: RewindPickerInput): Picker {
  const { signal, admission: originalAdmission } = input;
  const admission = (): string | undefined => {
    if (signal?.aborted) return 'Back selection was cancelled. Reopen /back.';
    try {
      const blocked = originalAdmission?.();
      return signal?.aborted ? 'Back selection was cancelled. Reopen /back.' : blocked;
    }
    catch { return 'Back selection is unavailable. Reopen /back.'; }
  };
  let source: RewindSource | undefined;
  let unavailable = input.unavailable ? 'Questions are unavailable. Reopen /back.' : admission();
  if (!unavailable && input.turns) {
    try { source = new RewindSource(input.turns, input.signal, input.version); }
    catch { unavailable = 'Questions are unavailable or beyond back browsing limits. No point was selected.'; }
  }
  const selector = input.selector?.trim();
  let sourcePending: Promise<RewindSource> | undefined;
  const ensureSource = async (browserSignal?: AbortSignal): Promise<RewindSource> => {
    if (source) return source;
    if (!input.readTurns) throw new Error('Back source is unavailable.');
    const current = signal && browserSignal ? AbortSignal.any([signal, browserSignal]) : signal ?? browserSignal;
    sourcePending ??= (async () => {
      current?.throwIfAborted();
      const loaded = await input.readTurns!(current);
      current?.throwIfAborted();
      const blocked = admission();
      if (blocked) throw new Error(blocked);
      current?.throwIfAborted();
      const wrapped = isWrappedTurns(loaded);
      const turns = wrapped ? loaded.turns : loaded;
      const version = wrapped ? loaded.version : input.version;
      return RewindSource.create(turns, current, version);
    })();
    try {
      source = await sourcePending;
      return source;
    } catch {
      sourcePending = undefined;
      current?.throwIfAborted();
      throw new Error('Questions are unavailable or beyond back browsing limits.');
    }
  };
  return questionPage(
    source,
    ensureSource,
    input.rewind,
    admission,
    { query: selector, selector },
    unavailable,
  );
}

function isWrappedTurns(value: RewindTurns): value is Exclude<RewindTurns, readonly SessionMessage[]> {
  return !Array.isArray(value);
}

/** Pages share the captured points; a moving turns array cannot shift a continuation. */
function questionPage(
  initialSource: RewindSource | undefined,
  ensureSource: (signal?: AbortSignal) => Promise<RewindSource>,
  rewind: RewindPickerInput['rewind'],
  admission: () => string | undefined,
  page: RewindPage & { readonly selector?: string },
  unavailable?: string,
): Picker {
  let source = initialSource;
  let query = page.query?.trim().toLowerCase() ?? '';
  let offset = page.offset ?? 0;
  let selectedId = page.selectedId;
  let resolvedFilter: string | undefined;
  let offered: readonly RewindPoint[] = [];
  let total = 0;
  let moreId = source?.moreId ?? '__more__';
  let positioned = source !== undefined;
  let pendingInitialFilter = false;
  let closed = false;
  const release = (): void => { closed = true; source = undefined; offered = []; };
  const position = (): void => {
    const selected = source?.selection(page.selector);
    if (!selected || !source) return;
    selectedId = selected.point.entryId;
    resolvedFilter = '';
    const index = source.indexOf('', selected.point.entryId);
    offset = index === undefined ? 0 : Math.floor(index / PAGE_SIZE) * PAGE_SIZE;
  };
  const project = (filter: string): readonly Option[] => {
    let needle = filter.trim().toLowerCase();
    if (pendingInitialFilter && needle === page.query?.trim().toLowerCase()) {
      pendingInitialFilter = false;
      needle = resolvedFilter ?? '';
    }
    if (needle !== query) offset = 0;
    query = needle;
    const result = source?.page(query, offset, PAGE_SIZE);
    total = result?.total ?? 0;
    offered = result?.entries ?? [];
    const rows = offered.map<Option>(point => ({
      id: point.entryId, label: summarise(point.prompt), detail: describeCost(point.dropped), note: 'keeps files',
    }));
    if (moreId && offset + PAGE_SIZE < total) rows.push({ id: moreId, label: 'More questions',
      detail: 'Continue to older questions', note: `${total - offset - PAGE_SIZE} remaining` });
    return rows;
  };
  if (source) {
    position();
    positioned = true;
    pendingInitialFilter = resolvedFilter !== undefined && page.query !== undefined;
  }
  if (resolvedFilter !== undefined) query = resolvedFilter;
  project(resolvedFilter ?? query);
  return {
    isCurrent: () => admission() === undefined,
    title: "Ask again from",
    form: "panel",
    exclusive: true,
    get initialSelection() { return selectedId; },
    initialFilter: page.query,
    get resolvedFilter() { return resolvedFilter; },
    empty: 'No questions to show.',
    loadError: 'Questions are unavailable, changed, or beyond back browsing limits. No point was selected.',
    status() {
      if (total === 0) return query ? 'No questions match this search.'
        : 'Nothing to go back to yet — no questions have been asked in this session.';
      return `Questions ${offset + 1}-${offset + offered.length} of ${total}${offset + PAGE_SIZE < total ? '; more available' : '; end of questions'}`;
    },
    filterOptions: project,
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      if (closed) throw new Error('Back picker is closed.');
      const blocked = admission();
      if (blocked || unavailable) { release(); throw new Error(blocked ?? unavailable); }
      if (!source) {
        try {
          source = await ensureSource(signal);
          signal?.throwIfAborted();
          const blocked = admission();
          if (blocked) throw new Error(blocked);
          if (closed) throw new Error('Back picker is closed.');
          moreId = source.moreId;
          if (!positioned) {
            position();
            positioned = true;
          }
        } catch (error) {
          release();
          throw error;
        }
      }
      signal?.throwIfAborted();
      const final = admission();
      if (final) { release(); throw new Error(final); }
      signal?.throwIfAborted();
      if (closed) throw new Error('Back picker is closed.');
      if (resolvedFilter !== undefined) query = resolvedFilter;
      const rows = project(resolvedFilter ?? query);
      pendingInitialFilter = false;
      return rows;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (closed || ids.length !== 1) return undefined;
      const blocked = admission();
      if (blocked) { release(); return { note: blocked }; }
      if (ids[0] === moreId) {
        if (!source || offset + PAGE_SIZE >= total) return undefined;
        const next = questionPage(source, ensureSource, rewind, admission, { offset: offset + PAGE_SIZE, query });
        release();
        return { next };
      }
      const point = offered.find(candidate => candidate.entryId === ids[0]);
      if (!point) return undefined;
      release();
      return rewind(point);
    },
    previewEnd: release,
  };
}

/**
 * What choosing this point does.
 *
 * Phrased as what the user gets back rather than what is lost. "Forgets one
 * exchange" described the same thing but read as damage, and on the newest
 * question it read as nothing happening at all — which is what a person saw when
 * they chose the top of the list expecting to re-ask it and found the screen
 * unchanged.
 */
function describeCost(dropped: number): string {
  if (dropped === 0) return "continues from this question";
  if (dropped === 1) return "keeps one later message in the tree";
  return `keeps ${dropped} later messages in the tree`;
}

function summarise(prompt: string): string {
  let start = 0;
  while (start < prompt.length) {
    const newline = prompt.indexOf('\n', start);
    const end = newline < 0 ? prompt.length : newline;
    const line = prompt.slice(start, end).trim();
    if (line) return line.length > SUMMARY_LENGTH ? `${line.slice(0, SUMMARY_LENGTH - 1)}…` : line;
    start = end + 1;
  }
  return 'Image message';
}
