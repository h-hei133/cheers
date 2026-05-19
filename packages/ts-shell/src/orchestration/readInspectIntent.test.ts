import { describe, expect, it } from "vitest";

import {
  classifyReadInspectIntent,
  isPathOnlyReadIntentPrompt,
} from "./readInspectIntent.js";

describe("readInspectIntent", () => {
  it("classifies list-files prompts as no-write repository inspection", () => {
    const result = classifyReadInspectIntent(
      "List TypeScript files for this workspace",
    );

    expect(result.hasFileReadIntent).toBe(true);
    expect(result.hasRepositoryInspectIntent).toBe(true);
    expect(result.hasTargetedFileReadIntent).toBe(false);
  });

  it("keeps pathless read prompts distinct from repository listing", () => {
    const result = classifyReadInspectIntent("Read file and return first 5 lines");

    expect(result.hasFileReadIntent).toBe(true);
    expect(result.hasTargetedFileReadIntent).toBe(true);
    expect(result.hasRepositoryInspectIntent).toBe(false);
  });

  it("classifies read continuation wording as targeted read intent", () => {
    const result = classifyReadInspectIntent("continue reading next 2 lines");

    expect(result.hasFileReadIntent).toBe(true);
    expect(result.hasTargetedFileReadIntent).toBe(true);
    expect(result.hasRepositoryInspectIntent).toBe(false);
  });

  it("recognizes path-only prompts with an optional line count as read intent", () => {
    expect(isPathOnlyReadIntentPrompt("/tmp/workspace/test.log 5")).toBe(true);
    expect(isPathOnlyReadIntentPrompt("src/index.ts")).toBe(true);
    expect(isPathOnlyReadIntentPrompt("explain src/index.ts")).toBe(false);
  });
});
