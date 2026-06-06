import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentExecutionOutput, AgentRole, AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { createDefaultExecutionService, type ExecutionService, type TextFileWriteExecutionRequest } from '../../../runtime/execution/service.js'
import { QueryEngine } from './engine.js'
import { buildContinuationPolicyEvidence, type QueryRuntimeStateSeed } from './state.js'
import type { QueryRuntimeTaskState } from './taskState.js'

describe('workspace task execution', () => {
  it('runs disposable workspace tasks through normal runtime and execution seam', async () => {
    const results = await Promise.all([
      runAccessRuleDiscoveryTask(),
      runNotificationDigestRepairTask(),
      runMetricsExportArtifactTask(),
      runCachePolicyContinuationTask(),
      runPreferenceWriteWithoutProofTask(),
    ])

    expect(results).toMatchObject([
      {
        taskId: 'access-rule-owner-discovery',
        verdict: 'completed',
        actions: ['search', 'read', 'edit', 'verify'],
        changedFiles: [
          'src/access/rules.ts',
          'src/access/rules.test.ts',
        ],
        commandOutputClassifications: ['success'],
      },
      {
        taskId: 'notification-digest-repair',
        verdict: 'completed',
        actions: ['search', 'read', 'edit', 'repair', 'verify'],
        changedFiles: [
          'src/notify/digest.ts',
          'src/notify/digest.test.ts',
        ],
        commandOutputClassifications: ['success'],
        repairAction: 'targeted repair then verification rerun',
      },
      {
        taskId: 'metrics-export-artifact',
        verdict: 'completed',
        actions: ['artifact'],
        changedFiles: ['reports/metrics-export.md'],
        commandOutputClassifications: ['success'],
        artifactOrContinuationState: 'artifact source receipt plus verification receipt',
      },
      {
        taskId: 'cache-policy-continuation',
        verdict: 'completed',
        actions: ['verify'],
        changedFiles: [
          'src/cache/policy.ts',
          'src/cache/policy.test.ts',
        ],
        commandOutputClassifications: ['success'],
        artifactOrContinuationState: 'replay continuation carried pending verification',
      },
      {
        taskId: 'preference-write-without-proof',
        verdict: 'stopped_not_proven',
        actions: ['search', 'read', 'edit'],
        changedFiles: [
          'src/preferences/defaults.ts',
          'src/preferences/defaults.test.ts',
        ],
        commandOutputClassifications: [],
        missingProof: expect.stringContaining('proof gap'),
      },
    ])

    const completed = results.filter(result => result.verdict === 'completed')
    const writeTasks = results.filter(result => result.changedFiles.length > 0)
    const multiFileTasks = results.filter(result => result.changedFiles.length > 1)
    const realCommandTasks = results.filter(result => result.commandOutputClassifications.length > 0)

    expect(completed).toHaveLength(4)
    expect(writeTasks.length).toBeGreaterThanOrEqual(3)
    expect(multiFileTasks.length).toBeGreaterThanOrEqual(2)
    expect(realCommandTasks.length).toBeGreaterThanOrEqual(2)
    expect(results.every(result => result.manualCorrection === false)).toBe(true)
  })
})

interface WorkspaceTaskRecord {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly changedFiles: readonly string[]
  readonly actions: readonly string[]
  readonly commandOutputClassifications: readonly string[]
  readonly repairAction: string
  readonly artifactOrContinuationState: string
  readonly proofInput: readonly string[]
  readonly verdict: string
  readonly missingProof: string
  readonly manualCorrection: false
}

