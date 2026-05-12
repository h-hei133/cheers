import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import { classifyMultiFileUpdatePlanningNoWrite } from "./multiFileUpdatePlanning.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("classifyMultiFileUpdatePlanningNoWrite", () => {
  it("classifies exactly two existing Update File operations as candidate no-write planning", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        capability: "multi-file-update-candidate-no-write",
        tier: "candidate",
        classificationMode: "synthetic-no-write",
        targetPaths: ["src/a.ts", "src/b.ts"],
        wouldChangeFiles: ["src/a.ts", "src/b.ts"],
        blockedReason: "multi-file-update-write-not-enabled",
        willWrite: false,
        writerReachable: false,
        changedFiles: [],
        writeIntents: [],
        failedFiles: [],
        drivesApplyPatchExpansion: false,
      }),
    );
    expect(result?.nextAction).toContain("candidate no-write evidence");
  });

  it("leaves a single Update File patch on the existing single-file path", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    expect(result).toBeUndefined();
  });

  it("classifies exactly three existing Update File operations as planning/no-write", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** Update File: src/c.ts",
        "@@",
        "-c",
        "+cc",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
        "src/c.ts": "c\n",
      },
    );

    expectNoWriteBlocked(result, "three-file-update-planning-no-write");
    expect(result).toEqual(
      expect.objectContaining({
        targetPaths: ["src/a.ts", "src/b.ts", "src/c.ts"],
        plannedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        wouldChangeFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        changedFiles: [],
        writeIntents: [],
        willWrite: false,
        writerReachable: false,
        failedFiles: [],
      }),
    );
    expect(result?.explanation).toContain("3-file writes are unsupported");
  });

  it("blocks four Update File operations without write metadata", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** Update File: src/c.ts",
        "@@",
        "-c",
        "+cc",
        "*** Update File: src/d.ts",
        "@@",
        "-d",
        "+dd",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
        "src/c.ts": "c\n",
        "src/d.ts": "d\n",
      },
    );

    expectNoWriteBlocked(result, "too-many-update-files");
    expect(result?.wouldChangeFiles).toEqual([]);
    expect(result?.failedFiles[0]?.code).toBe("patch-apply-plan-not-verified");
  });

  it("blocks Add File mixed with Update File as unsupported mixed operations", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
      },
    );

    expectNoWriteBlocked(result, "mixed-operations-not-enabled");
    expect(result?.failedFiles[0]?.code).toBe("patch-verify-operation-unsupported");
    expect(result?.failedFiles[0]?.path).toBe("src/new.ts");
  });

  it.each([
    {
      name: "Delete File",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Delete File: src/b.ts",
        "*** End Patch",
      ],
      files: {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
      unsupportedPath: "src/b.ts",
    },
    {
      name: "Move File",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "*** Move to: src/c.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      files: {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
      unsupportedPath: "src/b.ts",
    },
  ])("blocks $name mixed with Update File", ({ lines, files, unsupportedPath }) => {
    const result = classify(lines, files);

    expectNoWriteBlocked(result, "mixed-operations-not-enabled");
    expect(result?.failedFiles[0]?.code).toBe("patch-verify-operation-unsupported");
    expect(result?.failedFiles[0]?.path).toBe(unsupportedPath);
  });

  it("blocks missing update targets without write metadata", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/missing.ts",
        "@@",
        "-missing",
        "+present",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
      },
    );

    expectNoWriteBlocked(result, "missing-target");
    expect(result?.failedFiles[0]?.code).toBe("patch-verify-file-missing");
    expect(result?.failedFiles[0]?.path).toBe("src/missing.ts");
  });

  it("blocks paths outside the selected workspace without write metadata", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: ../outside.ts",
        "@@",
        "-outside",
        "+inside",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
      },
    );

    expectNoWriteBlocked(result, "workspace-boundary");
    expect(result?.failedFiles[0]?.code).toBe("patch-verify-path-outside-workspace");
    expect(result?.failedFiles[0]?.path).toBe("../outside.ts");
  });

  it("blocks hunk mismatch without write metadata", () => {
    const result = classify(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-not-current",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    expectNoWriteBlocked(result, "verification-failed");
    expect(result?.failedFiles[0]?.code).toBe("patch-verify-hunk-context-missing");
    expect(result?.failedFiles[0]?.path).toBe("src/b.ts");
  });
});

function classify(
  lines: readonly string[],
  files: Readonly<Record<string, string>>,
): ReturnType<typeof classifyMultiFileUpdatePlanningNoWrite> {
  const parsed = parseApplyPatchText(lines.join("\n"));
  if (parsed.ok === false) {
    throw new Error(parsed.failure.message);
  }
  return classifyMultiFileUpdatePlanningNoWrite(parsed.patch, {
    workspaceRoot,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
  });
}

function expectNoWriteBlocked(
  result: ReturnType<typeof classifyMultiFileUpdatePlanningNoWrite>,
  blockedReason: NonNullable<
    ReturnType<typeof classifyMultiFileUpdatePlanningNoWrite>
  >["blockedReason"],
): void {
  expect(result).toBeDefined();
  expect(result?.blockedReason).toBe(blockedReason);
  expect(result?.willWrite).toBe(false);
  expect(result?.writerReachable).toBe(false);
  expect(result?.changedFiles).toEqual([]);
  expect(result?.writeIntents).toEqual([]);
}
