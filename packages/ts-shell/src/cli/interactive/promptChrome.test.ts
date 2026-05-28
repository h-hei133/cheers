import { describe, expect, it } from "vitest";

import {
  buildInteractivePromptChrome,
  refreshInteractivePromptChrome,
} from "./promptChrome.js";

describe("interactive prompt chrome", () => {
  it("keeps prompt shape aligned with the existing persistent shell prompt", () => {
    expect(
      buildInteractivePromptChrome({
        projectRoot: "/tmp/project-alpha",
        sessionId: "sess_1234567890abcdef",
        agentMode: "build",
      }),
    ).toBe("[project-alpha|12345678|build] > ");
  });

  it("refreshes readline prompt without requiring cli.tsx ownership", () => {
    const prompts: string[] = [];
    refreshInteractivePromptChrome({
      readline: {
        setPrompt: (prompt: string) => prompts.push(prompt),
      } as never,
      projectRoot: "/work/project-beta",
      sessionId: "sess_abcdef012345",
      agentMode: "plan",
    });

    expect(prompts).toEqual(["[project-beta|abcdef01|plan] > "]);
  });
});