async function runAccessRuleDiscoveryTask(): Promise<WorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/access/rules.ts': 'export const canArchive = false;\n',
    'src/access/rules.test.ts': 'import { canArchive } from "./rules";\nif (!canArchive) throw new Error("archive disabled");\n',
  })
  const actions: string[] = []

  try {
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'search') {
        return agentOutput(role, {
          content: 'access rule owner found',
          handoffReason: `read access owner turn ${turn}`,
          evidenceFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
          requiredEvidence: ['access rule owner context'],
          observedEvidence: [],
          lastAction: { actionKind: 'search', target: 'src/access/rules.ts' },
        })
      }
      if (runtimeAction.nextAction === 'read') {
        return agentOutput(role, {
          content: 'access rule files read',
          handoffReason: `edit access rule turn ${turn}`,
          evidenceFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
          requiredEvidence: ['access rule owner context'],
          observedEvidence: ['access rule owner context'],
          lastAction: { actionKind: 'read', target: 'src/access/rules.ts' },
        })
      }
      if (runtimeAction.nextAction === 'edit') {
        return agentOutput(role, {
          content: 'access rule edited',
          handoffReason: `verify access rule turn ${turn}`,
          changedFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
          evidenceFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
          verification: { status: 'not-requested', reason: 'access check pending' },
          requiredEvidence: ['post-write access verification'],
          observedEvidence: [],
          lastAction: {
            actionKind: 'edit',
            target: 'src/access/rules.ts',
            changedFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
          },
        })
      }
      return agentOutput(role, {
        content: 'access verification passed',
        changedFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
        evidenceFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
        verification: {
          status: 'passed',
          command: 'node --check src/access/rules.ts',
          reason: 'access check passed',
        },
        requiredEvidence: ['post-write access verification'],
        observedEvidence: ['post-write access verification'],
        lastAction: {
          actionKind: 'verify',
          target: 'src/access/rules.ts',
          verifiedFiles: ['src/access/rules.ts', 'src/access/rules.test.ts'],
          verification: { status: 'passed', reason: 'access check passed' },
        },
      })
    }
    const commandOutputClassifications: string[] = []
    const result = await engineFor(workspace, runAgent, commandOutputClassifications, {
      edit: {
        'src/access/rules.ts': 'export const canArchive = true;\n',
        'src/access/rules.test.ts': 'import { canArchive } from "./rules";\nif (!canArchive) throw new Error("archive disabled");\n',
      },
      verifyCommand: ['node', ['--check', 'src/access/rules.ts']],
    }).submitMessage('sess_access_rule_workspace', 'update access rule after discovering the owner', {
      maxTurns: 5,
    })

    return taskRecord('access-rule-owner-discovery', workspace.root, actions, commandOutputClassifications, result)
  } finally {
    await workspace.dispose()
  }
}

async function runNotificationDigestRepairTask(): Promise<WorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/notify/digest.ts': 'export const digest = () => "old";\n',
    'src/notify/digest.test.ts': 'import { digest } from "./digest";\nif (digest() !== "daily") throw new Error("bad digest");\n',
  })
  const actions: string[] = []

  try {
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
        return agentOutput(role, {
          content: 'notification digest context ready',
          handoffReason: `notification context turn ${turn}`,
          evidenceFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          requiredEvidence: ['notification digest context'],
          observedEvidence: ['notification digest context'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/notify/digest.ts' },
        })
      }
      if (runtimeAction.nextAction === 'edit') {
        return agentOutput(role, {
          content: 'notification edit failed verification',
          handoffReason: `notification repair turn ${turn}`,
          taskKind: 'edit-file',
          changedFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          failedFiles: [{ path: 'src/notify/digest.test.ts', reason: 'expected daily got weekly' }],
          evidenceFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          verification: { status: 'failed', reason: 'notification digest check failed' },
          requiredEvidence: ['notification verification after repair'],
          observedEvidence: [],
          lastAction: {
            actionKind: 'edit',
            target: 'src/notify/digest.ts',
            changedFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          },
        })
      }
      if (runtimeAction.nextAction === 'repair') {
        return agentOutput(role, {
          content: 'notification repair applied',
          handoffReason: `notification rerun turn ${turn}`,
          taskKind: 'edit-file',
          changedFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          evidenceFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/notify/digest.ts'] },
          verification: { status: 'not-requested', reason: 'post-repair notification check pending' },
          requiredEvidence: ['notification verification after repair'],
          observedEvidence: [],
          lastAction: {
            actionKind: 'repair',
            target: 'src/notify/digest.ts',
            changedFiles: ['src/notify/digest.ts'],
          },
        })
      }
      return agentOutput(role, {
        content: 'notification verification passed after repair',
        taskKind: 'edit-file',
        changedFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
        evidenceFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
        repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/notify/digest.ts'] },
        verification: {
          status: 'passed',
          command: 'node --check src/notify/digest.ts',
          reason: 'notification check passed after repair',
        },
        requiredEvidence: ['notification verification after repair'],
        observedEvidence: ['notification verification after repair'],
        lastAction: {
          actionKind: 'verify',
          target: 'src/notify/digest.ts',
          verifiedFiles: ['src/notify/digest.ts', 'src/notify/digest.test.ts'],
          verification: { status: 'passed', reason: 'notification check passed after repair' },
        },
      })
    }
    const commandOutputClassifications: string[] = []
    const result = await engineFor(workspace, runAgent, commandOutputClassifications, {
      edit: {
        'src/notify/digest.ts': 'export const digest = () => "weekly";\n',
        'src/notify/digest.test.ts': 'import { digest } from "./digest";\nif (digest() !== "daily") throw new Error("bad digest");\n',
      },
      repair: {
        'src/notify/digest.ts': 'export const digest = () => "daily";\n',
      },
      verifyCommand: ['node', ['--check', 'src/notify/digest.ts']],
    }).submitMessage('sess_notification_digest_workspace', 'update notification digest and handle focused verification', {
      maxTurns: 6,
    })

    return {
      ...taskRecord('notification-digest-repair', workspace.root, actions, commandOutputClassifications, result),
      repairAction: 'targeted repair then verification rerun',
    }
  } finally {
    await workspace.dispose()
  }
}

