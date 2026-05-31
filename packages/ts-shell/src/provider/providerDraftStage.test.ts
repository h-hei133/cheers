import { describe, expect, it } from "vitest";

import { runProviderDraftStage } from "./request/draft.js";

describe("providerDraftStage", () => {
  it("keeps synthetic provider drafts local and deterministic", async () => {
    await expect(runProviderDraftStage({
      role: "coder",
      draft: "Draft response",
      providerMode: "synthetic",
    })).resolves.toBe("Draft response");
  });
});
