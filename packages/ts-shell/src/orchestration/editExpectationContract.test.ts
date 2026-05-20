import { describe, expect, it } from "vitest";
import { classifyEditExpectationContract } from "./editExpectationContract.js";

describe("editExpectationContract", () => {
  it("allows concrete writes with target and content", () => {
    const contract = classifyEditExpectationContract({
      prompt: "Create file notes.txt with content: hello",
      targetPath: "notes.txt",
      hasConcreteContent: true,
      hasCreateIntent: true,
    });

    expect(contract).toMatchObject({
      capabilityKind: "write-file",
      contractStatus: "ready",
      reasonCode: "concrete-write",
      mutationMayProceed: true,
      verificationMayBeConsidered: true,
    });
  });

  it("stops writes with missing content or missing target actionably", () => {
    expect(
      classifyEditExpectationContract({
        prompt: "Create a python script at scripts/hello.py",
        targetPath: "scripts/hello.py",
        hasCreateIntent: true,
      }),
    ).toMatchObject({
      capabilityKind: "write-file",
      contractStatus: "stopped",
      reasonCode: "write-content-missing",
      mutationMayProceed: false,
    });

    expect(
      classifyEditExpectationContract({
        prompt: "Write a python script in the current directory",
      }),
    ).toMatchObject({
      capabilityKind: "write-file",
      contractStatus: "stopped",
      reasonCode: "write-target-missing",
      mutationMayProceed: false,
    });
  });

  it("does not treat vague create-script prompts as generated content", () => {
    const contract = classifyEditExpectationContract({
      prompt: "Write src/new-widget.test.tsx",
      targetPath: "src/new-widget.test.tsx",
    });

    expect(contract.reasonCode).toBe("write-content-missing");
    expect(contract.doNext).toContain("fenced code");
  });

  it("keeps no-write inspect separate from mutation", () => {
    expect(
      classifyEditExpectationContract({
        prompt: "Where is panelLogic implemented in src/panel.test.tsx?",
        targetPath: "src/panel.test.tsx",
        hasReadInspectIntent: true,
      }),
    ).toMatchObject({
      capabilityKind: "no-write",
      contractStatus: "ready",
      reasonCode: "no-write-inspect",
      mutationMayProceed: false,
      workspaceTargetSummary: {
        targetLabel: "src/panel.test.tsx",
        authority: {
          mode: "read",
          decision: "available",
        },
      },
    });
  });

  it("stops broad refactor, batch edit, and discovery edit actionably", () => {
    expect(
      classifyEditExpectationContract({
        prompt: "Rename exported function greet to welcome in utils.js",
        targetPath: "utils.js",
      }).reasonCode,
    ).toBe("unsupported-refactor");

    expect(
      classifyEditExpectationContract({
        prompt: "Edit src/a.ts src/b.ts and replace v1 with v2",
        targetPath: "src/a.ts",
        targetCount: 2,
        hasEditIntent: true,
      }).reasonCode,
    ).toBe("unsupported-batch-edit");

    expect(
      classifyEditExpectationContract({
        prompt: "Edit this repository and replace v1 with v2",
      }).reasonCode,
    ).toBe("unsupported-discovery-edit");
  });

  it("keeps bounded edit eligible for verification", () => {
    const contract = classifyEditExpectationContract({
      prompt: "Edit src/app.ts and replace old with new",
      targetPath: "src/app.ts",
      hasEditIntent: true,
      hasReplaceDirective: true,
    });

    expect(contract).toMatchObject({
      capabilityKind: "edit-file",
      contractStatus: "ready",
      reasonCode: "bounded-edit",
      mutationMayProceed: true,
      verificationMayBeConsidered: true,
    });
  });

  it("uses stable stopped reason and do-next for unsupported mutation", () => {
    const contract = classifyEditExpectationContract({
      prompt: "Edit src/app.ts and make it better",
      targetPath: "src/app.ts",
      hasEditIntent: true,
    });

    expect(contract).toMatchObject({
      contractStatus: "stopped",
      reasonCode: "ambiguous-mutation",
      mutationMayProceed: false,
      verificationMayBeConsidered: false,
    });
    expect(contract.doNext).toContain("concrete replacement");
  });
});
