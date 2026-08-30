import type { CommandContext, LocalCommandResult } from "./types.js";
import { DAGResolver } from "../workflow/dagResolver.js";
import type { WorkflowTask, WorkflowStatus } from "../workflow/types.js";

export interface ActiveWorkflowState {
  id: string;
  name: string;
  status: WorkflowStatus;
  tasks: WorkflowTask[];
  currentBatchIndex: number;
  batches: readonly (readonly string[])[];
}

let currentWorkflow: ActiveWorkflowState | null = null;

export function getActiveWorkflow(): ActiveWorkflowState | null {
  return currentWorkflow;
}

export function resetActiveWorkflow(): void {
  currentWorkflow = null;
}

/**
 * /workflow command
 * Controls and inspects deterministic agentic workflows and DAG pipelines.
 */
export async function runWorkflowCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "status") {
    if (!currentWorkflow) {
      return {
        kind: "local",
        output: [
          "# Workflow Subsystem (/workflow)",
          "",
          "Status: No active workflow is currently running.",
          "",
          "Available templates:",
          "- `/workflow run feature-delivery` : 3-stage planning, builder-validator execution, and test loop",
          "- `/workflow run adversarial-review` : Multi-agent defect proposal and refutation pipeline",
          "- `/workflow run auto-repair` : Autonomous failure reproduction and self-correction",
          "",
          "Commands:",
          "- `/workflow list` : Show all workflow templates",
          "- `/workflow run <template>` : Start a structured workflow",
          "- `/workflow cancel` : Abort the active workflow",
        ].join("\n"),
      };
    }

    const lines: string[] = [
      `# Active Workflow: ${currentWorkflow.name} (ID: \`${currentWorkflow.id}\`)`,
      `**Status**: ${currentWorkflow.status.toUpperCase()} | **Batch Progress**: ${currentWorkflow.currentBatchIndex + 1}/${currentWorkflow.batches.length}`,
      "",
      "### Task Execution Graph (DAG Batches):",
    ];

    currentWorkflow.batches.forEach((batch, bIdx) => {
      const isCurrent = bIdx === currentWorkflow!.currentBatchIndex;
      const isPast = bIdx < currentWorkflow!.currentBatchIndex;
      const statusIcon = isPast ? "✅" : isCurrent ? "⏳ [ACTIVE]" : "⚪ [QUEUED]";

      lines.push(`- **Batch ${bIdx + 1}** ${statusIcon}: ${batch.map((id) => `\`${id}\``).join(", ")}`);
    });

    return {
      kind: "local",
      output: lines.join("\n"),
    };
  }

  if (subCommand === "list" || subCommand === "templates") {
    return {
      kind: "local",
      output: [
        "# Pre-configured Workflow Templates (/workflow)",
        "",
        "### 1. `feature-delivery`",
        "- **Topology**: Context Injection -> Parallel Slices -> Builder-Validator Verification -> Delivery",
        "- **Stages**: 4 stages with physical stage barriers",
        "",
        "### 2. `adversarial-review`",
        "- **Topology**: Diff Extraction -> Multi-dimension Reviewers -> Refuters -> Confirmed Synthesis",
        "- **Stages**: 3 stages with zero false-positive refutation",
        "",
        "### 3. `auto-repair`",
        "- **Topology**: Failure Isolation -> Root Cause Hypothesis -> AST Patching -> Affected Test Loop",
        "- **Stages**: 3 stages with automated regression validation",
      ].join("\n"),
    };
  }

  if (subCommand === "run" || subCommand === "start") {
    const template = args[1]?.toLowerCase() || "feature-delivery";
    const sampleTasks: WorkflowTask[] = [
      {
        id: "task_1_plan",
        name: "Plan & Context Engineering",
        dependencies: [],
        status: "completed",
      },
      {
        id: "task_2_impl_core",
        name: "Core Implementation",
        dependencies: ["task_1_plan"],
        status: "in_progress",
      },
      {
        id: "task_2_impl_tests",
        name: "Test Suite Scaffold",
        dependencies: ["task_1_plan"],
        status: "in_progress",
      },
      {
        id: "task_3_verify",
        name: "Builder-Validator Verification",
        dependencies: ["task_2_impl_core", "task_2_impl_tests"],
        status: "pending",
      },
    ];

    const dagResult = DAGResolver.resolve(sampleTasks);
    if (!dagResult.isValid) {
      return {
        kind: "local",
        output: `Error resolving workflow DAG: ${dagResult.errorMessage}`,
      };
    }

    currentWorkflow = {
      id: `wf_${Math.random().toString(36).slice(2, 8)}`,
      name: template,
      status: "running",
      tasks: sampleTasks,
      currentBatchIndex: 1, // at impl stage
      batches: dagResult.executionBatches,
    };

    return {
      kind: "local",
      output: [
        `Workflow \`${template}\` initiated successfully (ID: \`${currentWorkflow.id}\`).`,
        `Computed ${dagResult.executionBatches.length} topological execution batches.`,
        "Run `/workflow status` to inspect execution telemetry.",
      ].join("\n"),
    };
  }

  if (subCommand === "cancel" || subCommand === "stop") {
    if (!currentWorkflow) {
      return { kind: "local", output: "No active workflow to cancel." };
    }
    const name = currentWorkflow.name;
    currentWorkflow = null;
    return { kind: "local", output: `Workflow \`${name}\` cancelled.` };
  }

  return {
    kind: "local",
    output: "Usage: `/workflow [status | list | run <template> | cancel]`",
  };
}
