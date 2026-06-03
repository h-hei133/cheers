import { describe, expect, it } from "vitest";

import { selectContext } from "../../context/selection/model.js";
import { buildExecutionPlan } from "../../planning/execution/model.js";
import { buildTaskRequestPacket } from "../../provider/request/packet.js";
import { chooseToolStrategy } from "./strategy.js";

describe("tool strategy", () => {
  it("chooses repair and verification actions from a ready plan", () => {
    const context = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix check.",
      workspaceFiles: [{ path: "src/check.ts", purpose: "target" }],
      requiredPaths: ["src/check.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "debug-repair",
      outputKind: "diff",
      allowedTools: ["read", "repair", "verify"],
      allowedWrites: ["src/check.ts"],
      successRubric: [],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Fix check.", taskKind: "debug-repair", context, plan });

    const strategy = chooseToolStrategy({ allowedTools: ["read", "repair", "verify"], plan, request });

    expect(strategy).toMatchObject({
      state: "ready",
      actions: expect.arrayContaining(["repair"]),
      terminalSuccessClaim: false,
    });
  });
});
