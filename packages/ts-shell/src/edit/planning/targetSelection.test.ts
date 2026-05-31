import { describe, expect, it } from "vitest";

import {
  planMutationTargetSelection,
  selectMutationTargetFromPrompt,
} from "./targetSelection.js";

describe("mutationTargetSelection", () => {
  const targets = [
    { cleaned: "README.md" },
    { cleaned: "src/utils.js" },
    { cleaned: "src/app.js" },
  ];

  it("selects the target nearest to local mutation wording", () => {
    expect(
      selectMutationTargetFromPrompt(
        "Read README.md. Then update src/utils.js and verify src/app.js is unchanged.",
        targets,
      ),
    ).toEqual({ cleaned: "src/utils.js" });
  });

  it("removes protected mutation paths from candidate targets", () => {
    const plan = planMutationTargetSelection(
      "Only modify src/utils.js. Do not change README.md.",
      targets,
    );

    expect(plan.candidateTargets).toEqual([
      { cleaned: "src/utils.js" },
      { cleaned: "src/app.js" },
    ]);
    expect(
      selectMutationTargetFromPrompt(
        "Only modify src/utils.js. Do not change README.md.",
        targets,
      ),
    ).toEqual({ cleaned: "src/utils.js" });
  });
});