async function runMetricsExportArtifactTask(): Promise<WorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'data/metrics.json': '{"signup":3,"activation":2}\n',
    'reports/metrics-export.md': '',
  })
  const actions: string[] = []

  try {
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
        return agentOutput(role, {
          content: 'metrics source receipt captured',
          handoffReason: 'write metrics artifact',
          taskKind: 'write-file',
          evidenceFiles: ['data/metrics.json', 'reports/metrics-export.md'],
          requiredEvidence: ['source receipt for metrics data'],
          observedEvidence: ['data/metrics.json'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'data/metrics.json' },
        })
      }
      return agentOutput(role, {
        content: 'metrics export artifact produced',
        taskKind: 'write-file',
        changedFiles: ['reports/metrics-export.md'],
        evidenceFiles: ['data/metrics.json', 'reports/metrics-export.md'],
        verification: {
          status: 'passed',
          command: 'node --version',
          reason: 'metrics artifact source and verification receipts matched',
        },
        requiredEvidence: [
          'source receipt for metrics data',
          'verification receipt for metrics export',
        ],
        observedEvidence: [
          'data/metrics.json',
          'verification receipt for metrics export',
        ],
        lastAction: {
          actionKind: 'artifact',
          target: 'reports/metrics-export.md',
          changedFiles: ['reports/metrics-export.md'],
        },
      })
    }
    const commandOutputClassifications: string[] = []
    const result = await engineFor(workspace, runAgent, commandOutputClassifications, {
      artifact: {
        'reports/metrics-export.md': '# Metrics Export\n\nSource: data/metrics.json\nsignup=3\nactivation=2\n',
      },
      verifyCommand: ['node', ['--version']],
    }).submitMessage('sess_metrics_artifact_workspace', 'produce metrics export artifact from source data', {
      maxTurns: 4,
    })

    return {
      ...taskRecord('metrics-export-artifact', workspace.root, actions, commandOutputClassifications, result),
      artifactOrContinuationState: 'artifact source receipt plus verification receipt',
    }
  } finally {
    await workspace.dispose()
  }
}

async function runCachePolicyContinuationTask(): Promise<WorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/cache/policy.ts': 'export const ttl = 60;\n',
    'src/cache/policy.test.ts': 'import { ttl } from "./policy";\nif (ttl !== 60) throw new Error("bad ttl");\n',
  })
  const actions: string[] = []

  try {
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      return agentOutput(role, {
        content: 'cache policy continuation verification passed',
        taskKind: 'edit-file',
        continued: true,
        changedFiles: ['src/cache/policy.ts', 'src/cache/policy.test.ts'],
        evidenceFiles: ['src/cache/policy.ts', 'src/cache/policy.test.ts'],
        verification: {
          status: 'passed',
          command: 'node --check src/cache/policy.ts',
          reason: 'cache continuation check passed',
        },
        requiredEvidence: ['cache continuation verification'],
        observedEvidence: ['cache continuation verification'],
        lastAction: {
          actionKind: 'verify',
          target: 'src/cache/policy.ts',
          verifiedFiles: ['src/cache/policy.ts', 'src/cache/policy.test.ts'],
          verification: { status: 'passed', reason: 'cache continuation check passed' },
        },
      })
    }
    const commandOutputClassifications: string[] = []
    const result = await engineFor(workspace, runAgent, commandOutputClassifications, {
      verifyCommand: ['node', ['--check', 'src/cache/policy.ts']],
    }).submitMessage('sess_cache_policy_workspace', 'continue cache policy verification from replay state', {
      maxTurns: 2,
      runtimeSeed: runtimeSeedWithTaskState('sess_cache_policy_workspace', {
        source: 'replay',
        pendingAction: 'verify',
        proofGap: ['verification proof missing for cache policy files'],
        changedFiles: ['src/cache/policy.ts', 'src/cache/policy.test.ts'],
        verifiedFiles: [],
        unverifiedFiles: ['src/cache/policy.ts', 'src/cache/policy.test.ts'],
        failureCategories: [],
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'node --check src/cache/policy.ts',
          targetFiles: ['src/cache/policy.ts', 'src/cache/policy.test.ts'],
          failedFiles: [],
          status: 'not-requested',
          nextAction: 'rerun cache verification',
        },
        artifactPendingState: { claims: [], evidenceIds: [], missingClaims: [] },
        continuationSafety: { status: 'safe', reasons: ['replay state carried changed files'] },
      }),
    })

    return {
      ...taskRecord('cache-policy-continuation', workspace.root, actions, commandOutputClassifications, result),
      artifactOrContinuationState: 'replay continuation carried pending verification',
    }
  } finally {
    await workspace.dispose()
  }
}

