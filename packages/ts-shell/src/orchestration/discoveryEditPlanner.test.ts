import { describe, expect, it } from "vitest";
import { planDiscoveryEdit } from "./discoveryEditPlanner.js";

const prompt = [
  "Find the file that contains this exact block and replace it after I confirm the target",
  "```",
  "status: draft",
  "```",
  "with",
  "```",
  "status: ready",
  "```",
].join("\n");

describe("discoveryEditPlanner", () => {
  it("produces a no-write candidate manifest requiring confirmation", () => {
    const plan = planDiscoveryEdit({
      prompt,
      candidates: [
        { path: "src/app.ts", content: "title\nstatus: draft\n" },
        { path: "src/other.ts", content: "status: draft\n" },
      ],
    });

    expect(plan.status).toBe("confirmation-required");
    expect(plan).toMatchObject({
      mutationAuthority: "not-granted",
      mutation: "not-run",
      changedFiles: [],
      blocker: "ambiguous-candidates",
    });
    expect(plan.manifest.candidates.map((candidate) => candidate.path)).toEqual([
      "src/app.ts",
      "src/other.ts",
    ]);
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "discovery-edit-manifest:mutation-authority:not-granted",
        "discovery-edit-confirmation:target-selection-required",
      ]),
    );
    expect(JSON.stringify(plan)).not.toContain("status: ready");
  });

  it("stops no candidates, too many candidates, and missing mapping before mutation", () => {
    const noCandidates = planDiscoveryEdit({
      prompt,
      candidates: [{ path: "src/app.ts", content: "status: current\n" }],
    });
    expect(noCandidates).toMatchObject({
      status: "stopped",
      blocker: "no-candidates",
      mutation: "not-run",
    });

    const tooMany = planDiscoveryEdit({
      prompt,
      maxCandidates: 1,
      candidates: [
        { path: "src/app.ts", content: "status: draft\n" },
        { path: "src/other.ts", content: "status: draft\n" },
      ],
    });
    expect(tooMany).toMatchObject({
      status: "stopped",
      blocker: "too-many-candidates",
      mutation: "not-run",
    });

    const missingMapping = planDiscoveryEdit({
      prompt: "Find the file to edit before replacing it.",
      candidates: [{ path: "src/app.ts", content: "status: draft\n" }],
    });
    expect(missingMapping).toMatchObject({
      status: "stopped",
      blocker: "missing-mapping",
      mutation: "not-run",
    });
  });

  it("stops unsupported fuzzy, generated, and broad requests", () => {
    const fuzzy = planDiscoveryEdit({
      prompt: "Find the closest file and do a fuzzy replacement.",
      candidates: [{ path: "src/app.ts", content: "status: draft\n" }],
    });
    expect(fuzzy).toMatchObject({ blocker: "unsupported-fuzzy-discovery" });

    const generated = planDiscoveryEdit({
      prompt: "Find the file and generate replacement content for the block.",
      candidates: [{ path: "src/app.ts", content: "status: draft\n" }],
    });
    expect(generated).toMatchObject({
      blocker: "unsupported-generated-discovery",
    });

    const broad = planDiscoveryEdit({
      prompt: "Find every file in the workspace and replace all matching blocks.",
      candidates: [{ path: "src/app.ts", content: "status: draft\n" }],
    });
    expect(broad).toMatchObject({ blocker: "unsupported-broad-refactor" });

  });

  it("prepares handoff only for exactly one confirmed target", () => {
    const plan = planDiscoveryEdit({
      prompt,
      candidates: [
        { path: "src/app.ts", content: "title\nstatus: draft\n" },
        { path: "src/other.ts", content: "status: current\n" },
      ],
      confirmationTargetPath: "src/app.ts",
    });

    expect(plan).toMatchObject({
      status: "ready-for-handoff",
      mutationAuthority: "not-granted",
      mutation: "not-run",
    });
    expect(plan.confirmation).toMatchObject({
      state: "confirmed-single-target",
      targetPath: "src/app.ts",
    });
  });

  it("prepares target-set handoff for an explicitly confirmed target set", () => {
    const plan = planDiscoveryEdit({
      prompt,
      candidates: [
        { path: "src/app.ts", content: "title\nstatus: draft\n" },
        { path: "src/other.ts", content: "status: draft\n" },
      ],
      confirmedTargetSet: ["src/app.ts", "src/other.ts"],
    });

    expect(plan).toMatchObject({
      status: "ready-for-target-set",
      mutationAuthority: "not-granted",
      mutation: "not-run",
      confirmedTargetSet: ["src/app.ts", "src/other.ts"],
    });
    expect(plan.evidence).toContain(
      "discovery-edit-planner:ready-for-target-set-edit-route",
    );
  });
});
