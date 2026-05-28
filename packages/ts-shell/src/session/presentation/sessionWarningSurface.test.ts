import { describe, expect, it } from "vitest";

import {
  formatListSessionsFailureWarning,
  formatUnreadableSessionDirectoryWarning,
} from "./sessionWarningSurface.js";

describe("session warning surface", () => {
  it("formats unreadable directory warnings with existing sample and remainder text", () => {
    expect(
      formatUnreadableSessionDirectoryWarning({
        sessionDirs: ["a", "b", "c", "d"],
      }),
    ).toBe("Skipped 4 unreadable session directories: a, b, c (+1 more)");
  });

  it("formats list failure warnings without changing the CLI-facing prefix", () => {
    expect(
      formatListSessionsFailureWarning({
        sessionsDir: "/tmp/sessions",
        error: new Error("permission denied"),
      }),
    ).toBe("Failed to list sessions in /tmp/sessions: permission denied");
  });
});
