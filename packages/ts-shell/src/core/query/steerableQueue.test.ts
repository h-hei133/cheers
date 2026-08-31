import { describe, it, expect, beforeEach } from "vitest";
import { steerableQueue } from "./steerableQueue.js";

describe("SteerableQueueManager", () => {
  beforeEach(() => {
    steerableQueue.clear();
  });

  it("queues and drains mid-turn steering messages", () => {
    expect(steerableQueue.hasSteering()).toBe(false);

    steerableQueue.steer("Please focus on fixing the failing test first.");
    expect(steerableQueue.hasSteering()).toBe(true);

    const drained = steerableQueue.drainSteering();
    expect(drained.length).toBe(1);
    expect(drained[0].content).toBe("Please focus on fixing the failing test first.");
    expect(steerableQueue.hasSteering()).toBe(false);
  });

  it("queues and drains follow-up messages", () => {
    expect(steerableQueue.hasFollowUp()).toBe(false);

    steerableQueue.followUp("After fixing, run npm run build");
    expect(steerableQueue.hasFollowUp()).toBe(true);

    const drained = steerableQueue.drainFollowUp();
    expect(drained.length).toBe(1);
    expect(drained[0].content).toBe("After fixing, run npm run build");
    expect(steerableQueue.hasFollowUp()).toBe(false);
  });
});
