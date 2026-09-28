import { describe, expect, it } from "vitest";
import { pendingTurnInput } from "./pendingInput.js";
import type { TurnInput } from "./session.js";

/** A run's own handle, recording what reaches it. */
function recordingRun(): {
  readonly input: TurnInput;
  readonly steering: string[];
  readonly followUps: string[];
  readonly clears: () => number;
} {
  const steering: string[] = [];
  const followUps: string[] = [];
  let clears = 0;
  return {
    steering,
    followUps,
    clears: () => clears,
    input: {
      steer: (text) => steering.push(text),
      followUp: (text) => followUps.push(text),
      pending: () => ({ steering: [...steering], followUps: [...followUps] }),
      clearQueue: () => {
        clears += 1;
        const taken = [...steering, ...followUps];
        steering.length = 0;
        followUps.length = 0;
        return taken;
      },
    },
  };
}

describe("input held before a run exists", () => {
  it("holds what arrives, then hands it to the run when it is adopted", () => {
    const buffered = pendingTurnInput();
    buffered.input.steer("steered early");
    buffered.input.followUp("queued early");
    expect(buffered.input.pending()).toEqual({
      steering: ["steered early"],
      followUps: ["queued early"],
    });

    const run = recordingRun();
    buffered.adopt(run);
    expect(run.steering).toEqual(["steered early"]);
    expect(run.followUps).toEqual(["queued early"]);
    // Handed over exactly once: the run holds one copy, not the buffer plus one.
    expect(buffered.input.pending()).toEqual({
      steering: ["steered early"],
      followUps: ["queued early"],
    });
  });

  it("reports and drains the run's queue once the run holds the messages", () => {
    // The defect this pins: answering from the local buffer alone reported an
    // empty queue while the run held the message, so an interrupt handed the
    // user's text back to nothing and it was lost.
    const buffered = pendingTurnInput();
    buffered.adopt(recordingRun());
    buffered.input.steer("typed mid-turn");

    expect(buffered.input.pending().steering).toEqual(["typed mid-turn"]);
    expect(buffered.input.clearQueue()).toEqual(["typed mid-turn"]);
    expect(buffered.input.pending().steering).toEqual([]);
  });

  it("hands undelivered text back once, and only what was not yet delivered", () => {
    const buffered = pendingTurnInput();
    buffered.input.steer("before the run");
    const run = recordingRun();
    buffered.adopt(run);
    run.input.steer("after the run");

    // The run's own queue is what it has not consumed; the shared handle asks
    // the run, so the answer is the union and the second read is empty.
    expect(buffered.input.clearQueue()).toEqual(["before the run", "after the run"]);
    expect(buffered.input.clearQueue()).toEqual([]);
  });

  it("keeps holding when the run turned out to take no input", () => {
    // "This run reads no input" is not "the run has not started": nothing was
    // adopted, so the text is still there for the caller to hand back.
    const buffered = pendingTurnInput();
    buffered.input.steer("typed at a run that takes none");
    buffered.adopt(undefined);
    buffered.adopt({});

    expect(buffered.input.pending().steering).toEqual(["typed at a run that takes none"]);
    expect(buffered.input.clearQueue()).toEqual(["typed at a run that takes none"]);
  });
});
