import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentExecutionOutput, AgentRole, AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { createDefaultExecutionService, type CommandExecutionResult, type ExecutionService, type TextFileWriteExecutionRequest } from '../../../runtime/execution/service.js'
import { QueryEngine } from './engine.js'
import { buildContinuationPolicyEvidence, type QueryRuntimeStateSeed } from './state.js'
import type { QueryRuntimeTaskState } from './taskState.js'

describe('workspace task state runtime', () => {
  it('carries long task state across runtime phases with repair, rerun, receipts, and verdicts', async () => {
    const results = await Promise.all([
      runInvoiceReplayTask(),
      runLocaleCompactTask(),
      runRollupReceiptTask(),
      runGenericGreenIncompleteTask(),
    ])

    expect(results.map(result => result.taskId)).toEqual([
      'invoice-threshold-replay',
      'locale-label-compact',
      'rollup-source-receipt',
      'generic-green-incomplete',
    ])
    expect(results.map(result => `${result.taskId}:${result.verdict}`)).toEqual([
      'invoice-threshold-replay:completed',
      'locale-label-compact:completed',
      'rollup-source-receipt:completed',
      'generic-green-incomplete:stopped_not_proven',
    ])

    expect(results.filter(result => result.executed).length).toBeGreaterThanOrEqual(3)
    expect(results.filter(result => result.carryForwardKind !== 'none').length).toBeGreaterThanOrEqual(2)
    expect(results.filter(result => result.multiFileWrite).length).toBeGreaterThanOrEqual(2)
    expect(results.filter(result => result.initialFailureOutput.length > 0).length).toBeGreaterThanOrEqual(2)
    expect(results.filter(result => result.completedRepairAndTargetedRerun).length).toBeGreaterThanOrEqual(2)
    expect(results.filter(result => result.firstRepairFailedThenSecondSucceeded).length).toBeGreaterThanOrEqual(1)
    expect(results.filter(result => result.artifactOrSourceReceipt).length).toBeGreaterThanOrEqual(1)
    expect(results.filter(result => result.verdict === 'completed').length).toBeGreaterThanOrEqual(2)
    expect(results.every(result => result.manualCorrection === false)).toBe(true)

    expect(results[0]).toMatchObject({
      carryForwardKind: 'replay',
      durableStateFields: expect.arrayContaining([
        'changedFiles',
        'failureCategories',
        'nextVerificationPlan',
        'pendingAction',
        'proofGap',
        'repairAttempts',
      ]),
      firstRepairFailedThenSecondSucceeded: true,
      multiFileWrite: true,
      targetedReruns: 2,
      actions: expect.arrayContaining(['repair', 'verify', 'read']),
    })
    expect(results[1]).toMatchObject({
      carryForwardKind: 'compact',
      multiFileWrite: true,
      completedRepairAndTargetedRerun: true,
      actions: expect.arrayContaining(['read', 'repair', 'verify']),
    })
    expect(results[2]).toMatchObject({
      carryForwardKind: 'replay',
      artifactOrSourceReceipt: true,
      actions: expect.arrayContaining(['repair', 'verify']),
    })
    expect(results[3]).toMatchObject({
      verdict: 'stopped_not_proven',
      missingProof: expect.stringContaining('proof gap'),
    })

    for (const result of results) {
      expect(result.safeFailureSummaries.every(summary => !summary.includes(result.workspaceRoot))).toBe(true)
      expect(result.commandOutputClassifications[0]).toBe('failure')
    }
  })
})

interface LongWorkspaceTaskRecord {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly executed: boolean
  readonly carryForwardKind: 'replay' | 'compact' | 'none'
  readonly phases: readonly string[]
  readonly durableStateFields: readonly string[]
  readonly actions: readonly string[]
  readonly changedFiles: readonly string[]
  readonly initialFailureOutput: string
  readonly commandOutputClassifications: readonly string[]
  readonly safeFailureSummaries: readonly string[]
  readonly repairAttempts: readonly string[]
  readonly targetedReruns: number
  readonly completedRepairAndTargetedRerun: boolean
  readonly firstRepairFailedThenSecondSucceeded: boolean
  readonly multiFileWrite: boolean
  readonly artifactOrSourceReceipt: boolean
  readonly proofInput: readonly string[]
  readonly verdict: string
  readonly missingProof: string
  readonly manualCorrection: false
}