async function runPreferenceWriteWithoutProofTask(): Promise<WorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/preferences/defaults.ts': 'export const theme = "light";\n',
    'src/preferences/defaults.test.ts': 'import { theme } from "./defaults";\n',
  })
  const actions: string[] = []

  try {
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
        return agentOutput(role, {
          content: 'preference defaults located',
          handoffReason: 'write preference defaults',
          evidenceFiles: ['src/preferences/defaults.ts', 'src/preferences/defaults.test.ts'],
          requiredEvidence: ['preference owner context'],
          observedEvidence: ['preference owner context'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/preferences/defaults.ts' },
        })
      }
      return agentOutput(role, {
        content: 'preference defaults changed without verification',
        changedFiles: ['src/preferences/defaults.ts', 'src/preferences/defaults.test.ts'],
        evidenceFiles: ['src/preferences/defaults.ts', 'src/preferences/defaults.test.ts'],
        verification: { status: 'not-requested', reason: 'preference verification missing' },
        requiredEvidence: ['preference post-write verification'],
        observedEvidence: [],
        lastAction: {
          actionKind: 'edit',
          target: 'src/preferences/defaults.ts',
          changedFiles: ['src/preferences/defaults.ts', 'src/preferences/defaults.test.ts'],
        },
      })
    }
    const commandOutputClassifications: string[] = []
    const result = await engineFor(workspace, runAgent, commandOutputClassifications, {
      edit: {
        'src/preferences/defaults.ts': 'export const theme = "dark";\n',
        'src/preferences/defaults.test.ts': 'import { theme } from "./defaults";\nif (theme !== "dark") throw new Error("bad theme");\n',
      },
    }).submitMessage('sess_preference_write_workspace', 'update preference defaults but require proof', {
      maxTurns: 3,
    })

    return taskRecord('preference-write-without-proof', workspace.root, actions, commandOutputClassifications, result)
  } finally {
    await workspace.dispose()
  }
}

function engineFor(
  workspace: DisposableWorkspace,
  runAgent: AgentRunner,
  commandOutputClassifications: string[],
  config: WorkspaceBatchConfig,
) {
  return new QueryEngine({
    runAgent,
    executeRuntimeBatch: workspace.batchExecutor(config, commandOutputClassifications),
  } as any)
}

function taskRecord(
  taskId: string,
  workspaceRoot: string,
  actions: readonly string[],
  commandOutputClassifications: readonly string[],
  result: Awaited<ReturnType<QueryEngine['submitMessage']>>,
): WorkspaceTaskRecord {
  return {
    taskId,
    workspaceRoot,
    changedFiles: result.codingResult?.changedFiles ?? [],
    actions,
    commandOutputClassifications,
    repairAction: 'n/a',
    artifactOrContinuationState: 'n/a',
    proofInput: result.codingResult?.taskSatisfaction.observedEvidence ?? [],
    verdict: result.status,
    missingProof: result.stopReason ?? 'n/a',
    manualCorrection: false,
  }
}

type DisposableWorkspace = Awaited<ReturnType<typeof createWorkspace>>

interface WorkspaceBatchConfig {
  readonly edit?: Record<string, string>
  readonly repair?: Record<string, string>
  readonly artifact?: Record<string, string>
  readonly verifyCommand?: readonly [string, readonly string[]]
}

