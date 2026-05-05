import { describe, expect, it } from "vitest";
import { resolveRepoAwarePromptResponse } from "./repoAwareRouting.js";

describe("repo-aware prompt routing", () => {
  const cwd = process.cwd();

  it("keeps repo status prompts on the repo-aware summary path", () => {
    const response = resolveRepoAwarePromptResponse(
      "show me the current repo status and changes",
      cwd,
    );

    expect(response).toContain("Repo-aware summary");
  });

  it("does not intercept the real coding flow fixture prompt", () => {
    const response = resolveRepoAwarePromptResponse(
      [
        "This is an isolated fixture coding task.",
        "Edit only note.txt.",
        'Change the line "status: draft" to exactly "status: ready".',
        "Do not modify README.md.",
        "Do not modify LOCKED.md.",
        'Verify note.txt contains "status: ready" and protected files are unchanged.',
      ].join("\n"),
      cwd,
    );

    expect(response).toBeUndefined();
  });

  it("routes explicit file mutation prompts to the normal coding flow", () => {
    expect(
      resolveRepoAwarePromptResponse(
        "Change note.txt status from draft to ready",
        cwd,
      ),
    ).toBeUndefined();
    expect(
      resolveRepoAwarePromptResponse(
        "In note.txt replace draft with ready",
        cwd,
      ),
    ).toBeUndefined();
  });

  it("does not treat status/change words as repo summary when a file target is explicit", () => {
    const response = resolveRepoAwarePromptResponse(
      "Update src/status.ts so the status line changes from draft to ready",
      cwd,
    );

    expect(response).toBeUndefined();
  });
});