async function runInvoiceReplayTask(): Promise<LongWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/invoice/rules.mjs': 'export const discountThreshold = 200;\nexport const discountRate = 0.05;\n',
    'src/invoice/total.mjs': 'import { discountRate, discountThreshold } from "./rules.mjs";\nexport function invoiceTotal(base) { return base > discountThreshold ? base - base * discountRate : base; }\n',
    'test/invoiceTotal.mjs': 'import { invoiceTotal } from "../src/invoice/total.mjs";\nconst actual = invoiceTotal(150);\nif (actual !== 135) throw new Error(`expected invoice total 135 got ${actual}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/invoiceTotal.mjs')
    const taskState = taskStateFor({
      source: 'replay',
      pendingAction: 'repair',
      proofGap: [`invoice verification failed: ${initial.summary}`],
      changedFiles: ['src/invoice/total.mjs', 'src/invoice/rules.mjs'],
      failureCategories: ['verification failed'],
      originalFailureClassification: initial.summary,
      repairAttempts: [
        {
          attempt: 1,
          signature: 'src/invoice/total.mjs:threshold-only',
          reason: 'previous repair left wrong discount rate',
          changedFiles: ['src/invoice/total.mjs'],
        },
      ],
      command: 'node test/invoiceTotal.mjs',
      targetFiles: ['src/invoice/total.mjs', 'src/invoice/rules.mjs', 'test/invoiceTotal.mjs'],
      failedFiles: ['test/invoiceTotal.mjs'],
      nextAction: 'read invoice rules before distinct repair',
      safetyReason: 'replay restored invoice repair state',
    })
    const actions: string[] = []
    const result = await engineFor(workspace, longTaskAgent({
      actions,
      sourceContext: ['src/invoice/total.mjs', 'src/invoice/rules.mjs', 'test/invoiceTotal.mjs'],
      changedFiles: ['src/invoice/total.mjs', 'src/invoice/rules.mjs'],
      requiredEvidence: ['invoice failure output', 'invoice source context', 'targeted invoice rerun'],
      finalEvidence: ['invoice failure output', 'invoice source context', 'targeted invoice rerun'],
      firstRepairReason: 'expected invoice total 135 got 142.5',
      continued: true,
    }), {
      repairSteps: [
        { 'src/invoice/total.mjs': 'import { discountRate, discountThreshold } from "./rules.mjs";\nexport function invoiceTotal(base) { return base >= discountThreshold - 50 ? base - base * discountRate : base; }\n' },
        {
          'src/invoice/total.mjs': 'import { discountRate, discountThreshold } from "./rules.mjs";\nexport function invoiceTotal(base) { return base >= discountThreshold ? base - base * discountRate : base; }\n',
          'src/invoice/rules.mjs': 'export const discountThreshold = 150;\nexport const discountRate = 0.1;\n',
        },
      ],
      verifyCommand: 'node test/invoiceTotal.mjs',
    }).submitMessage('sess_invoice_replay_task', 'continue invoice repair from restored task state', {
      maxTurns: 9,
      runtimeSeed: runtimeSeedWithTaskState('sess_invoice_replay_task', taskState),
    })

    return longTaskRecord('invoice-threshold-replay', workspace, actions, initial.summary, result, taskState, {
      carryForwardKind: 'replay',
      firstRepairFailedThenSecondSucceeded: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runLocaleCompactTask(): Promise<LongWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/locale/messages.mjs': 'export const labels = { save: "Save" };\n',
    'src/locale/render.mjs': 'import { labels } from "./messages.mjs";\nexport function renderSave(locale) { return `${locale}:${labels.save}`; }\n',
    'test/localeRender.mjs': 'import { renderSave } from "../src/locale/render.mjs";\nconst actual = renderSave("fr");\nif (actual !== "fr:Enregistrer") throw new Error(`expected locale label fr:Enregistrer got ${actual}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/localeRender.mjs')
    const taskState = taskStateFor({
      source: 'compact',
      pendingAction: 'read',
      proofGap: [`compact carried locale failure: ${initial.summary}`],
      changedFiles: ['src/locale/messages.mjs', 'src/locale/render.mjs'],
      failureCategories: ['verification failed', 'missing context'],
      originalFailureClassification: initial.summary,
      repairAttempts: [],
      command: 'node test/localeRender.mjs',
      targetFiles: ['src/locale/messages.mjs', 'src/locale/render.mjs', 'test/localeRender.mjs'],
      failedFiles: ['test/localeRender.mjs'],
      nextAction: 'read compact-carried locale files before repair',
      safetyReason: 'compact retained changed files and failed target',
    })
    const actions: string[] = []
    const result = await engineFor(workspace, longTaskAgent({
      actions,
      sourceContext: ['src/locale/messages.mjs', 'src/locale/render.mjs', 'test/localeRender.mjs'],
      changedFiles: ['src/locale/messages.mjs', 'src/locale/render.mjs'],
      requiredEvidence: ['locale failure output', 'locale source context', 'targeted locale rerun'],
      finalEvidence: ['locale failure output', 'locale source context', 'targeted locale rerun'],
      continued: true,
    }), {
      repairSteps: [
        {
          'src/locale/messages.mjs': 'export const labels = { save: "Enregistrer" };\n',
          'src/locale/render.mjs': 'import { labels } from "./messages.mjs";\nexport function renderSave(locale) { return `${locale}:${labels.save}`; }\n',
        },
      ],
      verifyCommand: 'node test/localeRender.mjs',
    }).submitMessage('sess_locale_compact_task', 'resume compact carried locale repair state', {
      maxTurns: 8,
      runtimeSeed: runtimeSeedWithTaskState('sess_locale_compact_task', taskState),
    })

    return longTaskRecord('locale-label-compact', workspace, actions, initial.summary, result, taskState, {
      carryForwardKind: 'compact',
    })
  } finally {
    await workspace.dispose()
  }
}

