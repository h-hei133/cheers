import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildCliPlanningMutationExecutionOptions } from "./cliPlanningMutationExecution.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildCliPlanningMutationExecutionOptions", () => {
  it("returns undefined when no explicit planning mutation controls are present", () => {
    expect(
      buildCliPlanningMutationExecutionOptions({
        options: {},
        workspaceRoot: "/workspace",
      }),
    ).toBeUndefined();
  });

  it("loads explicit proposal input and confirmation from CLI flags", () => {
    const workspaceRoot = createWorkspace();
    fs.writeFileSync(
      path.join(workspaceRoot, "proposal.json"),
      JSON.stringify({
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/app.ts",
            oldText: "old",
            newText: "new",
          },
        ],
      }),
      "utf8",
    );

    const result = buildCliPlanningMutationExecutionOptions({
      workspaceRoot,
      options: {
        planningMutationConfirm: true,
        planningMutationControlledWorkspace: true,
        planningMutationProposalPath: "proposal.json",
      },
    });

    expect(result?.confirmation).toEqual({ state: "trusted-confirmed" });
    expect(result?.rawProposal?.operationKind).toBe("exact-fenced-replacement");
    expect(result?.controlledWorkspace).toEqual({
      scope: "controlled-temp-workspace",
      source: "cli-flag",
    });
  });

  it("rejects proposal files outside the selected workspace", () => {
    const workspaceRoot = createWorkspace();
    const outside = path.join(os.tmpdir(), "route210-outside-proposal.json");
    fs.writeFileSync(outside, JSON.stringify({ operationKind: "exact-fenced-replacement" }), "utf8");
    tempRoots.push(outside);

    expect(() =>
      buildCliPlanningMutationExecutionOptions({
        workspaceRoot,
        options: {
          planningMutationProposalPath: path.relative(workspaceRoot, outside),
        },
      }),
    ).toThrow("--planning-mutation-proposal must point to a JSON file inside the selected workspace.");
  });
});

function createWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route210-cli-planning-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.ts"), "old\n", "utf8");
  return root;
}
