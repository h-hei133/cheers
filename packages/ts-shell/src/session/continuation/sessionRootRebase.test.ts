import { describe, expect, it } from "vitest";

import { projectSessionRootRebase } from "./sessionRootRebase.js";

describe("session root rebase", () => {
  it("rebases working-memory root anchors and approval cache keys together", () => {
    const projection = projectSessionRootRebase({
      previousRoot: "/repo/old",
      nextProjectRoot: "/repo/new",
      workingMemory: {
        summary: ["Touched /repo/old/src/app.ts"],
        approvalAudit: {
          projectRoot: "/repo/old",
          cacheKey: "/repo/old|write:/repo/old/src/app.ts",
        },
      },
    });

    expect(projection).toEqual({
      projectRoot: "/repo/new",
      workingMemory: {
        summary: ["Touched /repo/new/src/app.ts"],
        approvalAudit: {
          projectRoot: "/repo/new",
          cacheKey: "/repo/new|write:/repo/new/src/app.ts",
        },
      },
    });
  });
});
