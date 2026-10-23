import { messageToText } from "../../../model-adapters/multimodal.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { SessionMessage } from "../../../session/schema/sessionMessage.js";
import { isSessionContextMessage } from '../../../session/schema/sessionMessage.js';
import type { Picker, PickerOutcome } from "../overlay.js";

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
const MORE_ID = "__more__";
const SUMMARY_LENGTH = 72;

interface RewindPage {
  readonly offset?: number;
  readonly query?: string;
  readonly selectedId?: string;
}

export interface RewindPoint {
  /** The entry to make active, so the choice survives the turns moving. */
  readonly entryId: string;
  readonly prompt: string;
  /** Turns that would be left behind. */
  readonly dropped: number;
  /** Saved source version offered by a persistent tree. */
  readonly version?: string;
}

export interface RewindPickerInput {
  readonly turns: readonly SessionMessage[];
  /** A one-based recent point, a stable entry id, or initial search text. */
  readonly selector?: string;
  /** Make `point` active again, and put its prompt back in the composer. */
  rewind(point: RewindPoint): Promise<PickerOutcome | undefined>;
}

export function rewindPicker(input: RewindPickerInput): Picker {
  const points = rewindPoints(input.turns);
  const selector = input.selector?.trim();
  const selectedIndex = selector && /^[1-9]\d*$/.test(selector)
    ? Number(selector) - 1
    : points.findIndex(point => point.entryId === selector);
  const selected = points[selectedIndex];
  return questionPage(points, input.rewind, selected
    ? { offset: Math.floor(selectedIndex / PAGE_SIZE) * PAGE_SIZE, selectedId: selected.entryId }
    : { query: selector });
}

/** Pages share the captured points; a moving turns array cannot shift a continuation. */
function questionPage(points: readonly RewindPoint[], rewind: RewindPickerInput['rewind'], page: RewindPage): Picker {
  let query = page.query?.trim().toLowerCase() ?? '';
  let offset = page.offset ?? 0;
  let offered: readonly RewindPoint[] = [];
  let total = 0;
  let moreId = MORE_ID;
  while (points.some(point => point.entryId === moreId)) moreId += '_';
  const project = (filter: string): readonly Option[] => {
    const needle = filter.trim().toLowerCase();
    if (needle !== query) offset = 0;
    query = needle;
    const matches = query ? points.filter(point => `${point.entryId} ${point.prompt}`.toLowerCase().includes(query)) : points;
    total = matches.length;
    offered = matches.slice(offset, offset + PAGE_SIZE);
    const rows = offered.map<Option>(point => ({
      id: point.entryId, label: summarise(point.prompt), detail: describeCost(point.dropped), note: 'keeps files',
    }));
    if (offset + PAGE_SIZE < total) rows.push({ id: moreId, label: 'More questions',
      detail: 'Continue to older questions', note: `${total - offset - PAGE_SIZE} remaining` });
    return rows;
  };
  project(query);
  return {
    title: "Ask again from",
    form: "panel",
    exclusive: true,
    initialSelection: page.selectedId,
    initialFilter: page.query,
    empty: 'No questions to show.',
    status() {
      if (total === 0) return query ? 'No questions match this search.'
        : 'Nothing to go back to yet — no questions have been asked in this session.';
      return `Questions ${offset + 1}-${offset + offered.length} of ${total}${offset + PAGE_SIZE < total ? '; more available' : '; end of questions'}`;
    },
    filterOptions: project,
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      return project(query);
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (ids.length !== 1) return undefined;
      if (ids[0] === moreId) {
        return offset + PAGE_SIZE < total ? { next: questionPage(points, rewind, { offset: offset + PAGE_SIZE, query }) } : undefined;
      }
      const point = offered.find(candidate => candidate.entryId === ids[0]);
      if (!point) return undefined;
      return rewind(point);
    },
  };
}

/** The questions in a session, newest first, each with what going back would cost. */
export function rewindPoints(turns: readonly SessionMessage[]): RewindPoint[] {
  const points: RewindPoint[] = [];
  const messages = turns.filter(turn => !isSessionContextMessage(turn));
  for (let index = 0; index < messages.length; index++) {
    const turn = messages[index]!;
    // A turn always has an id once recorded, but a session written before ids
    // existed does not. Those cannot be gone back to by name, so they are left
    // out rather than offered as a choice that would not survive being made.
    if (turn.id === undefined) continue;
    if (turn.role !== "user" || messageToText(turn.content).trim().length === 0) continue;
    points.push({
      entryId: turn.id,
      prompt: messageToText(turn.content),
      // Counts what is left behind, which is everything after this question.
      // The question itself stays — it is what goes back in the editor — so
      // including it would overstate the cost by one every time.
      dropped: messages.length - index - 1,
    });
  }
  return points.reverse();
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
  const first = prompt.split("\n").find((line) => line.trim().length > 0) ?? "";
  const trimmed = first.trim();
  return trimmed.length > SUMMARY_LENGTH ? `${trimmed.slice(0, SUMMARY_LENGTH - 1)}…` : trimmed;
}
