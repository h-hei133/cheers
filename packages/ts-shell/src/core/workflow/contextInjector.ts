import type { WorkflowTask } from "./types.js";
import { getMemoryStore } from "../memory/memoryStore.js";

export interface InjectedTaskContext {
  readonly taskId: string;
  readonly taskName: string;
  readonly backgroundFacts: readonly string[];
  readonly architecturalConstraints: readonly string[];
  readonly promptHeader: string;
}

/**
 * Workflow Context Injector
 * Bridges the Planner-Coder Gap by extracting relevant L2/L4 QuadMemory facts
 * and architectural constraints to assemble a rich, context-engineered task envelope.
 */
export class WorkflowContextInjector {
  public static inject(task: WorkflowTask, goalSummary?: string): InjectedTaskContext {
    const memoryStore = getMemoryStore();

    // 1. Query relevant memories for the task
    const query = `${task.name} ${task.description ?? ""} ${goalSummary ?? ""}`.trim();
    const recalledMemories = memoryStore.query({
      query,
      limit: 4,
    });

    const backgroundFacts: string[] = [];
    const architecturalConstraints: string[] = [];

    for (const match of recalledMemories) {
      if (match.fact.category === "constraint" || match.fact.category === "architecture") {
        architecturalConstraints.push(`[${match.fact.category.toUpperCase()}] ${match.fact.statement}`);
      } else {
        backgroundFacts.push(`[${match.fact.category.toUpperCase()}] ${match.fact.statement}`);
      }
    }

    // 2. Format structured prompt envelope
    const lines: string[] = [
      `# Task Context: ${task.name} (ID: ${task.id})`,
      task.description ? `Description: ${task.description}` : "",
      "",
    ];

    if (architecturalConstraints.length > 0) {
      lines.push("## Architectural Constraints & Rules:");
      architecturalConstraints.forEach((c) => lines.push(`- ${c}`));
      lines.push("");
    }

    if (backgroundFacts.length > 0) {
      lines.push("## Relevant Project Background:");
      backgroundFacts.forEach((f) => lines.push(`- ${f}`));
      lines.push("");
    }

    return {
      taskId: task.id,
      taskName: task.name,
      backgroundFacts,
      architecturalConstraints,
      promptHeader: lines.filter(Boolean).join("\n"),
    };
  }
}
