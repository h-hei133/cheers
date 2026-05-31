import type { QueryEvent } from "../core/query/runtime/events.js";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";
import {
  extractConsistencyItems,
  findMissingConsistencyItems,
  normalizeComparableText,
  planLowRiskVerification,
} from "../orchestration/lowRiskVerificationPlanning.js";
import type { CodingPatchRecord, CodingVerificationSummary } from "../orchestration/types.js";
import {
  dispatchRuntimeTool,
  type ToolLifecycleResult,
} from "../orchestration/toolRuntimeModule.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";

export interface LowRiskVerificationStageResult {
  readonly verification: CodingVerificationSummary;
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly notes: readonly string[];
  readonly repairNotes: readonly string[];
  readonly evidence: readonly string[];
}

export async function runLowRiskVerificationStage(input: {
  readonly prompt: string;
  readonly changedFiles: readonly string[];
  readonly unchangedAssertions: ReadonlyArray<{ path: string }>;
  readonly appliedContentByPath: ReadonlyMap<string, string>;
  readonly protectedSnapshots: ReadonlyMap<string, string>;
  readonly patches: readonly CodingPatchRecord[];
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}): Promise<LowRiskVerificationStageResult> {
  const lowRiskVerificationPlan = planLowRiskVerification({
    prompt: input.prompt,
    changedFiles: input.changedFiles,
    unchangedAssertions: input.unchangedAssertions,
    appliedContentByPath: input.appliedContentByPath,
    protectedSnapshots: input.protectedSnapshots,
    patches: input.patches,
  });
  const {
    fileContentAssertions,
    contentAssertion,
    consistencyAssertion,
    uniqueContentAssertions,
    fileAssertionReadPlan,
  } = lowRiskVerificationPlan;

  if (consistencyAssertion) {
    const verifyReadResults = await Promise.all(
      consistencyAssertion.paths.map(async (targetPath) => ({
        path: targetPath,
        result: await readForVerification(input, targetPath),
      })),
    );
    const unreadable = verifyReadResults.find((entry) => !entry.result.success);
    if (unreadable) {
      return blockedForChangedFiles({
        changedFiles: input.changedFiles,
        reason:
          unreadable.result.error ??
          `Could not read ${unreadable.path} for consistency verification.`,
        blockerKind: "environment-not-ready",
        nextAction:
          "Read all files participating in the consistency check, then rerun verification.",
        repairNote: "verify blocked: consistency readback unavailable",
        note: "verify blocked: consistency readback unavailable",
      });
    }

    const sourceRead = verifyReadResults.find(
      (entry) => entry.path === consistencyAssertion.sourcePath,
    );
    const sourceItems = extractConsistencyItems(sourceRead?.result.output ?? "");
    if (sourceItems.length === 0) {
      return blockedForChangedFiles({
        changedFiles: input.changedFiles,
        reason: `${consistencyAssertion.sourcePath} has no comparable non-empty items for consistency verification.`,
        blockerKind: "unknown",
        nextAction:
          "Add a concrete source item or specify the exact text that should be reflected.",
        repairNote: "verify blocked: no comparable source items",
        note: "verify blocked: consistency source empty",
      });
    }

    const missing = findMissingConsistencyItems({
      sourceItems,
      targets: verifyReadResults.filter(
        (entry) => entry.path !== consistencyAssertion.sourcePath,
      ),
    });
    if (missing) {
      const verification: CodingVerificationSummary = {
        status: "failed",
        reason: `${missing.targetPath} is missing source item from ${consistencyAssertion.sourcePath}: ${missing.item}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
        nextAction:
          "Update the derived file to reflect the missing source item, then rerun verification.",
      };
      return {
        verification,
        verifiedFiles: [],
        unverifiedFiles: unverifiedFor(input.changedFiles, verification.reason),
        repairNotes: ["verify failed: multi-file consistency mismatch"],
        notes: ["verify failed: multi-file consistency"],
        evidence: [],
      };
    }

    return {
      verification: {
        status: "passed",
        reason: `multi-file consistency verification passed: ${consistencyAssertion.paths.join(" <-> ")}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
      },
      verifiedFiles: consistencyAssertion.paths,
      unverifiedFiles: [],
      repairNotes: [],
      notes: [
        `verify passed: multi-file consistency ${consistencyAssertion.paths.join(",")}`,
      ],
      evidence: [
        `verify-consistency:${consistencyAssertion.sourcePath}->${consistencyAssertion.paths
          .filter((entry) => entry !== consistencyAssertion.sourcePath)
          .join(",")}`,
      ],
    };
  }

  if (fileContentAssertions.length > 0 || input.unchangedAssertions.length > 0) {
    const verifyReadResults = await Promise.all(
      fileAssertionReadPlan.map(async (entry) => {
        if (entry.source !== "read-tool") {
          return {
            path: entry.path,
            result: { success: true, output: entry.output, error: undefined },
          };
        }
        return {
          path: entry.path,
          result: await readForVerification(input, entry.path),
        };
      }),
    );
    const unreadable = verifyReadResults.find((entry) => !entry.result.success);
    let missingExpected: { path: string; expectedText: string } | undefined;
    for (const assertionGroup of uniqueContentAssertions) {
      const readEntry = verifyReadResults.find(
        (entry) => entry.path === assertionGroup.path,
      );
      if (!readEntry?.result.success) {
        continue;
      }
      const comparableOutput = normalizeComparableText(readEntry.result.output ?? "");
      const missing = assertionGroup.expected.find(
        (assertion) =>
          !comparableOutput.includes(
            normalizeComparableText(assertion.expectedText),
          ),
      );
      if (missing) {
        missingExpected = {
          path: assertionGroup.path,
          expectedText: missing.expectedText,
        };
        break;
      }
    }
    const changedProtected = verifyReadResults.find((entry) => {
      const snapshot = input.protectedSnapshots.get(entry.path);
      return (
        entry.result.success &&
        snapshot !== undefined &&
        (entry.result.output ?? "") !== snapshot
      );
    });
    const missingSnapshot = input.unchangedAssertions.find(
      (assertion) => !input.protectedSnapshots.has(assertion.path),
    );

    if (unreadable) {
      return blockedForChangedFiles({
        changedFiles: input.changedFiles,
        reason:
          unreadable.result.error ??
          `Could not read ${unreadable.path} for content verification.`,
        blockerKind: "environment-not-ready",
        nextAction:
          "Read the changed files successfully, then rerun the content verification.",
        repairNote: "verify blocked: file content readback unavailable",
        note: "verify blocked: file content readback unavailable",
      });
    }
    if (missingSnapshot) {
      const verification: CodingVerificationSummary = {
        status: "blocked",
        reason: `Could not capture original content for unchanged verification: ${missingSnapshot.path}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
        blockerKind: "environment-not-ready",
        nextAction:
          "Read the protected file before editing, then rerun unchanged verification.",
      };
      return {
        verification,
        verifiedFiles: [],
        unverifiedFiles: [
          { path: missingSnapshot.path, reason: verification.reason ?? "" },
        ],
        repairNotes: ["verify blocked: protected file snapshot missing"],
        notes: ["verify blocked: protected file snapshot missing"],
        evidence: [],
      };
    }
    if (missingExpected) {
      const verification: CodingVerificationSummary = {
        status: "failed",
        reason: `${missingExpected.path} does not contain expected text: ${missingExpected.expectedText}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
        nextAction:
          "Update the referenced file to include the expected text, then rerun verification.",
      };
      return {
        verification,
        verifiedFiles: [],
        unverifiedFiles: [
          { path: missingExpected.path, reason: verification.reason ?? "" },
        ],
        repairNotes: ["verify failed: expected file content not found"],
        notes: ["verify failed: file content assertion"],
        evidence: [],
      };
    }
    if (changedProtected) {
      const verification: CodingVerificationSummary = {
        status: "failed",
        reason: `${changedProtected.path} changed but was expected to remain unchanged.`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
        nextAction:
          "Restore the protected file, then rerun unchanged-file verification.",
      };
      return {
        verification,
        verifiedFiles: [],
        unverifiedFiles: [
          { path: changedProtected.path, reason: verification.reason ?? "" },
        ],
        repairNotes: ["verify failed: protected file changed"],
        notes: ["verify failed: unchanged file assertion"],
        evidence: [],
      };
    }

    return {
      verification: {
        status: "passed",
        reason: `content verification passed: ${[
          ...fileContentAssertions.map(
            (assertion) => `${assertion.path} contains ${assertion.expectedText}`,
          ),
          ...input.unchangedAssertions.map(
            (assertion) => `${assertion.path} unchanged`,
          ),
        ].join("; ")}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
      },
      verifiedFiles: uniqueStable([
        ...fileContentAssertions.map((assertion) => assertion.path),
        ...input.unchangedAssertions.map((assertion) => assertion.path),
      ]),
      unverifiedFiles: [],
      repairNotes: [],
      notes: ["verify passed: file-specific content/unchanged assertions"],
      evidence: [
        `verify-file-content:${fileContentAssertions
          .map((assertion) => `${assertion.path}:${assertion.expectedText}`)
          .join("|")}`,
        ...(input.unchangedAssertions.length > 0
          ? [
              `verify-unchanged:${input.unchangedAssertions
                .map((assertion) => assertion.path)
                .join("|")}`,
            ]
          : []),
      ],
    };
  }

  if (contentAssertion) {
    const verifyReadResults = await Promise.all(
      input.changedFiles.map(async (changedPath) => ({
        path: changedPath,
        result: await readForVerification(input, changedPath),
      })),
    );
    const unreadable = verifyReadResults.find((entry) => !entry.result.success);
    const missingExpected = verifyReadResults.find(
      (entry) =>
        entry.result.success &&
        !(entry.result.output ?? "").includes(contentAssertion.expectedText),
    );

    if (unreadable) {
      return blockedForChangedFiles({
        changedFiles: input.changedFiles,
        reason:
          unreadable.result.error ??
          `Could not read ${unreadable.path} for content verification.`,
        blockerKind: "environment-not-ready",
        nextAction:
          "Read the changed file successfully, then rerun the content verification.",
        repairNote: "verify blocked: content readback unavailable",
        note: "verify blocked: content readback unavailable",
      });
    }
    if (missingExpected) {
      const verification: CodingVerificationSummary = {
        status: "failed",
        reason: `${missingExpected.path} does not contain expected text: ${contentAssertion.expectedText}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
        nextAction:
          "Update the changed file to include the expected text, then rerun verification.",
      };
      return {
        verification,
        verifiedFiles: [],
        unverifiedFiles: unverifiedFor(input.changedFiles, verification.reason),
        repairNotes: ["verify failed: expected content not found"],
        notes: ["verify failed: content assertion"],
        evidence: [],
      };
    }

    return {
      verification: {
        status: "passed",
        reason: `content verification passed: contains ${contentAssertion.expectedText}`,
        selectionScope: "focused",
        selectionSource: "explicit-user",
      },
      verifiedFiles: input.changedFiles,
      unverifiedFiles: [],
      repairNotes: [],
      notes: [`verify passed: content contains ${contentAssertion.expectedText}`],
      evidence: [
        `verify-content-contains:${input.changedFiles.join(",")}:${contentAssertion.expectedText}`,
      ],
    };
  }

  const verification: CodingVerificationSummary = {
    status: "blocked",
    reason:
      "Verify intent was detected, but no verify strategy could be resolved from the prompt.",
    selectionScope: "focused",
    selectionSource: "explicit-user",
    blockerKind: "no-verify-strategy",
    nextAction:
      "Specify verify intent explicitly with test/build/check keywords so a concrete verify command can be selected.",
  };
  return {
    verification,
    verifiedFiles: [],
    unverifiedFiles: unverifiedFor(input.changedFiles, verification.reason),
    repairNotes: [
      "verify blocked: no verify strategy resolved from prompt; provide explicit test/build/check intent",
    ],
    notes: ["verify blocked: no verify strategy"],
    evidence: [],
  };
}

