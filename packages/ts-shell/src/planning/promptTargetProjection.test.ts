import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  derivePromptPathTarget,
  hasExplicitExecutionIntent,
  hasPathLikeReference,
  stripPathTokensForIntent,
} from "./promptTargetProjection.js";

describe("promptTargetProjection", () => {
  it("keeps multi-suffix path targets intact", () => {
    const workspaceRoot = path.resolve("/tmp/prompt-target-workspace");

    expect(
      derivePromptPathTarget(
        "read './src/widget.test.tsx' first 3 lines",
        workspaceRoot,
      ),
    ).toEqual({
      raw: "./src/widget.test.tsx",
      cleaned: "./src/widget.test.tsx",
      absolutePath: path.join(workspaceRoot, "src/widget.test.tsx"),
      inWorkspace: true,
    });
  });

  it("removes path tokens without erasing semantic intent", () => {
    expect(stripPathTokensForIntent("Read src/widget.test.tsx and explain it"))
      .toBe("Read and explain it");
    expect(hasPathLikeReference("Read src/widget.test.tsx")).toBe(true);
    expect(hasPathLikeReference("Read the previous answer")).toBe(false);
  });

  it("detects explicit shell execution wording without implying write authority", () => {
    expect(hasExplicitExecutionIntent("Run node --version", "run node --version"))
      .toBe(true);
    expect(hasExplicitExecutionIntent("读取 package.json", "package.json")).toBe(false);
  });
});
