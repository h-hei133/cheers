import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  killProcessTree,
  processTree,
  trackChildPid,
  untrackChildPid,
} from "./processTree.js";

describe("Cross-Platform ProcessTree Lifecycle", () => {
  beforeEach(() => {
    processTree.killAllTracked();
  });

  afterEach(() => {
    processTree.killAllTracked();
  });

  it("tracks and untracks PIDs correctly", () => {
    trackChildPid(12345);
    expect(processTree.getTrackedCount()).toBe(1);

    trackChildPid(67890);
    expect(processTree.getTrackedCount()).toBe(2);

    untrackChildPid(12345);
    expect(processTree.getTrackedCount()).toBe(1);
  });

  it("handles non-existent process kill gracefully without throwing", () => {
    expect(() => {
      killProcessTree(999999);
    }).not.toThrow();
  });
});
