import { describe, expect, it, vi } from "vitest";
import { pendingTurnInput } from "./pendingInput.js";
import type { TurnInput } from "./session.js";
import { inputQueueControl, PendingQueue } from '../core/agent/queue.js';
import { turnInput } from './input.js';
import type { AgentMessage } from '../core/agent/state.js';

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
  it('recalls the exact interactive follow-up in the readiness buffer and after run adoption', () => {
    const pending = pendingTurnInput();
    const image = { type: 'image' as const, data: 'AA==', mimeType: 'image/png' };
    const format = vi.fn((text: string) => text);
    pending.input.steer('steer', 'steer', { source: 'interactive' });
    pending.input.followUp('background', 'background');
    pending.input.followUp('buffered', 'buffered', { source: 'interactive', images: [image] });
    expect(pending.input.recallFollowUp?.(format)).toBe('buffered');
    expect(format).toHaveBeenLastCalledWith('buffered', [image]);
    expect(pending.input.recallFollowUp?.(format)).toBeUndefined();
    pending.input.followUp('live', 'live', { source: 'interactive', images: [image] });

    const active = turnInput(new AbortController().signal, vi.fn(), vi.fn());
    const steering = new PendingQueue<AgentMessage>(), followUps = new PendingQueue<AgentMessage>();
    const control = active.control(steering, followUps);
    pending.adopt({ input: {
      ...recordingRun().input,
      steer: (text, id, options) => { steering.enqueue(active.message(text, options), id); },
      followUp: (text, id, options) => { followUps.enqueue(active.message(text, options), id); },
      queue: control,
      recallFollowUp: control.recallFollowUp,
    } });
    expect(pending.input.queue?.edit('live', 'edited')).toBe(true);
    expect(pending.input.recallFollowUp?.(format)).toBe('edited');
    expect(format).toHaveBeenLastCalledWith('edited', [image]);
    expect(pending.input.recallFollowUp?.(format)).toBeUndefined();
    expect(control.entries().map(entry => entry.id)).toEqual(['steer', 'background']);
  });

  it('leaves an already acquired follow-up under its running input hook', async () => {
    const publish = vi.fn();
    const input = turnInput(new AbortController().signal, vi.fn(), publish);
    const steering = new PendingQueue<AgentMessage>(), followUps = new PendingQueue<AgentMessage>();
    const control = input.control(steering, followUps);
    let finish!: () => void;
    const wait = new Promise<void>(resolve => { finish = resolve; });
    followUps.enqueue(input.message('acquired', { source: 'interactive', prepare: async () => {
      await wait;
      return { status: 'continue', prompt: 'prepared', check: () => {} };
    } }));
    const delivery = input.drain(followUps, 'followUp');
    expect(control.recallFollowUp(text => text)).toBeUndefined();
    finish();
    const ready = await delivery;
    expect(control.recallFollowUp(text => text)).toBeUndefined();
    expect(input.commit(ready).messages.map(message => message.content)).toEqual(['prepared']);
    expect(publish).toHaveBeenCalledOnce();
    expect(control.recallFollowUp(text => text)).toBeUndefined();
  });

  it('reads only the adopted run compaction activity without retaining a previous run phase', () => {
    const pending = pendingTurnInput(), first = recordingRun(), second = recordingRun();
    const input = pending.input;
    let firstActive = true, secondActive = false;
    expect(input.isCompacting?.()).toBe(false);
    pending.adopt({ input: { ...first.input, isCompacting: () => firstActive } });
    expect(input.isCompacting?.()).toBe(true);
    firstActive = false; expect(input.isCompacting?.()).toBe(false);
    pending.adopt({ input: { ...second.input, isCompacting: () => secondActive } });
    firstActive = true; expect(input.isCompacting?.()).toBe(false);
    secondActive = true; expect(input.isCompacting?.()).toBe(true);
    pending.adopt(recordingRun()); expect(input.isCompacting?.()).toBe(false);
  });

  it('forwards retry cancellation to the adopted run without buffering it for a future run', () => {
    const buffered = pendingTurnInput(), first = recordingRun(), second = recordingRun();
    const firstCancel = vi.fn(), secondCancel = vi.fn();
    buffered.input.followUp('preserved input');
    buffered.input.abortRetry?.();
    buffered.adopt({ input: { ...first.input, abortRetry: firstCancel } });
    expect(firstCancel).not.toHaveBeenCalled(); expect(first.followUps).toEqual(['preserved input']);
    buffered.input.abortRetry?.(); expect(firstCancel).toHaveBeenCalledOnce();
    buffered.adopt({ input: { ...second.input, abortRetry: secondCancel } });
    expect(secondCancel).not.toHaveBeenCalled();
    buffered.input.abortRetry?.(); expect(secondCancel).toHaveBeenCalledOnce();
    expect(firstCancel).toHaveBeenCalledOnce();
  });

  it('carries queue mode changes through readiness adoption and updates the same live queue', () => {
    const buffered = pendingTurnInput();
    const setters = buffered.input as TurnInput & { setQueueMode?: (lane: 'steering' | 'followUp', mode: 'one-at-a-time' | 'all') => void };
    setters.setQueueMode?.('steering', 'one-at-a-time');
    setters.setQueueMode?.('followUp', 'all');
    buffered.input.steer('S1'); buffered.input.steer('S2');
    buffered.input.followUp('F1'); buffered.input.followUp('F2');
    const steering = new PendingQueue<string>('all');
    const followUps = new PendingQueue<string>('one-at-a-time');
    const live = { steer: (text: string, id?: string) => { steering.enqueue(text, id); },
      followUp: (text: string, id?: string) => { followUps.enqueue(text, id); },
      setQueueMode: (lane: 'steering' | 'followUp', mode: 'one-at-a-time' | 'all') => {
        (lane === 'steering' ? steering : followUps).mode = mode;
      },
      pending: () => ({ steering: steering.entries().map(entry => entry.value), followUps: followUps.entries().map(entry => entry.value) }),
      clearQueue: () => { const all = [...steering.entries(), ...followUps.entries()].map(entry => entry.value);
        steering.clear(); followUps.clear(); return all; } };
    buffered.adopt({ input: live });
    expect(steering.drain()).toEqual(['S1']);
    expect(followUps.drain()).toEqual(['F1', 'F2']);
    setters.setQueueMode?.('steering', 'all');
    buffered.input.steer('S3');
    expect(steering.drain()).toEqual(['S2', 'S3']);
  });

  it('preserves pending IDs across adoption and edits the queue consumed by the live run', () => {
    const buffered = pendingTurnInput(); buffered.input.followUp('duplicate'); buffered.input.followUp('duplicate');
    const entries = buffered.input.queue!.entries();
    const live = new PendingQueue<string>('all');
    const queue = inputQueueControl([{ lane: 'followUp', queue: live, text: value => value, replace: (_value, text) => text }]);
    buffered.adopt({ input: { steer() {}, followUp: (text, id) => { live.enqueue(text, id); }, queue,
      pending: () => ({ steering: [], followUps: live.entries().map(entry => entry.value) }), clearQueue: () => live.drain() } });
    expect(buffered.input.queue!.entries().map(entry => entry.id)).toEqual(entries.map(entry => entry.id));
    expect(buffered.input.queue!.edit(entries[1]!.id, 'changed')).toBe(true);
    expect(buffered.input.queue!.move(entries[1]!.id, entries[0]!.id)).toBe(true);
    expect(live.drain()).toEqual(['changed', 'duplicate']); expect(buffered.input.queue!.entries()).toEqual([]);
  });

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
