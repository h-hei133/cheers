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

describe('workspace repair verification runtime', () => {
  it('uses real failing command output for repair, rerun, proof, and terminal verdicts', async () => {
    const results = await Promise.all([
      runOrderTotalRepairTask(),
      runReleaseManifestRepairTask(),
      runReplayRepairTask(),
      runArtifactReceiptRepairTask(),
      runGenericGreenBlockedTask(),
    ])

    expect(results.map(result => result.taskId)).toEqual([
      'order-total-repair',
      'release-manifest-repair',
      'replay-preserved-repair',
      'artifact-receipt-repair',
      'generic-green-blocked',
    ])
    expect(results.map(result => `${result.taskId}:${result.verdict}`)).toEqual([
      'order-total-repair:completed',
      'release-manifest-repair:completed',
      'replay-preserved-repair:completed',
      'artifact-receipt-repair:completed',
      'generic-green-blocked:stopped_not_proven',
    ])

    expect(results.filter(result => result.initialFailureOutput.length > 0)).toHaveLength(5)
    expect(results.filter(result => result.verdict === 'completed')).toHaveLength(4)
    expect(results.filter(result => result.actualRepairWrites > 0).length).toBeGreaterThanOrEqual(3)
    expect(results.filter(result => result.multiFileRepair).length).toBeGreaterThanOrEqual(2)
    expect(results.filter(result => result.firstRepairFailedThenSecondSucceeded).length).toBeGreaterThanOrEqual(2)

    expect(results[0]).toMatchObject({
      verdict: 'completed',
      firstRepairFailedThenSecondSucceeded: true,
      multiFileRepair: true,
      actions: expect.arrayContaining(['repair', 'verify', 'read']),
      targetedReruns: 2,
      manualCorrection: false,
    })
    expect(results[1]).toMatchObject({
      verdict: 'completed',
      missingContextDiscovery: true,
      firstRepairFailedThenSecondSucceeded: true,
      multiFileRepair: true,
      targetedReruns: 2,
    })
    expect(results[2]).toMatchObject({
      verdict: 'completed',
      replayPreservedFailure: true,
      actions: expect.arrayContaining(['repair', 'verify']),
    })
    expect(results[3]).toMatchObject({
      verdict: 'completed',
      artifactOrSourceReceipt: true,
      actions: expect.arrayContaining(['repair', 'verify', 'artifact']),
    })
    expect(results[4]).toMatchObject({
      verdict: 'stopped_not_proven',
      missingProof: expect.stringContaining('proof gap'),
    })

    for (const result of results) {
      expect(result.commandOutputClassifications[0]).toBe('failure')
      expect(result.safeFailureSummaries.every(summary => !summary.includes(result.workspaceRoot))).toBe(true)
      expect(result.manualCorrection).toBe(false)
    }
  })
})

interface RepairWorkspaceTaskRecord {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly actions: readonly string[]
  readonly commandOutputClassifications: readonly string[]
  readonly safeFailureSummaries: readonly string[]
  readonly initialFailureOutput: string
  readonly repairSourceContext: readonly string[]
  readonly changedFiles: readonly string[]
  readonly actualRepairWrites: number
  readonly multiFileRepair: boolean
  readonly firstRepairFailedThenSecondSucceeded: boolean
  readonly missingContextDiscovery: boolean
  readonly replayPreservedFailure: boolean
  readonly artifactOrSourceReceipt: boolean
  readonly targetedReruns: number
  readonly proofInput: readonly string[]
  readonly verdict: string
  readonly missingProof: string
  readonly manualCorrection: false
}

