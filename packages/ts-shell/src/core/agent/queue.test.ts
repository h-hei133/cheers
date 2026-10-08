import { describe, expect, it } from "vitest";
import { inputQueueControl, PendingQueue } from "./queue.js";

describe("PendingQueue", () => {
  it('edits, reorders and cancels the actual pending sequence while retaining stable IDs for duplicate text', () => {
    const queue = new PendingQueue<string>('all');
    const first = queue.enqueue('same'); const second = queue.enqueue('same'); const third = queue.enqueue('last');
    expect(first).not.toBe(second);
    expect(queue.edit(second, 'edited')).toBe(true);
    expect(queue.move(third, first)).toBe(true);
    expect(queue.cancel(first)).toBe(true);
    expect(queue.entries().map(entry => entry.id)).toEqual([third, second]);
    expect(queue.drain()).toEqual(['last', 'edited']);
    expect(queue.edit(second, 'too late')).toBe(false);
    expect(queue.cancel(second)).toBe(false);
  });

  it('reports actual delivery stages and refuses reordering across their execution boundary', () => {
    const steering = new PendingQueue<string>(); const followUps = new PendingQueue<string>();
    const early = steering.enqueue('steer'); const later = followUps.enqueue('follow up');
    const control = inputQueueControl([
      { lane: 'steering', queue: steering, text: value => value, replace: (_value, text) => text },
      { lane: 'followUp', queue: followUps, text: value => value, replace: (_value, text) => text },
    ]);
    expect(control.entries().map(entry => entry.lane)).toEqual(['steering', 'followUp']);
    expect(control.move(later, early)).toBe(false);
    expect(control.edit(later, 'new follow up')).toBe(true);
    expect(steering.drain()).toEqual(['steer']); expect(followUps.drain()).toEqual(['new follow up']);
  });

  it("drains one message at a time by default", () => {
    const queue = new PendingQueue<string>();
    queue.enqueue("first");
    queue.enqueue("second");

    expect(queue.drain()).toEqual(["first"]);
    expect(queue.hasItems()).toBe(true);
    expect(queue.drain()).toEqual(["second"]);
    expect(queue.hasItems()).toBe(false);
  });

  it("drains everything at once in all mode", () => {
    const queue = new PendingQueue<string>("all");
    queue.enqueue("first");
    queue.enqueue("second");

    expect(queue.drain()).toEqual(["first", "second"]);
    expect(queue.hasItems()).toBe(false);
  });

  it("returns an empty drain when there is nothing queued", () => {
    const queue = new PendingQueue<string>();
    expect(queue.drain()).toEqual([]);
    expect(queue.hasItems()).toBe(false);
  });

  it("hands out a copy so caller mutation cannot corrupt the queue", () => {
    const queue = new PendingQueue<string>("all");
    queue.enqueue("first");

    const drained = queue.drain();
    drained.push("forged");
    expect(queue.hasItems()).toBe(false);
    queue.enqueue("second");
    expect(queue.drain()).toEqual(["second"]);
  });

  it("clears pending messages without draining", () => {
    const queue = new PendingQueue<string>();
    queue.enqueue("first");
    queue.clear();
    expect(queue.hasItems()).toBe(false);
    expect(queue.drain()).toEqual([]);
  });

  it("allows switching the drain mode", () => {
    const queue = new PendingQueue<string>();
    queue.enqueue("first");
    queue.enqueue("second");
    queue.mode = "all";
    expect(queue.drain()).toEqual(["first", "second"]);
  });
});
