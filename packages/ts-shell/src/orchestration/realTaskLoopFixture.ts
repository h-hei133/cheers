import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RealTaskLoopFixture {
  readonly fixtureId: string;
  readonly workspaceRoot: string;
  readonly targetPath: "src/smoke.ts";
  readonly userTask: string;
  readonly initialContent: string;
  readonly expectedPostApplyContent: string;
  readonly expectedNewTexts: readonly string[];
  readonly forbiddenOldTexts: readonly string[];
  readonly evidence: readonly string[];
}

export function createRealTaskLoopFixture(input: {
  readonly fixtureId?: string;
  readonly testRoot?: string;
} = {}): RealTaskLoopFixture {
  const fixtureId = input.fixtureId ?? "real-task-loop-fixture";
  const workspaceRoot = fs.mkdtempSync(
    path.join(input.testRoot ?? os.tmpdir(), "private-agents-real-task-loop-"),
  );
  const targetPath = "src/smoke.ts" as const;
  const initialContent = [
    "export function startApp() {",
    "  return \"started\";",
    "}",
    "",
    "export const bootMessage = startApp();",
    "",
  ].join("\n");
  const expectedPostApplyContent = [
    "export function runApp() {",
    "  return \"started\";",
    "}",
    "",
    "export const bootMessage = runApp();",
    "",
  ].join("\n");

  const absoluteTarget = path.join(workspaceRoot, targetPath);
  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
  fs.writeFileSync(absoluteTarget, initialContent, "utf8");

  return {
    fixtureId,
    workspaceRoot,
    targetPath,
    userTask: "Rename startApp to runApp in src/smoke.ts, including the local call site.",
    initialContent,
    expectedPostApplyContent,
    expectedNewTexts: ["export function runApp()", "bootMessage = runApp()"],
    forbiddenOldTexts: ["export function startApp()", "bootMessage = startApp()"],
    evidence: [
      `real-task-loop-fixture:id:${fixtureId}`,
      `real-task-loop-fixture:workspace:${safeWorkspaceLabel(workspaceRoot)}`,
      "real-task-loop-fixture:target:src/smoke.ts",
      "real-task-loop-fixture:temp-workspace-only",
      "real-task-loop-fixture:no-secrets",
      "real-task-loop-fixture:no-production-workspace",
    ],
  };
}

export function removeRealTaskLoopFixture(fixture: Pick<RealTaskLoopFixture, "workspaceRoot">): void {
  fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
}

export function readRealTaskLoopTarget(fixture: Pick<RealTaskLoopFixture, "workspaceRoot" | "targetPath">): string {
  return fs.readFileSync(path.join(fixture.workspaceRoot, fixture.targetPath), "utf8");
}

export function verifyRealTaskLoopReadback(input: {
  readonly fixture: RealTaskLoopFixture;
  readonly content?: string;
}): {
  readonly status: "passed" | "failed";
  readonly expectedNewFound: readonly string[];
  readonly forbiddenOldFound: readonly string[];
  readonly evidence: readonly string[];
  readonly summary: string;
} {
  const content = input.content ?? readRealTaskLoopTarget(input.fixture);
  const expectedNewFound = input.fixture.expectedNewTexts.filter((text) => content.includes(text));
  const forbiddenOldFound = input.fixture.forbiddenOldTexts.filter((text) => content.includes(text));
  const status =
    expectedNewFound.length === input.fixture.expectedNewTexts.length && forbiddenOldFound.length === 0
      ? "passed"
      : "failed";
  return {
    status,
    expectedNewFound,
    forbiddenOldFound,
    summary: [
      `readback=${status}`,
      `target=${input.fixture.targetPath}`,
      `expectedFound=${expectedNewFound.length}/${input.fixture.expectedNewTexts.length}`,
      `forbiddenFound=${forbiddenOldFound.length}`,
      "raw-content-excluded",
    ].join("; "),
    evidence: [
      `real-task-loop-readback:status:${status}`,
      `real-task-loop-readback:target:${input.fixture.targetPath}`,
      `real-task-loop-readback:expected-found:${expectedNewFound.length}`,
      `real-task-loop-readback:forbidden-found:${forbiddenOldFound.length}`,
      "real-task-loop-readback:raw-content-excluded",
    ],
  };
}

function safeWorkspaceLabel(workspaceRoot: string): string {
  return path.basename(workspaceRoot);
}