async function runOrderTotalRepairTask(): Promise<RepairWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/tax.mjs': 'export const taxRate = 0.05;\n',
    'src/orderTotal.mjs': 'import { taxRate } from "./tax.mjs";\nexport function total(base) { return base + base * taxRate; }\n',
    'test/orderTotal.mjs': 'import { total } from "../src/orderTotal.mjs";\nconst actual = total(100);\nif (actual !== 108) throw new Error(`expected total 108 got ${actual}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/orderTotal.mjs')
    const actions: string[] = []
    const agent = repairAgent({
      actions,
      sourceContext: ['src/orderTotal.mjs', 'src/tax.mjs', 'test/orderTotal.mjs'],
      changedFiles: ['src/orderTotal.mjs', 'src/tax.mjs'],
      requiredEvidence: ['initial failure output', 'order total source context', 'targeted order rerun'],
      firstRepairReason: 'expected total 108 got 107',
      finalEvidence: ['initial failure output', 'order total source context', 'targeted order rerun'],
    })
    const result = await engineFor(workspace, agent, {
      repairSteps: [
        { 'src/orderTotal.mjs': 'import { taxRate } from "./tax.mjs";\nexport function total(base) { return base + base * 0.07; }\n' },
        {
          'src/orderTotal.mjs': 'import { taxRate } from "./tax.mjs";\nexport function total(base) { return base + base * taxRate; }\n',
          'src/tax.mjs': 'export const taxRate = 0.08;\n',
        },
      ],
      verifyCommand: 'node test/orderTotal.mjs',
    }).submitMessage('sess_order_total_repair', 'debug repair order total verification failure in src/orderTotal.mjs', {
      maxTurns: 8,
      runtimeSeed: runtimeSeedWithTaskState('sess_order_total_repair', {
        source: 'replay',
        pendingAction: 'repair',
        proofGap: [`verification failed: ${initial.summary}`],
        changedFiles: ['src/orderTotal.mjs', 'src/tax.mjs'],
        verifiedFiles: [],
        unverifiedFiles: ['src/orderTotal.mjs', 'src/tax.mjs'],
        failureCategories: ['verification failed'],
        originalFailureClassification: initial.summary,
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'node test/orderTotal.mjs',
          targetFiles: ['src/orderTotal.mjs', 'src/tax.mjs', 'test/orderTotal.mjs'],
          failedFiles: ['test/orderTotal.mjs'],
          status: 'failed',
          nextAction: 'repair from failing order total output',
        },
        artifactPendingState: { claims: [], evidenceIds: [], missingClaims: [] },
        continuationSafety: { status: 'safe', reasons: ['initial verification failure preserved'] },
      }),
    })

    return workspaceRecord('order-total-repair', workspace, actions, initial.summary, result, {
      repairSourceContext: ['src/orderTotal.mjs', 'src/tax.mjs'],
      firstRepairFailedThenSecondSucceeded: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runReleaseManifestRepairTask(): Promise<RepairWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/release/manifest.mjs': 'export const manifest = { channel: "stable", version: "1.0.0" };\n',
    'src/release/policy.mjs': 'export const requiredChannel = "beta";\nexport const requiredVersion = "1.1.0";\n',
    'test/releaseManifest.mjs': 'import { manifest } from "../src/release/manifest.mjs";\nimport { requiredChannel, requiredVersion } from "../src/release/policy.mjs";\nif (manifest.channel !== requiredChannel) throw new Error(`missing context: channel ${manifest.channel} expected ${requiredChannel}`);\nif (manifest.version !== requiredVersion) throw new Error(`version ${manifest.version} expected ${requiredVersion}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/releaseManifest.mjs')
    const actions: string[] = []
    const agent = repairAgent({
      actions,
      sourceContext: ['src/release/manifest.mjs', 'src/release/policy.mjs', 'test/releaseManifest.mjs'],
      changedFiles: ['src/release/manifest.mjs', 'src/release/policy.mjs'],
      requiredEvidence: ['release failure output', 'release policy source context', 'targeted release rerun'],
      firstRepairReason: 'version 1.0.0 expected 1.1.0',
      finalEvidence: ['release failure output', 'release policy source context', 'targeted release rerun'],
    })
    const result = await engineFor(workspace, agent, {
      repairSteps: [
        { 'src/release/manifest.mjs': 'export const manifest = { channel: "beta", version: "1.0.0" };\n' },
        {
          'src/release/manifest.mjs': 'export const manifest = { channel: "beta", version: "1.1.0" };\n',
          'src/release/policy.mjs': 'export const requiredChannel = "beta";\nexport const requiredVersion = "1.1.0";\n',
        },
      ],
      verifyCommand: 'node test/releaseManifest.mjs',
    }).submitMessage('sess_release_manifest_repair', 'debug repair missing context in src/release/manifest.mjs', {
      maxTurns: 9,
      runtimeSeed: runtimeSeedWithTaskState('sess_release_manifest_repair', {
        source: 'replay',
        pendingAction: 'search',
        proofGap: [`verification failed with missing context: ${initial.summary}`],
        changedFiles: ['src/release/manifest.mjs', 'src/release/policy.mjs'],
        verifiedFiles: [],
        unverifiedFiles: ['src/release/manifest.mjs', 'src/release/policy.mjs'],
        failureCategories: ['verification failed', 'missing context'],
        originalFailureClassification: initial.summary,
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'node test/releaseManifest.mjs',
          targetFiles: ['src/release/manifest.mjs', 'src/release/policy.mjs', 'test/releaseManifest.mjs'],
          failedFiles: ['test/releaseManifest.mjs'],
          status: 'failed',
          nextAction: 'discover release policy before repair',
        },
        artifactPendingState: { claims: [], evidenceIds: [], missingClaims: [] },
        continuationSafety: { status: 'safe', reasons: ['initial verification failure preserved'] },
      }),
    })

    return workspaceRecord('release-manifest-repair', workspace, actions, initial.summary, result, {
      repairSourceContext: ['src/release/manifest.mjs', 'src/release/policy.mjs'],
      firstRepairFailedThenSecondSucceeded: true,
      missingContextDiscovery: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runReplayRepairTask(): Promise<RepairWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/session/label.mjs': 'export const label = "stale";\n',
    'test/sessionLabel.mjs': 'import { label } from "../src/session/label.mjs";\nif (label !== "restored") throw new Error(`restored label expected, got ${label}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/sessionLabel.mjs')
    const actions: string[] = []
    const agent = repairAgent({
      actions,
      sourceContext: ['src/session/label.mjs', 'test/sessionLabel.mjs'],
      changedFiles: ['src/session/label.mjs'],
      requiredEvidence: ['replay failure output', 'targeted replay rerun'],
      finalEvidence: ['replay failure output', 'targeted replay rerun'],
      continued: true,
    })
    const result = await engineFor(workspace, agent, {
      repairSteps: [
        { 'src/session/label.mjs': 'export const label = "restored";\n' },
      ],
      verifyCommand: 'node test/sessionLabel.mjs',
    }).submitMessage('sess_replay_preserved_repair', 'continue preserved verification failure and repair src/session/label.mjs', {
      maxTurns: 5,
      runtimeSeed: runtimeSeedWithTaskState('sess_replay_preserved_repair', {
        source: 'replay',
        pendingAction: 'repair',
        proofGap: [`replay preserved verification failure: ${initial.summary}`],
        changedFiles: ['src/session/label.mjs'],
        verifiedFiles: [],
        unverifiedFiles: ['src/session/label.mjs'],
        failureCategories: ['verification failed'],
        originalFailureClassification: initial.summary,
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'node test/sessionLabel.mjs',
          targetFiles: ['src/session/label.mjs', 'test/sessionLabel.mjs'],
          failedFiles: ['test/sessionLabel.mjs'],
          status: 'failed',
          nextAction: 'repair replayed failure',
        },
        artifactPendingState: { claims: [], evidenceIds: [], missingClaims: [] },
        continuationSafety: { status: 'safe', reasons: ['completed-turn replay preserved failure'] },
      }),
    })

    return workspaceRecord('replay-preserved-repair', workspace, actions, initial.summary, result, {
      repairSourceContext: ['src/session/label.mjs'],
      replayPreservedFailure: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runArtifactReceiptRepairTask(): Promise<RepairWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'data/source.json': '{"region":"east","count":4}\n',
    'reports/source-summary.md': 'region=west\ncount=4\n',
    'test/sourceSummary.mjs': 'import { readFileSync } from "node:fs";\nconst source = JSON.parse(readFileSync("data/source.json", "utf8"));\nconst report = readFileSync("reports/source-summary.md", "utf8");\nif (!report.includes(`region=${source.region}`)) throw new Error("artifact source receipt mismatch");\nif (!report.includes(`count=${source.count}`)) throw new Error("artifact count mismatch");\n',
  })
  try {
    const initial = await workspace.runVerification('node test/sourceSummary.mjs')
    const actions: string[] = []
    const agent = repairAgent({
      actions,
      sourceContext: ['data/source.json', 'reports/source-summary.md', 'test/sourceSummary.mjs'],
      changedFiles: ['reports/source-summary.md'],
      requiredEvidence: ['source receipt'],
      finalEvidence: ['source data/source.json'],
      artifactEvidence: 'source data/source.json',
    })
    const result = await engineFor(workspace, agent, {
      repairSteps: [
        { 'reports/source-summary.md': 'region=east\ncount=4\nsource=data/source.json\n' },
      ],
      artifact: {
        'reports/source-summary.md': 'region=east\ncount=4\nsource=data/source.json\n',
      },
      verifyCommand: 'node test/sourceSummary.mjs',
    }).submitMessage('sess_artifact_receipt_repair', 'debug repair report artifact from data/source.json', {
      maxTurns: 6,
      runtimeSeed: runtimeSeedWithTaskState('sess_artifact_receipt_repair', {
        source: 'replay',
        pendingAction: 'repair',
        proofGap: [`artifact verification failed: ${initial.summary}`],
        changedFiles: ['reports/source-summary.md'],
        verifiedFiles: [],
        unverifiedFiles: ['reports/source-summary.md'],
        failureCategories: ['verification failed'],
        originalFailureClassification: initial.summary,
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'node test/sourceSummary.mjs',
          targetFiles: ['reports/source-summary.md', 'data/source.json', 'test/sourceSummary.mjs'],
          failedFiles: ['test/sourceSummary.mjs'],
          status: 'failed',
          nextAction: 'repair artifact from source receipt',
        },
        artifactPendingState: {
          claims: ['source receipt'],
          evidenceIds: [],
          missingClaims: ['source receipt'],
        },
        continuationSafety: { status: 'safe', reasons: ['initial artifact failure preserved'] },
      }, 'debug repair report artifact from data/source.json'),
    })

    return workspaceRecord('artifact-receipt-repair', workspace, actions, initial.summary, result, {
      repairSourceContext: ['data/source.json', 'reports/source-summary.md'],
      artifactOrSourceReceipt: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runGenericGreenBlockedTask(): Promise<RepairWorkspaceTaskRecord> {
  const workspace = await createWorkspace({
    'src/generic/status.mjs': 'export const status = "broken";\n',
    'test/genericStatus.mjs': 'import { status } from "../src/generic/status.mjs";\nif (status !== "fixed") throw new Error(`status ${status}`);\n',
  })
  try {
    const initial = await workspace.runVerification('node test/genericStatus.mjs')
    const actions: string[] = []
    const agent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      actions.push(runtimeAction.nextAction)
      return agentOutput(role, {
        content: `generic command did not prove target turn ${turn}`,
        handoffReason: turn < 2 ? `generic proof still missing ${turn}` : undefined,
        changedFiles: ['src/generic/status.mjs'],
        evidenceFiles: ['src/generic/status.mjs', 'test/genericStatus.mjs'],
        verification: { status: 'not-requested', reason: 'targeted status rerun missing' },
        requiredEvidence: ['targeted generic status rerun'],
        observedEvidence: [],
        lastAction: { actionKind: runtimeAction.nextAction, target: 'src/generic/status.mjs' },
      })
    }
    const result = await engineFor(workspace, agent, {
      verifyCommand: 'node --version',
    }).submitMessage('sess_generic_green_blocked', 'debug repair generic status but do not accept generic green command', {
      maxTurns: 2,
      runtimeSeed: runtimeSeedWithTaskState('sess_generic_green_blocked', {
        source: 'replay',
        pendingAction: 'verify',
        proofGap: [`targeted verification still failed: ${initial.summary}`],
        changedFiles: ['src/generic/status.mjs'],
        verifiedFiles: [],
        unverifiedFiles: ['src/generic/status.mjs'],
        failureCategories: ['verification failed'],
        originalFailureClassification: initial.summary,
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'node test/genericStatus.mjs',
          targetFiles: ['src/generic/status.mjs', 'test/genericStatus.mjs'],
          failedFiles: ['test/genericStatus.mjs'],
          status: 'failed',
          nextAction: 'rerun targeted generic status verification',
        },
        artifactPendingState: { claims: [], evidenceIds: [], missingClaims: [] },
        continuationSafety: { status: 'safe', reasons: ['initial verification failure preserved'] },
      }),
    })

    return workspaceRecord('generic-green-blocked', workspace, actions, initial.summary, result, {
      repairSourceContext: ['src/generic/status.mjs'],
    })
  } finally {
    await workspace.dispose()
  }
}