async function runRollupReceiptTask(): Promise<LongWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'data/sales.json': '{"region":"west","orders":[12,18,20]}\n',
    'reports/sales-rollup.md': 'region: west\norders: 2\ntotal: 30\n',
    'test/salesRollup.mjs': 'import { readFileSync } from "node:fs";\nconst data = JSON.parse(readFileSync("data/sales.json", "utf8"));\nconst report = readFileSync("reports/sales-rollup.md", "utf8");\nif (!report.includes(`orders: ${data.orders.length}`)) throw new Error("missing source receipt: order count mismatch");\nif (!report.includes(`total: ${data.orders.reduce((sum, value) => sum + value, 0)}`)) throw new Error("source receipt mismatch: total");\n',
  })
  try {
    const initial = await workspace.runVerification('node test/salesRollup.mjs')
    const taskState = taskStateFor({
      source: 'replay',
      pendingAction: 'repair',
      proofGap: [`rollup verification failed: ${initial.summary}`, 'artifact source receipt missing'],
      changedFiles: ['reports/sales-rollup.md'],
      failureCategories: ['verification failed', 'artifact invalid'],
      originalFailureClassification: initial.summary,
      repairAttempts: [],
      command: 'node test/salesRollup.mjs',
      targetFiles: ['reports/sales-rollup.md'],
      failedFiles: ['reports/sales-rollup.md'],
      nextAction: 'repair report then produce source receipt',
      safetyReason: 'replay restored artifact proof gap',
      artifactClaims: ['sales rollup matches source data'],
      artifactEvidenceIds: ['data/sales.json'],
      missingClaims: ['verification receipt'],
    })
    const actions: string[] = []
    const result = await engineFor(workspace, longTaskAgent({
      actions,
      sourceContext: ['data/sales.json', 'reports/sales-rollup.md', 'test/salesRollup.mjs'],
      changedFiles: ['reports/sales-rollup.md'],
      requiredEvidence: ['source receipt'],
      finalEvidence: ['data/sales.json'],
      continued: true,
    }), {
      repairSteps: [
        { 'reports/sales-rollup.md': 'region: west\norders: 3\ntotal: 50\nsource: data/sales.json\n' },
      ],
      artifact: {
        'reports/sales-rollup.md': 'region: west\norders: 3\ntotal: 50\nsource: data/sales.json\nreceipt: node test/salesRollup.mjs\n',
      },
      verifyCommand: 'node test/salesRollup.mjs',
    }).submitMessage('sess_rollup_receipt_task', 'debug repair report artifact from data/sales.json', {
      maxTurns: 9,
      runtimeSeed: runtimeSeedWithTaskState('sess_rollup_receipt_task', taskState, 'debug repair report artifact from data/sales.json'),
    })

    return longTaskRecord('rollup-source-receipt', workspace, actions, initial.summary, result, taskState, {
      carryForwardKind: 'replay',
      artifactOrSourceReceipt: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runGenericGreenIncompleteTask(): Promise<LongWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/status.mjs': 'export const status = "red";\n',
    'test/status.mjs': 'import { status } from "../src/status.mjs";\nif (status !== "green") throw new Error(`expected status green got ${status}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/status.mjs')
    const taskState = taskStateFor({
      source: 'compact',
      pendingAction: 'verify',
      proofGap: [`status verification failed: ${initial.summary}`],
      changedFiles: ['src/status.mjs'],
      failureCategories: ['verification failed'],
      originalFailureClassification: initial.summary,
      repairAttempts: [],
      command: 'node test/status.mjs',
      targetFiles: ['src/status.mjs', 'test/status.mjs'],
      failedFiles: ['test/status.mjs'],
      nextAction: 'rerun exact failed target',
      safetyReason: 'compact retained failed target',
    })
    const actions: string[] = []
    const result = await engineFor(workspace, async ({ role, runtimeAction, turn }) => {
      actions.push(runtimeAction.nextAction)
      return agentOutput(role, {
        content: `generic command only turn ${turn}`,
        handoffReason: undefined,
        continued: true,
        changedFiles: ['src/status.mjs'],
        evidenceFiles: ['src/status.mjs'],
        verification: { status: 'passed', command: 'node --version', reason: 'generic command is not target proof' },
        requiredEvidence: ['targeted status rerun'],
        observedEvidence: [],
        lastAction: {
          actionKind: runtimeAction.nextAction,
          target: 'src/status.mjs',
          verifiedFiles: [],
          verification: { status: 'passed', reason: 'generic command is not target proof' },
        },
      })
    }, {
      repairSteps: [],
      verifyCommand: 'node --version',
    }).submitMessage('sess_generic_green_incomplete', 'do not accept generic command as target proof', {
      maxTurns: 4,
      runtimeSeed: runtimeSeedWithTaskState('sess_generic_green_incomplete', taskState),
    })

    return longTaskRecord('generic-green-incomplete', workspace, actions, initial.summary, result, taskState, {
      carryForwardKind: 'compact',
    })
  } finally {
    await workspace.dispose()
  }
}

