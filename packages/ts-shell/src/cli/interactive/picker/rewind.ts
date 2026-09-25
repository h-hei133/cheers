import { messageToText } from "../../../model-adapters/multimodal.js";
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
 * Choosing one puts that question back in the prompt to be asked differently, and
 * moves the conversation to that point. What came after is not erased — it stays
 * in the session, so returning to that direction later finds it intact. Files are
 * untouched: reconsidering the question and reverting the work are separate
 * decisions, and `/undo` is the other one.
 */

const MAX_POINTS = 25;
const SUMMARY_LENGTH = 72;

export interface RewindPoint {
  /** The entry to make active, so the choice survives the turns moving. */
  readonly entryId: string;
  readonly prompt: string;
  /** Turns that would be left behind. */
  readonly dropped: number;
}

export interface RewindPickerInput {
  readonly turns: readonly SessionMessage[];
  /** Make `point` active again, and put its prompt back in the composer. */
  rewind(point: RewindPoint): Promise<string | undefined>;
}

export function rewindPicker(input: RewindPickerInput): Picker {
  const points = rewindPoints(input.turns);
  return {
    title: "Ask again from",
    form: "panel",
    empty: "Nothing to go back to yet — no questions have been asked in this session.",
    async load(): Promise<readonly Option[]> {
      return points.map<Option>((point) => ({
        id: point.entryId,
        label: summarise(point.prompt),
        detail: describeCost(point.dropped),
        note: "keeps files",
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const point = points.find((candidate) => candidate.entryId === ids[0]);
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
    // A turn always has an id once recorded, but a session written before ids
    // existed does not. Those cannot be gone back to by name, so they are left
    // out rather than offered as a choice that would not survive being made.
    if (turn.id === undefined) continue;
    if (turn.role !== "user" || messageToText(turn.content).trim().length === 0) continue;
    points.push({
      entryId: turn.id,
      prompt: messageToText(turn.content).trim(),
      // Counts what is left behind, which is everything after this question.
      // The question itself stays — it is what goes back in the editor — so
      // including it would overstate the cost by one every time.
      dropped: turns.length - index - 1,
    });
  }
  return points.reverse().slice(0, MAX_POINTS);
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
  if (dropped === 0) return "drops the answer to this question";
  if (dropped === 1) return "drops one turn after this question";
  return `drops ${dropped} turns after this question`;
}

function summarise(prompt: string): string {
  const first = prompt.split("\n").find((line) => line.trim().length > 0) ?? "";
  const trimmed = first.trim();
  return trimmed.length > SUMMARY_LENGTH ? `${trimmed.slice(0, SUMMARY_LENGTH - 1)}…` : trimmed;
}
