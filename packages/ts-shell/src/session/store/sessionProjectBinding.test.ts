import { describe, expect, it } from "vitest";

import { applySessionWorkspaceBinding } from "./sessionProjectBinding.js";
import type { Session } from "../schema/sessionRecord.js";

describe("session project binding", () => {
  it("updates workspace metadata without inventing omitted fields", () => {
    const session: Session = {
      id: "sess_binding",
      projectRoot: "/repo/old",
      rootMode: "direct",
      requestedWorkspaceRoot: "/repo/old/app",
      targetPathBase: "/repo/old",
      gitRoot: "/repo/old",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      status: "active",
      turns: [],
    };

    expect(
      applySessionWorkspaceBinding({
        session,
        binding: {
          projectRoot: "  /repo/new  ",
          rootMode: "git-root",
          gitRoot: "",
        },
        updatedAt: "2026-05-28T00:00:01.000Z",
      }),
    ).toEqual({
      ...session,
      projectRoot: "/repo/new",
      rootMode: "git-root",
      requestedWorkspaceRoot: "/repo/old/app",
      targetPathBase: "/repo/old",
      gitRoot: null,
      updatedAt: "2026-05-28T00:00:01.000Z",
    });
  });
});