function repairAgent(input: {
  readonly actions: string[]
  readonly sourceContext: readonly string[]
  readonly changedFiles: readonly string[]
  readonly requiredEvidence: readonly string[]
  readonly firstRepairReason?: string
  readonly finalEvidence: readonly string[]
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
        changedFiles: input.changedFiles,
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
        changedFiles: input.changedFiles,
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
        content: `artifact receipt produced turn ${turn}`,
        changedFiles: input.changedFiles,
        evidenceFiles: [...input.sourceContext],
        repair: { status: 'recovered', attempts: 1, recoveredItems: [...input.changedFiles] },
        verification: { status: 'passed', command: 'node test/sourceSummary.mjs', reason: 'artifact source receipt validated' },
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
        ? `second strategy source discovery ${turn}`
        : input.artifactEvidence
          ? `artifact receipt ${turn}`
          : undefined,
      continued: input.continued,
      changedFiles: input.changedFiles,
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
            ...(input.artifactEvidence ? { nextAction: 'produce artifact source receipt' } : {}),
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
        verifiedFiles: input.changedFiles,
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

function engineFor(
  workspace: DisposableRepairWorkspace,
  runAgent: AgentRunner,
  config: RepairWorkspaceBatchConfig,
) {
  return new QueryEngine({
    runAgent,
    executeRuntimeBatch: workspace.batchExecutor(config),
  } as any)
}

type DisposableRepairWorkspace = Awaited<ReturnType<typeof createWorkspace>>

interface RepairWorkspaceBatchConfig {
  readonly repairSteps?: readonly Record<string, string>[]
  readonly artifact?: Record<string, string>
  readonly verifyCommand: string
}

async function createWorkspace(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'workspace-repair-verification-'))
  const executionService = createDefaultExecutionService()
  for (const [relativePath, content] of Object.entries(files)) {
    await executionService.writeTextFile({
      ...writeRequest(root, relativePath, content),
    })
  }
  const commandOutputClassifications: string[] = []
  const safeFailureSummaries: string[] = []
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
    batchExecutor: (config: RepairWorkspaceBatchConfig) => async ({ batch }: any) => {
      const item = batch.items[0]
      if (!item) {
        return { batchId: batch.batchId, results: [] }
      }
      if (item.actionKind === 'repair' && config.repairSteps?.[repairStep]) {
        await writeAll(executionService, root, config.repairSteps[repairStep])
        repairWriteCount += Object.keys(config.repairSteps[repairStep]).length
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
    caller: 'workspace-repair-verification-test',
    reason: 'Disposable workspace task write.',
    reportSafeTarget: relativePath,
    content,
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
    caller: 'workspace-repair-verification-test',
    operationKind: 'command.run',
    reason: 'Focused disposable workspace verification.',
    policy: {
      authorityRequirement: 'approved-for-write',
      decisionId: 'workspace-repair-verification',
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

function workspaceRecord(
  taskId: string,
  workspace: DisposableRepairWorkspace,
  actions: readonly string[],
  initialFailureOutput: string,
  result: Awaited<ReturnType<QueryEngine['submitMessage']>>,
  flags: Partial<Pick<RepairWorkspaceTaskRecord,
    'repairSourceContext' |
    'firstRepairFailedThenSecondSucceeded' |
    'missingContextDiscovery' |
    'replayPreservedFailure' |
    'artifactOrSourceReceipt'
  >>,
): RepairWorkspaceTaskRecord {
  const changedFiles = result.codingResult?.changedFiles ?? []
  return {
    taskId,
    workspaceRoot: workspace.root,
    actions,
    commandOutputClassifications: [...workspace.commandOutputClassifications],
    safeFailureSummaries: [...workspace.safeFailureSummaries],
    initialFailureOutput,
    repairSourceContext: flags.repairSourceContext ?? [],
    changedFiles,
    actualRepairWrites: workspace.repairWriteCount,
    multiFileRepair: workspace.repairWriteCount >= 2 || changedFiles.length >= 2,
    firstRepairFailedThenSecondSucceeded: flags.firstRepairFailedThenSecondSucceeded ?? false,
    missingContextDiscovery: flags.missingContextDiscovery ?? false,
    replayPreservedFailure: flags.replayPreservedFailure ?? false,
    artifactOrSourceReceipt: flags.artifactOrSourceReceipt ?? false,
    targetedReruns: workspace.targetedReruns,
    proofInput: result.codingResult?.taskSatisfaction.observedEvidence ?? [],
    verdict: result.status,
    missingProof: result.stopReason ?? 'n/a',
    manualCorrection: false,
  }
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
  return role === 'planner' || role === 'reviewer' ? 'coder' : 'reviewer'
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
      evidence: input.continued ? ['replay preserved failing verification'] : [],
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
  initialPrompt = 'continue failing verification task',
): QueryRuntimeStateSeed {
  return {
    config: {
      sessionId,
      initialPrompt,
      maxTurns: 8,
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
