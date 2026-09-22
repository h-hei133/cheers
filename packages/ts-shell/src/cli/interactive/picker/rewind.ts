import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { SessionMessage } from "../../../session/schema/sessionMessage.js";
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
 * Choosing one drops every turn after it and puts that question back in the prompt
 * to be asked differently. Files are untouched: reconsidering the question and
 * reverting the work are separate decisions, and `/undo` is the other one.
 */

const MAX_POINTS = 25;
const SUMMARY_LENGTH = 72;

export interface RewindPoint {
  /** Number of turns kept when rewinding here — the index of this message. */
  readonly turnIndex: number;
  readonly prompt: string;
  /** Turns that would be dropped. */
  readonly dropped: number;
}

export interface RewindPickerInput {
  readonly turns: readonly SessionMessage[];
  /** Drop everything after `point`, and put its prompt back in the composer. */
  rewind(point: RewindPoint): Promise<string | undefined>;
}

export function rewindPicker(input: RewindPickerInput): Picker {
  const points = rewindPoints(input.turns);
  return {
    title: "Go back to",
    form: "panel",
    empty: "Nothing to go back to yet — no questions have been asked in this session.",
    async load(): Promise<readonly Option[]> {
      return points.map<Option>((point) => ({
        id: String(point.turnIndex),
        label: summarise(point.prompt),
        detail: describeCost(point.dropped),
        note: "keeps files",
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const point = points.find((candidate) => String(candidate.turnIndex) === ids[0]);
      if (!point) return undefined;
      const note = await input.rewind(point);
      return { note, draft: point.prompt };
    },
  };
}

/** The questions in a session, newest first, each with what going back would cost. */
export function rewindPoints(turns: readonly SessionMessage[]): RewindPoint[] {
  const points: RewindPoint[] = [];
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index]!;
    if (turn.role !== "user" || turn.content.trim().length === 0) continue;
    points.push({ turnIndex: index, prompt: turn.content.trim(), dropped: turns.length - index });
  }
  return points.reverse().slice(0, MAX_POINTS);
}

/** What choosing this point costs, in what was said rather than in turn counts. */
function describeCost(dropped: number): string {
  if (dropped <= 1) return "the most recent question";
  const exchanges = Math.max(1, Math.round(dropped / 2));
  return exchanges === 1 ? "forgets one exchange after it" : `forgets ${exchanges} exchanges after it`;
}

function summarise(prompt: string): string {
  const first = prompt.split("\n").find((line) => line.trim().length > 0) ?? "";
  const trimmed = first.trim();
  return trimmed.length > SUMMARY_LENGTH ? `${trimmed.slice(0, SUMMARY_LENGTH - 1)}…` : trimmed;
}
