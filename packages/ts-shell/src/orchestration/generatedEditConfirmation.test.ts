import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideGeneratedEditConfirmation,
  runGeneratedEditHandoff,
} from "./generatedEditConfirmation.js";
import { buildGeneratedEditProposalManifest } from "./generatedEditProposal.js";
import { planGeneratedEdit } from "./generatedEditPlanner.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";

describe("generatedEditConfirmation", () => {
  it("does not treat proposal review as mutation confirmation", () => {
    const manifest = buildGeneratedEditProposalManifest({
      targets: ["src/app.ts"],
      requestedOperationKind: "generated-replacement",
      proposedContentStatus: "safe-summary-only",
      exactMappingStatus: "not-exact",
    });

    const decision = decideGeneratedEditConfirmation({
      manifest,
      exactMappingReady: false,
      confirmProposalOnly: true,
    });

    expect(decision.state).toBe("confirmed-proposal-no-mutation");
    expect(decision.canHandoffToExactLane).toBe(false);
    expect(decision.evidence).toContain(
      "generated-edit-confirmation:mutation:not-run",
    );
  });

  it("hands off a confirmed exact single-target proposal through the fenced route", async () => {
    const fixture = createFixture({ "src/app.ts": "old line\n" });
    const prompt = exactPrompt();
    const plan = planGeneratedEdit({
      prompt,
      targetPath: "src/app.ts",
      confirmationTargetPath: "src/app.ts",
    });
    if (plan.status !== "ready-for-exact-handoff") {
      throw new Error("expected ready generated plan");
    }

    const result = await runGeneratedEditHandoff({
      plan,
      fencedOptions: routeOptions(fixture.workspaceRoot),
    });

    expect(result.status).toBe("single-target-handoff");
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(fixture.readRelative("src/app.ts")).toBe("new line\n");
    expect(result.evidence).toContain(
      "generated-edit-handoff:existing-fenced-route",
    );
    expect(result.evidence).toContain(
      "generated-edit-handoff:authority-stale-read-snapshot-verification-owned-by-existing-route",
    );
  });

  it("hands off a confirmed exact target-set proposal through the target-set route", async () => {
    const fixture = createFixture({
      "src/a.ts": "old line\n",
      "src/b.ts": "old line\n",
    });
    const plan = planGeneratedEdit({
      prompt: exactPrompt(),
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
    });
    if (plan.status !== "ready-for-exact-handoff") {
      throw new Error("expected ready generated target-set plan");
    }

    const result = await runGeneratedEditHandoff({
      plan,
      fencedOptions: routeOptions(fixture.workspaceRoot),
      targetSetOptions: routeOptions(fixture.workspaceRoot),
    });

    expect(result.status).toBe("target-set-handoff");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(fixture.readRelative("src/a.ts")).toBe("new line\n");
    expect(fixture.readRelative("src/b.ts")).toBe("new line\n");
    expect(result.evidence).toContain(
      "generated-edit-handoff:existing-target-set-route",
    );
    expect(result.evidence).toContain(
      "target-set-edit-route:reuse-existing-fenced-lane",
    );
  });
});

function exactPrompt(): string {
  return [
    "Generated proposal with explicit old/new mapping.",
    "```",
    "old line",
    "```",
    "```",
    "new line",
    "```",
  ].join("\n");
}

function createFixture(files: Record<string, string>): {
  readonly workspaceRoot: string;
  readonly readRelative: (relativePath: string) => string | undefined;
} {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-generated-edit-"),
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  return {
    workspaceRoot,
    readRelative: (relativePath) => {
      const absolutePath = path.join(workspaceRoot, relativePath);
      return fs.existsSync(absolutePath)
        ? fs.readFileSync(absolutePath, "utf8")
        : undefined;
    },
  };
}

function routeOptions(workspaceRoot: string) {
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    workspaceRoot,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile: authority.writeFile,
  };
}
