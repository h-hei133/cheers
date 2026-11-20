export interface PlanScope {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly workspace: { readonly path: string; readonly identity: string };
}

export interface PlanPorts {
  readonly isRecord: (value: unknown) => value is Record<string, unknown>;
  readonly freeze: <T>(value: T) => T;
}

export type PlanCriterion = {
  readonly id: string;
  readonly kind: 'command';
  readonly command: string;
  readonly commandDigest: string;
  readonly targets: readonly string[];
  readonly implementation: boolean;
} | {
  readonly id: string;
  readonly kind: 'artifact';
  readonly path: string;
  readonly expected: string;
  readonly implementation: boolean;
};

export interface PlanDraft extends PlanScope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly text: string;
  readonly criteria: readonly PlanCriterion[];
  readonly phase: 'draft' | 'approved' | 'rejected' | 'executing';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly goal?: { readonly id: string; readonly definitionDigest: string };
  readonly sourcePromptEntryId?: string;
  readonly approval?: { readonly version: string; readonly timestamp: string; readonly source: 'user' };
}

export class PlanError extends Error {
  readonly reason: 'invalid' | 'stale' | 'unavailable' | 'unapproved' | 'busy';
  constructor(reason: PlanError['reason']);
}

export function createPlan(ports: PlanPorts, scope: PlanScope, text: string, goal?: PlanDraft['goal'], sourcePromptEntryId?: string): PlanDraft;
export function editPlan(ports: PlanPorts, plan: PlanDraft, change: { readonly text?: string; readonly criterion?: PlanCriterion; readonly remove?: string }): PlanDraft;
export function reviewPlan(ports: PlanPorts, plan: PlanDraft, action: 'approve' | 'reject' | 'execute', version: string): PlanDraft;
export function decodePlan(ports: PlanPorts, value: unknown): PlanDraft | undefined;
export function validPlanCriterion(isRecord: PlanPorts['isRecord'], value: unknown): value is PlanCriterion;
export function planVersion(plan: PlanDraft): string;
export function textDigest(text: string): string;

export type ExecutionPlanState = 'ready' | 'partial' | 'blocked';
export interface ExecutionPlanInput {
  readonly taskKind: string;
  readonly outputKind: string;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly context: {
    readonly state: ExecutionPlanState;
    readonly selectedPaths: readonly string[];
    readonly verificationPaths: readonly string[];
    readonly blockers: readonly string[];
  };
  readonly observedGaps?: readonly string[];
}

export interface ActionContract {
  readonly action: string;
  readonly preconditions: readonly string[];
  readonly expectedObservations: readonly string[];
  readonly proofContribution: string;
  readonly fallbackAction: string;
  readonly budgetImpact: 'low' | 'medium' | 'high';
}

export interface ExecutionPlan {
  readonly state: ExecutionPlanState;
  readonly steps: readonly string[];
  readonly actionContracts: readonly ActionContract[];
  readonly requiredTools: readonly string[];
  readonly writeRequired: boolean;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export type RequestPacketState = 'ready' | 'blocked';
export interface TaskRequestPacketInput {
  readonly shortPrompt: string;
  readonly taskKind: string;
  readonly context: {
    readonly selectedPaths: readonly string[];
    readonly verificationPaths: readonly string[];
    readonly omittedPaths: readonly string[];
    readonly contextPacketSummary: string;
    readonly blockers: readonly string[];
  };
  readonly plan: { readonly blockers: readonly string[]; readonly steps: readonly string[] };
}

export interface TaskRequestPacket {
  readonly state: RequestPacketState;
  readonly goalSummary: string;
  readonly contextPaths: readonly string[];
  readonly contextPacketSummary: string;
  readonly verificationCandidates: readonly string[];
  readonly omittedContextCount: number;
  readonly planSteps: readonly string[];
  readonly outputContract: string;
  readonly blockers: readonly string[];
  readonly redactionRules: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlan;
export function buildTaskRequestPacket(input: TaskRequestPacketInput): TaskRequestPacket;