async function readForVerification(
  input: {
    readonly dispatcher: ToolDispatcher;
    readonly events: QueryEvent[];
    readonly sessionId: string;
    readonly turn: number;
    readonly workspaceRoot: string;
    readonly abortSignal?: AbortSignal;
  },
  targetPath: string,
): Promise<ToolLifecycleResult> {
  return dispatchRuntimeTool({
    dispatcher: input.dispatcher,
    events: input.events,
    toolName: "read",
    taskId: `task_${input.sessionId}_${input.turn}_verify_read_${hashStableId(targetPath)}`,
    args: { path: targetPath },
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
    requireApprovalEvent: false,
  });
}

function blockedForChangedFiles(input: {
  readonly changedFiles: readonly string[];
  readonly reason: string;
  readonly blockerKind: "environment-not-ready" | "unknown";
  readonly nextAction: string;
  readonly repairNote: string;
  readonly note: string;
}): LowRiskVerificationStageResult {
  const verification: CodingVerificationSummary = {
    status: "blocked",
    reason: input.reason,
    selectionScope: "focused",
    selectionSource: "explicit-user",
    blockerKind: input.blockerKind,
    nextAction: input.nextAction,
  };
  return {
    verification,
    verifiedFiles: [],
    unverifiedFiles: unverifiedFor(input.changedFiles, verification.reason),
    repairNotes: [input.repairNote],
    notes: [input.note],
    evidence: [],
  };
}

function unverifiedFor(
  paths: readonly string[],
  reason: string | undefined,
): Array<{ path: string; reason: string }> {
  return paths.map((path) => ({ path, reason: reason ?? "" }));
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizePathLike(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function hashStableId(value: string): string {
  return computeFragmentFingerprint(value).slice(0, 12);
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
