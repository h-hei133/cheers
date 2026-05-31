import type { QueryEvent } from "../core/query/runtime/events.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import type { CodingPatchRecord } from "../orchestration/types.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import {
  inferRepoDiagnosis,
  inferRepoEvidenceRole,
  parseRepoCandidateFiles,
  projectReadAmbiguousTargetStop,
  projectReadMissingTargetStop,
  selectRepoExplainTarget,
} from "../orchestration/readInspectModule.js";
import { projectWorkflowRuntimeOutcome } from "../orchestration/resultSurfaceModule.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import {
  buildExplainTaskDelivery,
} from "./repoExplainStage.js";
import { computeFragmentFingerprint } from "./readWindowContinuation.js";
import type { ContextRuntimeStageResult } from "./runtimeStageTypes.js";

export async function runRepoExplainRuntimeStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}): Promise<ContextRuntimeStageResult | undefined> {
  if (input.plan.taskKind !== "repo-explain") {
    return undefined;
  }

  const globStep = await dispatchRuntimeTool({
    dispatcher: input.dispatcher,
    events: input.events,
    toolName: "glob",
    taskId: `task_${input.sessionId}_${input.turn}_repo_explain_glob`,
    args: { pattern: ".ts" },
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
    requireApprovalEvent: false,
  });
  const candidateFiles = globStep.success
    ? parseRepoCandidateFiles(globStep.output ?? "")
    : [];
  if (globStep.success) {
    input.notes.push("tool: approved glob(.ts) for repo diagnosis");
    input.evidence.push("repo-explain: glob(.ts) executed");
  } else {
    input.notes.push(
      `repo-explain glob failed: ${globStep.error ?? "glob failed"}`,
    );
  }

  let targetPath = input.plan.targetPath;
  let targetContent: string | undefined;

  if (!targetPath && candidateFiles.length > 0) {
    const inspectedCandidates: Array<{ path: string; content: string }> = [];
    for (const candidatePath of candidateFiles.slice(0, 20)) {
      const readCandidate = await dispatchRuntimeTool({
        dispatcher: input.dispatcher,
        events: input.events,
        toolName: "read",
        taskId: `task_${input.sessionId}_${input.turn}_repo_explain_candidate_${hashStableId(candidatePath)}`,
        args: { path: candidatePath },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: false,
      });
      if (readCandidate.success) {
        inspectedCandidates.push({
          path: candidatePath,
          content: readCandidate.output ?? "",
        });
      }
    }
    const selected = selectRepoExplainTarget({
      prompt: input.prompt,
      candidates: inspectedCandidates,
    });
    targetPath = selected?.path;
    targetContent = selected?.content;
  }

  if (!targetPath) {
    const targetStop =
      candidateFiles.length > 1
        ? projectReadAmbiguousTargetStop({
            candidates: candidateFiles,
            reason:
              "Repo explain needs one high-confidence evidence target, but multiple candidates matched. Provide an explicit in-workspace file path.",
            doNext: "Provide an explicit in-workspace file path.",
          })
        : projectReadMissingTargetStop({
            reason:
              "Repo explain requires an explicit in-workspace file target for truthful delivery.",
            doNext: "Provide an explicit in-workspace file path.",
          });
    const reason = targetStop.reason;
    return {
      events: input.events,
      notes: [...input.notes, "repo-explain missing explicit target"],
      ...projectWorkflowRuntimeOutcome({
        taskKind: "repo-explain",
        changedFiles: input.changedFiles,
        failedFiles: [
          {
            path: "(missing-target)",
            reason,
          },
        ],
        patches: input.patches,
        verifiedFiles: input.verifiedFiles,
        unverifiedFiles: input.unverifiedFiles,
        verification: {
          status: "skipped",
          reason: "repo-explain target missing",
          selectionScope: "none",
          selectionSource: "not-requested",
        },
        repairNotes: ["Provide explicit file path for explanation task."],
        evidence: input.evidence,
        taskVerdict: "insufficient-evidence",
        taskReasons: ["Explanation target was not resolved."],
        userFacingOutput: `Task not completed: ${reason}`,
      }),
    };
  }

  if (targetContent === undefined) {
    const readStep = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events: input.events,
      toolName: "read",
      taskId: `task_${input.sessionId}_${input.turn}_repo_explain_read`,
      args: { path: targetPath },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    if (!readStep.success) {
      const reason = readStep.error ?? "read failed";
      return {
        events: input.events,
        notes: [...input.notes, `repo-explain read failed: ${reason}`],
        ...projectWorkflowRuntimeOutcome({
          taskKind: "repo-explain",
          changedFiles: input.changedFiles,
          failedFiles: [{ path: targetPath, reason }],
          patches: input.patches,
          verifiedFiles: input.verifiedFiles,
          unverifiedFiles: input.unverifiedFiles,
          verification: {
            status: "skipped",
            reason: "repo-explain read failed",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes: ["Could not read target file for explanation."],
          evidence: [`repo-explain read failed: ${reason}`],
          taskVerdict: "insufficient-evidence",
          taskReasons: ["Target file could not be read for explanation."],
          userFacingOutput: `Task not completed: failed to read ${targetPath}. Reason: ${reason}`,
        }),
      };
    }
    targetContent = readStep.output ?? "";
  }

  input.notes.push("tool: read diagnosis evidence");
  input.evidence.push(`repo-explain: read ${targetPath}`);
  const explainOutput = buildExplainTaskDelivery(targetPath, targetContent);
  const disposition = inferRepoDiagnosis({ prompt: input.prompt });
  const outcome = projectWorkflowRuntimeOutcome({
    taskKind: "repo-explain",
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
    patches: input.patches,
    verifiedFiles: input.verifiedFiles,
    unverifiedFiles: input.unverifiedFiles,
    verification: {
      status: "not-requested",
      reason: "repo-explain read-only task",
      selectionScope: "none",
      selectionSource: "not-requested",
    },
    repairNotes: input.repairNotes,
    evidence: input.evidence,
    taskVerdict:
      disposition === "needs-verification"
        ? "completed-with-caveats"
        : "satisfied",
    taskReasons: [
      disposition === "needs-verification"
        ? "Repo diagnosis is grounded in inspected files but still needs verification."
        : "Repo explanation delivered from inspected file content.",
    ],
    userFacingOutput: explainOutput,
  });
  outcome.codingResult.diagnosis = {
    disposition,
    reason:
      disposition === "needs-verification"
        ? "Symptom-oriented diagnosis requires verification after evidence collection."
        : "Explanation is grounded in inspected repository evidence.",
    searchPattern: ".ts",
    candidateFiles,
    evidenceFiles: [targetPath],
    evidenceNodes: [
      {
        path: targetPath,
        role: inferRepoEvidenceRole({ targetPath }),
        score: 1,
      },
    ],
    evidenceLinks: [],
  };
  return {
    events: input.events,
    notes: [
      ...input.notes,
      `repo-explain delivered: ${targetPath}`,
      `diagnosis: disposition=${disposition}`,
    ],
    ...outcome,
  };
}

function hashStableId(value: string): string {
  return computeFragmentFingerprint(value).slice(0, 12);
}
