import { describe, expect, it } from "vitest";
import { PendingQueue } from "./queue.js";

describe("PendingQueue", () => {
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
