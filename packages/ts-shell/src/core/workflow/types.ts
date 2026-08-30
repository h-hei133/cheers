/**
 * Core Workflow Types and Schemas
 * Standard DAG, Task State Machine, and Pipeline contracts.
 */

export type TaskStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "evaluating"
  | "completed"
  | "failed"
  | "skipped";

export type WorkflowStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface WorkflowTask {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly dependencies: readonly string[];
  readonly assignedAgent?: string;
  readonly status: TaskStatus;
  readonly inputSchema?: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: string;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface WorkflowStage {
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly WorkflowTask[];
  readonly barrier: boolean;
  readonly status: TaskStatus;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly stages?: readonly WorkflowStage[];
  readonly tasks?: readonly WorkflowTask[];
  readonly maxConcurrency?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface WorkflowExecutionState {
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly currentStageIndex: number;
  readonly taskStates: ReadonlyMap<string, WorkflowTask>;
  readonly completedTaskIds: readonly string[];
  readonly failedTaskIds: readonly string[];
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly error?: string;
}

export interface DAGNode {
  readonly id: string;
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface DAGResolutionResult {
  readonly isValid: boolean;
  readonly executionBatches: readonly (readonly string[])[];
  readonly cycleDetected?: boolean;
  readonly cyclePath?: readonly string[];
  readonly errorMessage?: string;
}