function writeRequest(
  root: string,
  relativePath: string,
  content: string,
): TextFileWriteExecutionRequest {
  return {
    operationKind: 'file.write',
    absolutePath: join(root, relativePath),
    workspaceRoot: root,
    authority: {
      mode: 'approved-for-write',
      source: 'workspace-authority',
      reason: 'Disposable workspace setup or task write.',
    },
    caller: 'workspace-task-execution-test',
    reason: 'Disposable workspace setup or task write.',
    reportSafeTarget: relativePath,
    content,
  }
}

async function createWorkspace(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'workspace-task-execution-'))
  const executionService = createDefaultExecutionService()
  for (const [relativePath, content] of Object.entries(files)) {
    await executionService.writeTextFile({
      ...writeRequest(root, relativePath, content),
    })
  }
  return {
    root,
    batchExecutor: (
      config: WorkspaceBatchConfig,
      commandOutputClassifications: string[],
    ) => async ({ batch }: any) => {
      const item = batch.items[0]
      if (!item) {
        return { batchId: batch.batchId, results: [] }
      }
      if (item.actionKind === 'edit' && config.edit) {
        await writeAll(executionService, root, config.edit)
      }
      if (item.actionKind === 'repair' && config.repair) {
        await writeAll(executionService, root, config.repair)
      }
      if (item.actionKind === 'artifact' && config.artifact) {
        await writeAll(executionService, root, config.artifact)
      }
      const commandResult = (item.actionKind === 'verify' || item.actionKind === 'artifact') && config.verifyCommand
        ? await executionService.runCommand({
            command: config.verifyCommand[0],
            args: config.verifyCommand[1],
            cwd: root,
            reportSafeCommand: [config.verifyCommand[0], ...config.verifyCommand[1]].join(' '),
            workspaceRoot: root,
            authority: {
              mode: 'approved-for-write',
              source: 'workspace-authority',
              reason: 'Focused disposable workspace verification.',
            },
            caller: 'workspace-task-execution-test',
            operationKind: 'command.run',
            reason: 'Focused disposable workspace verification.',
            policy: {
              authorityRequirement: 'approved-for-write',
              decisionId: 'workspace-task-execution',
              decisionStatus: 'approved',
              policySource: 'test',
              redactionStatus: 'report-safe',
              reportSafeSummary: 'Focused disposable workspace verification.',
              terminalSuccessClaim: false,
              notProvenClaims: ['command-output-is-not-task-success'],
            },
          })
        : undefined

      if (commandResult) {
        commandOutputClassifications.push(commandResult.exitCode === 0 ? 'success' : 'failure')
      }

      return {
        batchId: batch.batchId,
        results: [{
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: item.actionKind === 'verify' ? item.coveredFiles : [],
          affectedPaths: item.targetPaths,
          exitStatusClass: commandResult && commandResult.exitCode !== 0 ? 'failure' : 'success',
          failureClass: commandResult && commandResult.exitCode !== 0 ? 'command-failed' : 'none',
          redactionStatus: 'report-safe',
          truncated: false,
          ...(item.actionKind === 'verify'
            ? {
                commandCoverage: {
                  taskId: item.toolId,
                  coveredFiles: item.coveredFiles,
                  uncoveredFiles: [],
                  coverageStatus: 'complete',
                },
              }
            : {}),
        }],
      }
    },
    dispose: () => rm(root, { recursive: true, force: true }),
  }
}

async function writeAll(
  executionService: Pick<ExecutionService, 'writeTextFile'>,
  root: string,
  files: Record<string, string>,
) {
  for (const [relativePath, content] of Object.entries(files)) {
    await executionService.writeTextFile({
      ...writeRequest(root, relativePath, content),
    })
  }
}

function agentOutput(
  role: AgentRole,
  input: {
    readonly content: string
    readonly handoffReason?: string
    readonly taskKind?: CodingResultSummary['taskKind']
    readonly continued?: boolean
    readonly changedFiles?: string[]
    readonly failedFiles?: Array<{ path: string; reason: string }>
    readonly evidenceFiles?: string[]
    readonly repair?: Partial<CodingResultSummary['repair']>
    readonly verification?: Partial<CodingResultSummary['verification']>
    readonly verifiedFiles?: string[]
    readonly requiredEvidence?: string[]
    readonly observedEvidence?: string[]
    readonly lastAction?: CodingResultSummary['lastActionResultSeed']
  },
): AgentExecutionOutput {
  return {
    role,
    content: input.content,
    handoffTo: input.handoffReason ? nextRoleAfter(role) : undefined,
    handoffReason: input.handoffReason,
    codingResult: codingResult(input),
  }
}

