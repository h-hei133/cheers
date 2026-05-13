import { describe, expect, it } from "vitest";
import {
  buildPersistentShellPrompt,
  formatCliContextTag,
  projectInteractiveLoopState,
} from "./cliInteractiveLoopState.js";

describe("CLI interactive loop state projection", () => {
  it("projects prompt chrome without owning readline lifecycle", () => {
    expect(
      projectInteractiveLoopState({
        projectRoot: "/tmp/project-alpha",
        sessionId: "sess_1234567890abcdef",
        agentMode: "build",
      }),
    ).toEqual({
      projectLabel: "project-alpha",
      sessionShortLabel: "12345678",
      agentMode: "build",
      prompt: "[project-alpha|12345678|build] > ",
      contextTag: "[project-alpha|12345678]",
    });
  });

  it("keeps persistent prompt and non-tty context tag projections aligned", () => {
    expect(
      buildPersistentShellPrompt({
        projectRoot: "/tmp/project-alpha",
        sessionId: "session-without-prefix",
        agentMode: "plan",
      }),
    ).toBe("[project-alpha|session-|plan] > ");
    expect(
      formatCliContextTag({
        projectRoot: "/work/project-beta",
        sessionId: "sess_abcdef012345",
      }),
    ).toBe("[project-beta|abcdef01]");
  });
});
