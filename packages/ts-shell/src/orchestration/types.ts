import type { QueryEvent } from '../core/query/events.js'

export type AgentRole = 'planner' | 'coder' | 'reviewer'
export type ContinuationReason = 'handoff' | 'retryable-error'
export type TerminalReason =
  | 'completed'
  | 'stopped_cycle'
  | 'stopped_max_turns'
  | 'stopped_invalid_handoff'
  | 'stopped_error'
export type TerminalClassification = 'success' | 'stopped' | 'error'

export interface HandoffRecord {
  readonly from: AgentRole
  readonly to: AgentRole
  readonly reason: string
  readonly turn: number
}

export interface SharedContext {
  readonly sessionId: string
  readonly initialPrompt: string
  notes: string[]
  handoffs: HandoffRecord[]
}

export interface AgentExecutionInput {
  readonly role: AgentRole
  readonly rolePrompt: string
  readonly turn: number
  readonly maxTurns: number
  readonly sharedContext: Readonly<SharedContext>
  readonly transcript: readonly AgentExecutionOutput[]
}

export type CodingTaskKind =
  | 'chat'
  | 'inspect-files'
  | 'repo-explain'
  | 'read-file'
  | 'write-file'
  | 'edit-file'
  | 'run-command'

export type CodingVerificationStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'not-requested'
export type CodingVerificationSelectionScope = 'explicit' | 'focused' | 'broader' | 'none'
export type CodingVerificationSelectionSource =
  | 'explicit-user'
  | 'auto-from-changes'
  | 'not-requested'
export type CodingVerificationBlockerKind =
  | 'approval-denied'
  | 'missing-command'
  | 'environment-not-ready'
  | 'no-verify-strategy'
  | 'unknown'

export type CodingPatchFailureCode =
  | 'edit-target-missing'
  | 'edit-transform-unclear'
  | 'patch-target-missing'
  | 'patch-from-not-found'
  | 'patch-ambiguous'
  | 'read-failed'
  | 'target-not-found'
  | 'target-not-unique'
  | 'patch-generation-failed'
  | 'write-failed'
  | 'readback-failed'
  | 'readback-mismatch'

export type CodingPatchOperation = 'replace' | 'append'
export type CodingRepairStatus = 'not-needed' | 'recovered' | 'failed'
export type CodingContinuationStatus =
  | 'first-pass-success'
  | 'recovered-after-continuation'
  | 'failed-after-bounded-continuation'
export type CodingDiagnosisDisposition =
  | 'grounded-explanation'
  | 'needs-verification'
  | 'needs-edit'
  | 'insufficient-evidence'

export type CodingDiagnosisEvidenceRole =
  | 'config'
  | 'entrypoint'
  | 'implementation'
  | 'test'
  | 'docs'
  | 'unknown'

export interface CodingDiagnosisEvidenceNode {
  path: string
  role: CodingDiagnosisEvidenceRole
  score: number
}

export interface CodingDiagnosisEvidenceLink {
  from: string
  to: string
  relation: string
  confidence: number
  rationale: string
}

export interface CodingRepairSummary {
  status: CodingRepairStatus
  attempts: number
  recoveredItems: string[]
  failedItems: string[]
  notes: string[]
}

export interface CodingContinuationSummary {
  status: CodingContinuationStatus
  attempts: number
  evidence: string[]
}

export interface CodingDiagnosisSummary {
  disposition: CodingDiagnosisDisposition
  reason: string
  searchPattern: string
  candidateFiles: string[]
  evidenceFiles: string[]
  evidenceNodes: CodingDiagnosisEvidenceNode[]
  evidenceLinks: CodingDiagnosisEvidenceLink[]
}

export interface CodingChangeSetSummary {
  gitAware: boolean
  preExistingDirtyFiles: string[]
  postRunDirtyFiles: string[]
  attemptedFiles: string[]
  changedFiles: string[]
  unchangedAttemptedFiles: string[]
}

export type CodingTaskSatisfactionVerdict =
  | 'satisfied'
  | 'completed-with-caveats'
  | 'insufficient-evidence'

export interface CodingTaskSatisfactionSummary {
  verdict: CodingTaskSatisfactionVerdict
  reasons: string[]
  requiredEvidence: string[]
  observedEvidence: string[]
}

export interface CodingPatchRecord {
  readonly path: string
  readonly operation: CodingPatchOperation
  readonly status: 'applied' | 'failed'
  readonly changedLines?: number
  readonly addedLines?: number
  readonly removedLines?: number
  readonly matchCount?: number
  readonly failureCode?: CodingPatchFailureCode
  readonly reason?: string
  readonly replaceFrom?: string
  readonly replaceTo?: string
  readonly continuationStrategy?: string
}

export interface CodingVerificationSummary {
  readonly status: CodingVerificationStatus
  readonly command?: string
  readonly reason?: string
  readonly selectionScope?: CodingVerificationSelectionScope
  readonly selectionSource?: CodingVerificationSelectionSource
  readonly blockerKind?: CodingVerificationBlockerKind
  readonly nextAction?: string
}

export interface CodingResultSummary {
  readonly taskKind: CodingTaskKind
  diagnosis?: CodingDiagnosisSummary
  changedFiles: string[]
  failedFiles: Array<{ path: string; reason: string }>
  patches?: CodingPatchRecord[]
  repair: CodingRepairSummary
  continuation: CodingContinuationSummary
  changeSet: CodingChangeSetSummary
  taskSatisfaction: CodingTaskSatisfactionSummary
  verifiedFiles: string[]
  unverifiedFiles: Array<{ path: string; reason: string }>
  verification: CodingVerificationSummary
  evidence: string[]
  readonly failureBoundary?: string
}

export interface AgentExecutionOutput {
  readonly role: AgentRole
  readonly content: string
  readonly handoffTo?: AgentRole
  readonly handoffReason?: string
  readonly notes?: readonly string[]
  readonly events?: readonly QueryEvent[]
  readonly codingResult?: CodingResultSummary
}

export type OrchestrationStatus = TerminalReason

export interface OrchestrationResult {
  readonly status: OrchestrationStatus
  readonly terminalReason: TerminalReason
  readonly terminalClassification: TerminalClassification
  readonly lastContinuationReason?: ContinuationReason
  readonly stopReason?: string
  readonly transcript: readonly AgentExecutionOutput[]
  readonly sharedContext: Readonly<SharedContext>
  readonly finalOutput: string
  readonly codingResult?: CodingResultSummary
}

export interface OrchestratorOptions {
  readonly startingRole?: AgentRole
  readonly maxTurns?: number
}

export type AgentRunner = (
  input: AgentExecutionInput,
) => Promise<AgentExecutionOutput>
