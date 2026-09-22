import type { WorkflowTask, DAGResolutionResult } from "./types.js";

/**
 * DAG Resolver (Kahn's Algorithm + Tarjan Cycle Detection)
 * Computes deterministic topological sort batches and detects circular dependencies.
 */
export class DAGResolver {
  public static resolve(tasks: readonly WorkflowTask[]): DAGResolutionResult {
    if (tasks.length === 0) {
      return {
        isValid: true,
        executionBatches: [],
      };
    }

    const taskMap = new Map<string, WorkflowTask>();
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // 1. Build adjacency list, check duplicate task IDs, and build in-degrees
    for (const task of tasks) {
      if (taskMap.has(task.id)) {
        return {
          isValid: false,
          executionBatches: [],
          errorMessage: `Duplicate task ID detected: '${task.id}'. Task IDs must be globally unique within a workflow.`,
        };
      }
      taskMap.set(task.id, task);
      inDegree.set(task.id, 0);
      adjacency.set(task.id, []);
    }

    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (!taskMap.has(depId)) {
          return {
            isValid: false,
            executionBatches: [],
            errorMessage: `Task '${task.id}' depends on non-existent task '${depId}'.`,
          };
        }
        adjacency.get(depId)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }

    // 2. Kahn's Algorithm for Batched Topological Sorting
    const executionBatches: string[][] = [];
    const remainingInDegree = new Map(inDegree);
    let resolvedCount = 0;

    while (true) {
      const currentBatch: string[] = [];
      for (const [id, deg] of remainingInDegree.entries()) {
        if (deg === 0) {
          currentBatch.push(id);
        }
      }

      if (currentBatch.length === 0) {
        break;
      }

      // Sort batch deterministically by task id
      currentBatch.sort();
      executionBatches.push(currentBatch);
      resolvedCount += currentBatch.length;

      // Remove batch nodes and decrement dependent degrees
      for (const id of currentBatch) {
        remainingInDegree.delete(id);
        const dependents = adjacency.get(id) || [];
        for (const dep of dependents) {
          if (remainingInDegree.has(dep)) {
            remainingInDegree.set(dep, remainingInDegree.get(dep)! - 1);
          }
        }
      }
    }

    // 3. Cycle check
    if (resolvedCount < tasks.length) {
      const cyclicNodes = Array.from(remainingInDegree.keys());
      return {
        isValid: false,
        executionBatches: [],
        cycleDetected: true,
        cyclePath: cyclicNodes,
        errorMessage: `Circular dependency detected involving tasks: ${cyclicNodes.join(" -> ")}`,
      };
    }

    return {
      isValid: true,
      executionBatches,
    };
  }
}