interface LongWorkspaceBatchConfig {
  readonly repairSteps?: readonly Record<string, string>[]
  readonly artifact?: Record<string, string>
  readonly verifyCommand: string
}

async function createWorkspace(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'workspace-task-state-'))
  const executionService = createDefaultExecutionService()
  await writeAll(executionService, root, files)
  const commandOutputClassifications: string[] = []
  const safeFailureSummaries: string[] = []
  const repairAttempts: string[] = []
  let repairStep = 0
  let repairWriteCount = 0
  let targetedReruns = 0
  return {
    root,
    get commandOutputClassifications() {
      return commandOutputClassifications
    },
    get safeFailureSummaries() {
      return safeFailureSummaries
    },
    get repairAttempts() {
      return repairAttempts
    },
    get repairWriteCount() {
      return repairWriteCount
    },
    get targetedReruns() {
      return targetedReruns
    },
    runVerification: async (commandLine: string) => {
      const command = commandLine.split(' ')[0] ?? 'node'
      const args = commandLine.split(' ').slice(1)
      const commandResult = await runWorkspaceCommand(executionService, root, command, args, commandLine)
      const summary = summarizeCommandOutput(commandResult, root)
      commandOutputClassifications.push(commandResult.exitCode === 0 ? 'success' : 'failure')
      if (commandResult.exitCode !== 0) safeFailureSummaries.push(summary)
      return { commandResult, summary }
    },
    batchExecutor: (config: LongWorkspaceBatchConfig) => async ({ batch }: any) => {
      const item = batch.items[0]
      if (!item) return { batchId: batch.batchId, results: [] }
      if (item.actionKind === 'repair' && config.repairSteps?.[repairStep]) {
        const files = config.repairSteps[repairStep]
        await writeAll(executionService, root, files)
        repairAttempts.push(Object.keys(files).join(','))
        repairWriteCount += Object.keys(files).length
        repairStep += 1
      }
      if (item.actionKind === 'artifact' && config.artifact) {
        await writeAll(executionService, root, config.artifact)
      }
      const shouldRunCommand = item.actionKind === 'verify' || item.actionKind === 'artifact'
      const commandResult = shouldRunCommand
        ? await runWorkspaceCommand(
            executionService,
            root,
            config.verifyCommand.split(' ')[0] ?? 'node',
            config.verifyCommand.split(' ').slice(1),
            config.verifyCommand,
          )
        : undefined
      const diagnosticSummary = commandResult ? summarizeCommandOutput(commandResult, root) : undefined
      if (commandResult) {
        targetedReruns += config.verifyCommand.includes('test/') ? 1 : 0
        commandOutputClassifications.push(commandResult.exitCode === 0 ? 'success' : 'failure')
        if (commandResult.exitCode !== 0 && diagnosticSummary) safeFailureSummaries.push(diagnosticSummary)
      }
      return {
        batchId: batch.batchId,
        results: [{
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: item.actionKind === 'verify' || item.actionKind === 'artifact' ? item.coveredFiles : [],
          affectedPaths: item.targetPaths,
          exitStatusClass: commandResult && commandResult.exitCode !== 0 ? 'failed' : 'success',
          failureClass: commandResult && commandResult.exitCode !== 0 ? 'command-failed' : 'none',
          ...(commandResult && commandResult.exitCode !== 0 && diagnosticSummary ? { diagnosticSummary } : {}),
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

type DisposableLongWorkspace = Awaited<ReturnType<typeof createWorkspace>>

function engineFor(
  workspace: DisposableLongWorkspace,
  runAgent: AgentRunner,
  config: LongWorkspaceBatchConfig,
) {
  return new QueryEngine({
    runAgent,
    executeRuntimeBatch: workspace.batchExecutor(config),
  } as any)
}

function longTaskAgent(input: {
  readonly actions: string[]
  readonly sourceContext: readonly string[]
  readonly changedFiles: readonly string[]
  readonly requiredEvidence: readonly string[]
  readonly finalEvidence: readonly string[]
  readonly firstRepairReason?: string
  readonly continued?: boolean
  readonly artifactEvidence?: string
}): AgentRunner {
  return async ({ role, runtimeAction, turn }) => {
    input.actions.push(runtimeAction.nextAction)
    if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
      return agentOutput(role, {
        content: `source context ready turn ${turn}`,
        handoffReason: `repair source context ${turn}`,
        continued: input.continued,
        changedFiles: [...input.changedFiles],
        evidenceFiles: [...input.sourceContext],
        verification: { status: 'failed', reason: input.firstRepairReason ?? 'verification failed before repair' },
        requiredEvidence: input.requiredEvidence,
        observedEvidence: input.requiredEvidence.filter(item => item.includes('failure') || item.includes('context')),
        lastAction: { actionKind: runtimeAction.nextAction, target: input.sourceContext[0] },
      })
    }
    if (runtimeAction.nextAction === 'repair') {
      return agentOutput(role, {
        content: `repair write applied turn ${turn}`,
        handoffReason: `targeted rerun ${turn}`,
        continued: input.continued,
        changedFiles: [...input.changedFiles],
        evidenceFiles: [...input.sourceContext],
        repair: { status: 'recovered', attempts: 1, recoveredItems: [...input.changedFiles] },
        verification: { status: 'not-requested', reason: 'targeted rerun pending' },
        requiredEvidence: input.requiredEvidence,
        observedEvidence: input.artifactEvidence
          ? []
          : input.requiredEvidence.filter(item => item.includes('failure') || item.includes('context') || item.includes('source')),
        lastAction: {
          actionKind: 'repair',
          target: input.changedFiles[0],
          changedFiles: [...input.changedFiles],
        },
      })
    }
    if (runtimeAction.nextAction === 'artifact') {
      return agentOutput(role, {
        content: `source receipt produced turn ${turn}`,
        changedFiles: [...input.changedFiles],
        evidenceFiles: [...input.sourceContext],
        repair: { status: 'recovered', attempts: 1, recoveredItems: [...input.changedFiles] },
        verification: { status: 'passed', command: 'node test/salesRollup.mjs', reason: 'source receipt validated' },
        requiredEvidence: input.requiredEvidence,
        observedEvidence: [...input.finalEvidence],
        lastAction: {
          actionKind: 'artifact',
          target: input.changedFiles[0],
          changedFiles: [...input.changedFiles],
        },
      })
    }
    return agentOutput(role, {
      content: `targeted verification evaluated turn ${turn}`,
      handoffReason: currentCommandFailed(input.actions)
        ? `second repair strategy context ${turn}`
        : input.artifactEvidence
          ? `source receipt ${turn}`
          : undefined,
      continued: input.continued,
      changedFiles: [...input.changedFiles],
      failedFiles: currentCommandFailed(input.actions)
        ? [{ path: input.sourceContext[input.sourceContext.length - 1] ?? input.changedFiles[0], reason: input.firstRepairReason ?? 'targeted verification failed' }]
        : [],
      evidenceFiles: [...input.sourceContext],
      repair: currentCommandFailed(input.actions)
        ? { status: 'failed', attempts: 1, failedItems: [...input.changedFiles], notes: [input.firstRepairReason ?? 'targeted verification failed'] }
        : { status: 'recovered', attempts: 1, recoveredItems: [...input.changedFiles] },
      verification: currentCommandFailed(input.actions)
        ? { status: 'failed', command: 'targeted command', reason: input.firstRepairReason ?? 'targeted verification failed' }
        : {
            status: 'passed',
            command: 'targeted command',
            reason: 'targeted verification passed',
            ...(input.artifactEvidence ? { nextAction: 'produce source receipt' } : {}),
          },
      requiredEvidence: input.requiredEvidence,
      observedEvidence: currentCommandFailed(input.actions)
        ? input.requiredEvidence.filter(item => item.includes('failure') || item.includes('context'))
        : input.artifactEvidence
          ? []
          : [...input.finalEvidence],
      lastAction: {
        actionKind: 'verify',
        target: input.changedFiles[0],
        verifiedFiles: [...input.changedFiles],
        verification: { status: currentCommandFailed(input.actions) ? 'failed' : 'passed' },
        reason: currentCommandFailed(input.actions) ? input.firstRepairReason : 'targeted verification passed',
      },
    })
  }
}

function currentCommandFailed(actions: readonly string[]): boolean {
  const verifyCount = actions.filter(action => action === 'verify').length
  return verifyCount === 1
}

function taskStateFor(input: {
  readonly source: QueryRuntimeTaskState['source']
  readonly pendingAction: QueryRuntimeTaskState['pendingAction']
  readonly proofGap: readonly string[]
  readonly changedFiles: readonly string[]
  readonly failureCategories: readonly string[]
  readonly originalFailureClassification: string
  readonly repairAttempts: QueryRuntimeTaskState['repairAttempts']
  readonly command: string
  readonly targetFiles: readonly string[]
  readonly failedFiles: readonly string[]
  readonly nextAction: string
  readonly safetyReason: string
  readonly artifactClaims?: readonly string[]
  readonly artifactEvidenceIds?: readonly string[]
  readonly missingClaims?: readonly string[]
}): QueryRuntimeTaskState {
  return {
    source: input.source,
    pendingAction: input.pendingAction,
    proofGap: input.proofGap,
    changedFiles: input.changedFiles,
    verifiedFiles: [],
    unverifiedFiles: input.changedFiles,
    failureCategories: input.failureCategories,
    originalFailureClassification: input.originalFailureClassification,
    repairAttempts: input.repairAttempts,
    nextVerificationPlan: {
      command: input.command,
      targetFiles: input.targetFiles,
      failedFiles: input.failedFiles,
      status: 'failed',
      nextAction: input.nextAction,
    },
    artifactPendingState: {
      claims: input.artifactClaims ?? [],
      evidenceIds: input.artifactEvidenceIds ?? [],
      missingClaims: input.missingClaims ?? [],
    },
    continuationSafety: { status: 'safe', reasons: [input.safetyReason] },
  }
}

function longTaskRecord(
  taskId: string,
  workspace: DisposableLongWorkspace,
  actions: readonly string[],
  initialFailureOutput: string,
  result: Awaited<ReturnType<QueryEngine['submitMessage']>>,
  taskState: QueryRuntimeTaskState,
  flags: Partial<Pick<LongWorkspaceTaskRecord,
    'carryForwardKind' |
    'firstRepairFailedThenSecondSucceeded' |
    'artifactOrSourceReceipt'
  >>,
): LongWorkspaceTaskRecord {
  const changedFiles = result.codingResult?.changedFiles ?? []
  const completedRepairAndTargetedRerun =
    result.status === 'completed' &&
    actions.includes('repair') &&
    actions.includes('verify') &&
    workspace.targetedReruns > 0
  return {
    taskId,
    workspaceRoot: workspace.root,
    executed: true,
    carryForwardKind: flags.carryForwardKind ?? taskState.source,
    phases: ['initial failing verification', `${taskState.source} task-state restore`, 'runtime next action', 'execution batch', 'result verdict'],
    durableStateFields: durableStateFields(taskState),
    actions,
    changedFiles,
    initialFailureOutput,
    commandOutputClassifications: [...workspace.commandOutputClassifications],
    safeFailureSummaries: [...workspace.safeFailureSummaries],
    repairAttempts: [...workspace.repairAttempts],
    targetedReruns: workspace.targetedReruns,
    completedRepairAndTargetedRerun,
    firstRepairFailedThenSecondSucceeded: flags.firstRepairFailedThenSecondSucceeded ?? false,
    multiFileWrite: workspace.repairWriteCount >= 2 || changedFiles.length >= 2,
    artifactOrSourceReceipt: flags.artifactOrSourceReceipt ?? false,
    proofInput: result.codingResult?.taskSatisfaction.observedEvidence ?? [],
    verdict: result.status,
    missingProof: result.stopReason ?? 'n/a',
    manualCorrection: false,
  }
}

function durableStateFields(taskState: QueryRuntimeTaskState): string[] {
  return [
    ...(taskState.pendingAction ? ['pendingAction'] : []),
    ...(taskState.proofGap.length > 0 ? ['proofGap'] : []),
    ...(taskState.changedFiles.length > 0 ? ['changedFiles'] : []),
    ...(taskState.failureCategories.length > 0 ? ['failureCategories'] : []),
    ...(taskState.repairAttempts.length > 0 ? ['repairAttempts'] : []),
    ...(taskState.nextVerificationPlan.targetFiles.length > 0 ? ['nextVerificationPlan'] : []),
    ...(taskState.artifactPendingState.claims.length > 0 || taskState.artifactPendingState.missingClaims.length > 0
      ? ['artifactPendingState']
      : []),
  ]
}

function agentOutput(
  role: AgentRole,
  input: {
    readonly content: string
    readonly handoffReason?: string
    readonly continued?: boolean
    readonly changedFiles?: string[]
    readonly failedFiles?: Array<{ path: string; reason: string }>
    readonly evidenceFiles?: string[]
    readonly repair?: Partial<CodingResultSummary['repair']>
    readonly verification?: Partial<CodingResultSummary['verification']>
    readonly requiredEvidence?: readonly string[]
    readonly observedEvidence?: readonly string[]
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
  return role === 'planner' ? 'coder' : role === 'coder' ? 'reviewer' : 'coder'
}

function codingResult(input: {
  readonly continued?: boolean
  readonly changedFiles?: string[]
  readonly failedFiles?: Array<{ path: string; reason: string }>
  readonly evidenceFiles?: string[]
  readonly repair?: Partial<CodingResultSummary['repair']>
  readonly verification?: Partial<CodingResultSummary['verification']>
  readonly requiredEvidence?: readonly string[]
  readonly observedEvidence?: readonly string[]
  readonly lastAction?: CodingResultSummary['lastActionResultSeed']
}): CodingResultSummary {
  const changedFiles = input.changedFiles ?? []
  const failedFiles = input.failedFiles ?? []
  const requiredEvidence = [...(input.requiredEvidence ?? [])]
  const observedEvidence = [...(input.observedEvidence ?? [])]
  return {
    taskKind: 'edit-file',
    diagnosis: input.evidenceFiles ? {
      disposition: 'grounded-explanation',
      candidateFiles: [],
      evidenceFiles: input.evidenceFiles,
      searchPattern: 'failing verification output',
      reason: 'Safe command failure summary selected source context.',
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
      evidence: input.continued ? ['durable task state restored'] : [],
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
    verifiedFiles: input.verification?.status === 'passed' ? changedFiles : [],
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

function runtimeSeedWithTaskState(
  sessionId: string,
  taskState: QueryRuntimeTaskState,
  initialPrompt = 'continue long workspace task',
): QueryRuntimeStateSeed {
  return {
    config: {
      sessionId,
      initialPrompt,
      maxTurns: 9,
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
      reason: 'Disposable workspace task write.',
    },
    caller: 'workspace-task-state-test',
    reason: 'Disposable workspace task write.',
    reportSafeTarget: relativePath,
    content,
  }
}

async function runWorkspaceCommand(
  executionService: ExecutionService,
  root: string,
  command: string,
  args: readonly string[],
  reportSafeCommand: string,
): Promise<CommandExecutionResult> {
  return executionService.runCommand({
    command,
    args,
    cwd: root,
    reportSafeCommand,
    workspaceRoot: root,
    authority: {
      mode: 'approved-for-write',
      source: 'workspace-authority',
      reason: 'Focused disposable workspace verification.',
    },
    caller: 'workspace-task-state-test',
    operationKind: 'command.run',
    reason: 'Focused disposable workspace verification.',
    policy: {
      authorityRequirement: 'approved-for-write',
      decisionId: 'workspace-task-state',
      decisionStatus: 'approved',
      policySource: 'test',
      redactionStatus: 'report-safe',
      reportSafeSummary: 'Focused disposable workspace verification.',
      terminalSuccessClaim: false,
      notProvenClaims: ['command-output-is-not-task-success'],
    },
  })
}

function summarizeCommandOutput(result: CommandExecutionResult, root: string): string {
  const output = `${result.stderr}\n${result.stdout}`
    .replaceAll(root, '<workspace>')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .find(line => line.includes('Error:') || line.includes('expected') || line.includes('missing') || line.includes('mismatch') || line.includes('got'))
  return (output ?? `exit ${result.exitCode ?? 'none'} ${result.errorClass}`).replace(/\s+/g, ' ').slice(0, 180)
}