function nextRoleAfter(role: AgentRole): AgentRole {
  return role === 'planner' || role === 'reviewer' ? 'coder' : 'reviewer'
}

function runtimeSeedWithTaskState(
  sessionId: string,
  taskState: QueryRuntimeTaskState,
): QueryRuntimeStateSeed {
  return {
    config: {
      sessionId,
      initialPrompt: 'continue restored task state',
      maxTurns: 2,
      startingRole: 'coder' as const,
    },
    currentRole: 'coder' as const,
    turn: 1,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
    recoveryBoundary: 'completed-turn-reentry' as const,
    truthBoundary: {
      source: 'durable-replay' as const,
      normalizedEventCount: 0,
      pairedTurnCount: 0,
      policyEvidence: buildContinuationPolicyEvidence(['paired-turns']),
      repairSummary: {
        insertedPromptMessage: false,
        insertedQueryStarted: false,
        strippedInterruptedTerminalEvents: 0,
        insertedRunInterrupted: false,
        ignoredDuplicateTurnStarts: 0,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 0,
      },
      continuationSafety: 'completed-turn-only' as const,
    },
    derivedState: { transcript: [] },
    taskState,
  }
}

function codingResult(input: {
  readonly taskKind?: CodingResultSummary['taskKind']
  readonly continued?: boolean
  readonly changedFiles?: string[]
  readonly failedFiles?: Array<{ path: string; reason: string }>
  readonly evidenceFiles?: string[]
  readonly repair?: Partial<CodingResultSummary['repair']>
  readonly verification?: Partial<CodingResultSummary['verification']>
  readonly verifiedFiles?: string[]
  readonly requiredEvidence?: string[]
  readonly observedEvidence?: string[]
  readonly lastAction?: CodingResultSummary['lastActionResultSeed']
}): CodingResultSummary {
  const changedFiles = input.changedFiles ?? []
  const failedFiles = input.failedFiles ?? []
  const requiredEvidence = input.requiredEvidence ?? []
  const observedEvidence = input.observedEvidence ?? []
  return {
    taskKind: input.taskKind ?? 'edit-file',
    diagnosis: input.evidenceFiles ? {
      disposition: 'grounded-explanation',
      candidateFiles: [],
      evidenceFiles: input.evidenceFiles,
      searchPattern: 'task evidence',
      reason: 'Evidence files supplied by focused workspace task execution.',
      evidenceNodes: [],
      evidenceLinks: [],
    } : undefined,
    changedFiles,
    failedFiles,
    repair: {
      status: input.repair?.status ?? 'not-needed',
      attempts: input.repair?.attempts ?? 0,
      recoveredItems: input.repair?.recoveredItems ?? [],
      failedItems: input.repair?.failedItems ?? [],
      notes: input.repair?.notes ?? [],
    },
    continuation: {
      status: input.continued ? 'recovered-after-continuation' : 'first-pass-success',
      attempts: input.continued ? 1 : 0,
      evidence: input.continued ? ['restored task state'] : [],
    },
    changeSet: {
      gitAware: true,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: changedFiles,
      attemptedFiles: [...changedFiles, ...failedFiles.map(file => file.path)],
      changedFiles,
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: observedEvidence.length >= requiredEvidence.length ? 'satisfied' : 'insufficient-evidence',
      reasons: observedEvidence.length >= requiredEvidence.length ? [] : ['Missing required proof.'],
      requiredEvidence,
      observedEvidence,
    },
    verifiedFiles: input.verifiedFiles ?? (input.verification?.status === 'passed' ? changedFiles : []),
    unverifiedFiles: input.verification?.status === 'passed'
      ? []
      : changedFiles.map(path => ({ path, reason: input.verification?.reason ?? 'Not verified.' })),
    verification: {
      status: input.verification?.status ?? 'not-requested',
      command: input.verification?.command,
      reason: input.verification?.reason,
      selectionScope: input.verification?.selectionScope,
      selectionSource: input.verification?.selectionSource,
      blockerKind: input.verification?.blockerKind,
      nextAction: input.verification?.nextAction,
    },
    evidence: observedEvidence,
    lastActionResultSeed: input.lastAction,
  }
}
