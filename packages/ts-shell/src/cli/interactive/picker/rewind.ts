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
  readonly turns: readonly SessionMessage[];
  readonly admission?: () => string | undefined;
  readonly signal?: AbortSignal;
  /** A one-based recent point, a stable entry id, or initial search text. */
  readonly selector?: string;
  /** Make `point` active again, and put its prompt back in the composer. */
  rewind(point: RewindPoint): Promise<PickerOutcome | undefined>;
}

export function rewindPicker(input: RewindPickerInput): Picker {
  const { signal, admission: originalAdmission } = input;
  const admission = (): string | undefined => {
    if (signal?.aborted) return 'Back selection was cancelled. Reopen /back.';
    try { return originalAdmission?.(); }
    catch { return 'Back selection is unavailable. Reopen /back.'; }
  };
  let source: RewindSource | undefined;
  let unavailable = admission();
  if (!unavailable) {
    try { source = new RewindSource(input.turns, input.signal); }
    catch { unavailable = 'Questions are unavailable or beyond back browsing limits. No point was selected.'; }
  }
  const selector = input.selector?.trim();
  const selected = source?.selection(selector);
  return questionPage(source, input.rewind, admission, selected
    ? { offset: Math.floor(selected.index / PAGE_SIZE) * PAGE_SIZE, selectedId: selected.point.entryId }
    : { query: selector }, unavailable);
}

/** Pages share the captured points; a moving turns array cannot shift a continuation. */
function questionPage(source: RewindSource | undefined, rewind: RewindPickerInput['rewind'], admission: () => string | undefined,
  page: RewindPage, unavailable?: string): Picker {
  let query = page.query?.trim().toLowerCase() ?? '';
  let offset = page.offset ?? 0;
  let offered: readonly RewindPoint[] = [];
  let total = 0;
  const moreId = source?.moreId;
  let closed = false;
  const release = (): void => { closed = true; source = undefined; offered = []; };
  const project = (filter: string): readonly Option[] => {
    const needle = filter.trim().toLowerCase();
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
  project(query);
  return {
    isCurrent: () => admission() === undefined,
    title: "Ask again from",
    form: "panel",
    exclusive: true,
    initialSelection: page.selectedId,
    initialFilter: page.query,
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
      return project(query);
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (closed || ids.length !== 1) return undefined;
      const blocked = admission();
      if (blocked) { release(); return { note: blocked }; }
      if (ids[0] === moreId) {
        if (!source || offset + PAGE_SIZE >= total) return undefined;
        const next = questionPage(source, rewind, admission, { offset: offset + PAGE_SIZE, query });
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
  return '';
}
