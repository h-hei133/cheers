import { afterEach, describe, expect, it } from "vitest";

import {
  createRealTaskLoopFixture,
  readRealTaskLoopTarget,
  removeRealTaskLoopFixture,
  verifyRealTaskLoopReadback,
  type RealTaskLoopFixture,
} from "./realTaskLoopFixture.js";

const fixtures: RealTaskLoopFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    removeRealTaskLoopFixture(fixture);
  }
});

describe("realTaskLoopFixture", () => {
  it("creates a temp-only controlled smoke fixture with no production mutation", () => {
    const fixture = createRealTaskLoopFixture({ fixtureId: "fixture-test" });
    fixtures.push(fixture);

    expect(fixture.workspaceRoot).toContain("private-agents-real-task-loop-");
    expect(readRealTaskLoopTarget(fixture)).toContain("startApp");
    expect(fixture.evidence).toContain("real-task-loop-fixture:no-production-workspace");
  });

  it("verifies safe readback without dumping raw content", () => {
    const fixture = createRealTaskLoopFixture({ fixtureId: "readback-test" });
    fixtures.push(fixture);

    const readback = verifyRealTaskLoopReadback({
      fixture,
      content: fixture.expectedPostApplyContent,
    });

    expect(readback.status).toBe("passed");
    expect(readback.evidence).toContain("real-task-loop-readback:raw-content-excluded");
  });
});
