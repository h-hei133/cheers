import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentExecutionOutput, AgentRole, AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { buildTaskProofInput } from '../../../evidence/task/proof.js'
import { projectTaskVerdict } from '../../../result/task/verdict.js'
import { createDefaultExecutionService, type ExecutionService } from '../../../runtime/execution/service.js'
import { QueryEngine } from './engine.js'
import {
  createQueryRuntimeHarnessState,
  restoreHarnessSavePoint,
  type QueryRuntimeHarnessState,
} from './harness.js'
import { buildContinuationPolicyEvidence, type QueryRuntimeStateSeed } from './state.js'

describe('query runtime harness spine', () => {
  it('records a turn snapshot before batch execution and uses settled context for the next action', async () => {
    const snapshots: string[] = []
    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: `finished ${runtimeAction.nextAction}`,
          handoffTo: runtimeAction.nextAction === 'search' ? 'coder' : undefined,
          handoffReason: runtimeAction.nextAction === 'search' ? 'search settled' : undefined,
          evidenceFiles: ['src/orders/rules.ts'],
          requiredEvidence: ['owner context'],
          observedEvidence: runtimeAction.nextAction === 'search' ? [] : ['owner context'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/orders/rules.ts' },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: ['src/orders/rules.ts'],
          affectedPaths: ['src/orders/rules.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    for await (const event of engine.streamMessage('sess_harness_snapshot', 'inspect src/orders/rules.ts owner', { maxTurns: 2 })) {
      if (event.type === 'runtime.turn-snapshot') {
        snapshots.push(`${event.snapshot.turn}:${event.snapshot.runtimeAction}:${event.snapshot.actionBatch.items.length}:${event.snapshot.taskStateVersion}`)
      }
    }

    expect(snapshots[0]).toBe('1:search:1:1')
    expect(actions).toEqual(['search', 'read'])
  })

  it('preserves ordered ledger entries when a batch has a partial failure before success', async () => {
    const ledgers: string[][] = []
    const engine = new QueryEngine({
      runAgent: async ({ role }) => output(role, {
        content: 'verification still needs review',
        changedFiles: ['src/cart/total.ts'],
        failedFiles: [{ path: 'src/cart/total.test.ts', reason: 'first command failed' }],
        verification: { status: 'failed', reason: 'first command failed' },
        requiredEvidence: ['targeted verification'],
        observedEvidence: [],
        lastAction: { actionKind: 'verify', target: 'src/cart/total.test.ts' },
      }),
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: [
          {
            toolId: `${batch.batchId}:first`,
            actionKind: 'verify',
            coveredFiles: ['src/cart/total.test.ts'],
            affectedPaths: ['src/cart/total.test.ts'],
            exitStatusClass: 'failure',
            failureClass: 'command-failed',
            diagnosticSummary: 'expected 42 got 41',
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          },
          {
            toolId: `${batch.batchId}:second`,
            actionKind: 'verify',
            coveredFiles: ['src/cart/total.test.ts'],
            affectedPaths: ['src/cart/total.test.ts'],
            exitStatusClass: 'success',
            failureClass: 'none',
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          },
        ],
      }),
    })

    for await (const event of engine.streamMessage('sess_harness_ledger', 'repair cart then rerun verification', {
      maxTurns: 1,
      runtimeSeed: seedWithHarness('sess_harness_ledger', createQueryRuntimeHarnessState({
        pendingVerification: [{ queueId: 'verify-cart', targetFiles: ['src/cart/total.test.ts'], command: 'npm test cart' }],
      })),
    })) {
      if (event.type === 'runtime.ledger-settled') {
        ledgers.push(event.ledger.map((entry) => `${entry.sequence}:${entry.exitStatusClass}:${entry.failureClass}`))
      }
    }

    expect(ledgers.at(-1)).toEqual(['1:failure:command-failed', '2:success:none'])
  })

  it('keeps changed writes non-terminal until changed files and a verification queue exist', async () => {
    const queues: string[][] = []
    const engine = new QueryEngine({
      runAgent: async ({ role }) => output(role, {
        content: 'write claimed complete without verification',
        changedFiles: ['src/profile/name.ts'],
        verification: { status: 'not-requested', reason: 'verification not planned' },
        requiredEvidence: ['profile write verified'],
        observedEvidence: ['profile write verified'],
        lastAction: { actionKind: 'edit', target: 'src/profile/name.ts', changedFiles: ['src/profile/name.ts'] },
      }),
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: 'edit',
          coveredFiles: [],
          affectedPaths: ['src/profile/name.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    for await (const event of engine.streamMessage('sess_harness_write_block', 'update src/profile/name.ts', { maxTurns: 1 })) {
      if (event.type === 'runtime.queue-settled') {
        queues.push(event.pendingVerification.map((item) => item.targetFiles.join(',')))
      }
    }

    const result = await engine.submitMessage('sess_harness_write_block_result', 'update src/profile/name.ts', { maxTurns: 1 })
    expect(result.status).toBe('stopped_not_proven')
    expect(queues.at(-1)).toContain('src/profile/name.ts')
  })

  it('restores pending verification through continuation and drives a targeted rerun', async () => {
    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: 'targeted rerun passed',
          changedFiles: ['src/tax/rate.ts'],
          verifiedFiles: ['src/tax/rate.ts'],
          verification: { status: 'passed', command: 'npm test tax', reason: 'targeted tax rerun passed' },
          requiredEvidence: ['targeted tax rerun'],
          observedEvidence: ['targeted tax rerun'],
          lastAction: {
            actionKind: 'verify',
            target: 'src/tax/rate.ts',
            verifiedFiles: ['src/tax/rate.ts'],
            verification: { status: 'passed', reason: 'targeted tax rerun passed' },
          },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: 'verify',
          coveredFiles: ['src/tax/rate.ts'],
          affectedPaths: ['src/tax/rate.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    const result = await engine.submitMessage('sess_harness_verify_restore', 'continue pending tax verification', {
      maxTurns: 2,
      runtimeSeed: seedWithHarness('sess_harness_verify_restore', createQueryRuntimeHarnessState({
        pendingVerification: [{ queueId: 'verify-tax', targetFiles: ['src/tax/rate.ts'], command: 'npm test tax' }],
      })),
    })

    expect(actions[0]).toBe('verify')
    expect(result.status).toBe('completed')
  })

  it('restores pending repair with missing context and changes strategy before repeating repair', async () => {
    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: 'read missing pricing context',
          evidenceFiles: ['src/pricing/rules.ts'],
          requiredEvidence: ['pricing context'],
          observedEvidence: ['pricing context'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/pricing/rules.ts' },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: ['src/pricing/rules.ts'],
          affectedPaths: ['src/pricing/rules.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    await engine.submitMessage('sess_harness_repair_context', 'continue pricing repair with missing context', {
      maxTurns: 1,
      runtimeSeed: seedWithHarness('sess_harness_repair_context', createQueryRuntimeHarnessState({
        pendingRepair: [{
          queueId: 'repair-pricing',
          failureClass: 'missing-context',
          failureSummary: 'repair failed because pricing owner was not read',
          hypothesis: 'inspect pricing rule owner before another repair',
          priorAttempt: 'src/pricing/rules.ts:blind-edit',
          contextNeed: 'src/pricing/rules.ts',
          targetFiles: ['src/pricing/rules.ts'],
        }],
      })),
    })

    expect(actions[0]).toBe('read')
  })

  it('restores a save point after interruption and resumes from the pending verification queue', async () => {
    const harness = createQueryRuntimeHarnessState({
      pendingVerification: [{ queueId: 'verify-ledger', targetFiles: ['src/ledger/balance.ts'], command: 'npm test ledger' }],
    })
    const savePoint = harness.savePoints[0]
    expect(savePoint?.phase).toBe('restore')

    const restored = restoreHarnessSavePoint(harness, savePoint?.savePointId ?? '')
    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: 'ledger verification passed after restore',
          changedFiles: ['src/ledger/balance.ts'],
          verifiedFiles: ['src/ledger/balance.ts'],
          verification: { status: 'passed', command: 'npm test ledger', reason: 'ledger rerun passed' },
          requiredEvidence: ['ledger rerun'],
          observedEvidence: ['ledger rerun'],
          lastAction: { actionKind: 'verify', target: 'src/ledger/balance.ts', verifiedFiles: ['src/ledger/balance.ts'] },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: 'verify',
          coveredFiles: ['src/ledger/balance.ts'],
          affectedPaths: ['src/ledger/balance.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    await engine.submitMessage('sess_harness_restore', 'continue ledger verification', {
      maxTurns: 2,
      runtimeSeed: seedWithHarness('sess_harness_restore', restored),
    })

    expect(actions[0]).toBe('verify')
  })

  it('does not complete a continuation restored only from harness ledger success', async () => {
    const engine = new QueryEngine({
      runAgent: async ({ role }) => output(role, {
        content: 'ledger-only success is not task proof',
        requiredEvidence: ['task-specific proof'],
        observedEvidence: [],
      }),
    })

    const result = await engine.submitMessage('sess_harness_ledger_only', 'continue restored ledger only', {
      maxTurns: 1,
      runtimeSeed: seedWithHarness('sess_harness_ledger_only', createQueryRuntimeHarnessState({
        ledger: [{
          sequence: 1,
          turn: 1,
          role: 'coder',
          actionKind: 'verify',
          toolId: 'verify-ledger-only',
          targetFiles: ['src/ledger-only.ts'],
          affectedPaths: ['src/ledger-only.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
        }],
      })),
    })

    expect(result.status).toBe('stopped_not_proven')
  })

  it('result verdict consumer treats harness ledger as not sufficient for task completion', () => {
    const proof = buildTaskProofInput({
      caseId: 'harness-ledger-only',
      taskKind: 'coding',
      outputKind: 'diff',
      contextState: 'ready',
      contextRefreshed: false,
      selectedPathCount: 1,
      planState: 'ready',
      requestState: 'ready',
      toolStrategyState: 'ready',
      verificationState: 'not-run',
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      changedFileVerificationComplete: false,
      repairAttempted: false,
      repairPostValidation: 'not-run',
      originalFailurePreserved: false,
      hostStatus: 'ledger-only',
    })

    const verdict = projectTaskVerdict({ proof, notProvenClaims: ['harness-ledger-alone-is-not-success'] })

    expect(verdict.completeProof).toBe(false)
    expect(verdict.terminalClassification).toBe('stopped')
    expect(verdict.notProvenClaims).toContain('harness-ledger-alone-is-not-success')
  })

  it('executes disposable workspace harness tasks with queues, restore, repair, and false-complete blocking', async () => {
    const results = await Promise.all([
      runTaxRateHarnessTask(),
      runStatusLabelRepairHarnessTask(),
      runRestoreVerificationHarnessTask(),
      runFalseCompleteHarnessTask(),
    ])
    expect(results.map((result) => `${result.taskId}:${result.verdict}`)).toEqual([
      'tax-rate-harness-queue:completed',
      'status-label-harness-repair:completed',
      'restore-verification-harness:completed',
      'false-complete-harness-block:stopped_not_proven',
    ])
    expect(results.filter((result) => result.executed).length).toBeGreaterThanOrEqual(3)
    expect(results.filter((result) => result.multiFileWrite).length).toBeGreaterThanOrEqual(2)
    expect(results.filter((result) => result.initialFailureOutput.length > 0).length).toBeGreaterThanOrEqual(2)
    expect(results.some((result) => result.restoreOrContinuation)).toBe(true)
    expect(results.some((result) => result.repairQueueAndTargetedRerun)).toBe(true)
    expect(results.some((result) => result.falseCompleteBlocked)).toBe(true)
    expect(results.every((result) => result.manualCorrection === false)).toBe(true)
    for (const result of results) {
      expect(result.safeSummaries.every((summary) => !summary.includes(result.workspaceRoot))).toBe(true)
    }
  })
})

interface HarnessWorkspaceTaskRecord {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly verdict: string
  readonly executed: boolean
  readonly multiFileWrite: boolean
  readonly initialFailureOutput: string
  readonly restoreOrContinuation: boolean
  readonly repairQueueAndTargetedRerun: boolean
  readonly falseCompleteBlocked: boolean
  readonly safeSummaries: readonly string[]
  readonly manualCorrection: false
}

async function runTaxRateHarnessTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'src/tax/rate.mjs': 'export const rate = 0.07;\n',
    'src/tax/format.mjs': 'import { rate } from "./rate.mjs";\nexport function taxLabel() { return `tax:${rate}`; }\n',
    'test/tax.mjs': 'import { taxLabel } from "../src/tax/format.mjs";\nif (taxLabel() !== "tax:0.08") throw new Error(`expected tax:0.08 got ${taxLabel()}`);\n',
  })
  try {
    const initial = await workspace.run('node', ['test/tax.mjs'], 'node test/tax.mjs')
    const actions: string[] = []
    const result = await workspaceEngine(workspace, async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'edit') {
        return output(role, {
          content: 'tax files written',
          handoffTo: 'reviewer',
          handoffReason: 'verify tax write',
          changedFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs'],
          verification: { status: 'not-requested', reason: 'tax verification queued' },
          requiredEvidence: ['targeted tax verification'],
          observedEvidence: [],
          lastAction: { actionKind: 'edit', target: 'src/tax/rate.mjs', changedFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs'] },
        })
      }
      if (runtimeAction.nextAction === 'repair') {
        return output(role, {
          content: 'tax repair settled changed files',
          handoffTo: 'coder',
          handoffReason: 'rerun tax verification',
          changedFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs'],
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/tax/rate.mjs'], notes: ['tax rate repair settled'] },
          verification: { status: 'not-requested', reason: 'tax rerun queued' },
          requiredEvidence: ['targeted tax verification'],
          observedEvidence: [],
          lastAction: { actionKind: 'repair', target: 'src/tax/rate.mjs', changedFiles: ['src/tax/rate.mjs'] },
        })
      }
      return output(role, {
        content: 'tax verification passed',
        changedFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs'],
        verifiedFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs', 'test/tax.mjs'],
        evidenceFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs', 'test/tax.mjs'],
        verification: { status: 'passed', command: 'node test/tax.mjs', reason: 'targeted tax verification passed' },
        requiredEvidence: ['targeted tax verification'],
        observedEvidence: ['targeted tax verification'],
        lastAction: { actionKind: 'verify', target: 'test/tax.mjs', verifiedFiles: ['src/tax/rate.mjs', 'src/tax/format.mjs'] },
      })
    }, {
      editWrites: {
        'src/tax/rate.mjs': 'export const rate = 0.08;\n',
        'src/tax/format.mjs': 'import { rate } from "./rate.mjs";\nexport function taxLabel() { return `tax:${rate}`; }\n',
      },
      repairWrites: {
        'src/tax/rate.mjs': 'export const rate = 0.08;\n',
      },
      verifyCommand: ['node', ['test/tax.mjs']],
    }).submitMessage('sess_tax_rate_harness', 'update tax rate files', {
      maxTurns: 4,
      runtimeSeed: seedWithHarness('sess_tax_rate_harness', createQueryRuntimeHarnessState(), {
        initialPrompt: 'update src/tax/rate.mjs and src/tax/format.mjs',
        observations: {
          contextPaths: ['src/tax/rate.mjs', 'src/tax/format.mjs'],
          completedActions: ['read'],
        },
      }),
    })

    return workspaceRecord('tax-rate-harness-queue', workspace.root, result.status, {
      initialFailureOutput: safeCommandSummary(initial),
      multiFileWrite: true,
      repairQueueAndTargetedRerun: actions.includes('repair') && actions.includes('verify'),
      safeSummaries: [safeCommandSummary(initial), result.stopReason ?? '', `actions:${actions.join(',')}`],
    })
  } finally {
    await workspace.dispose()
  }
}

async function runStatusLabelRepairHarnessTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'src/status/label.mjs': 'export function statusLabel(value) { return value; }\n',
    'src/status/index.mjs': 'export { statusLabel } from "./label.mjs";\n',
    'test/status.mjs': 'import { statusLabel } from "../src/status/index.mjs";\nif (statusLabel("paid") !== "PAID") throw new Error(`expected PAID got ${statusLabel("paid")}`);\n',
  })
  try {
    const initial = await workspace.run('node', ['test/status.mjs'], 'node test/status.mjs')
    let repaired = false
    const actions: string[] = []
    const result = await workspaceEngine(workspace, async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'edit') {
        return output(role, {
          content: 'status edit requires repair',
          handoffTo: 'reviewer',
          handoffReason: 'repair status label failure',
          changedFiles: ['src/status/label.mjs', 'src/status/index.mjs'],
          failedFiles: [{ path: 'test/status.mjs', reason: safeCommandSummary(initial) }],
          verification: { status: 'failed', reason: 'status label command failed', nextAction: 'repair status label then rerun' },
          requiredEvidence: ['status label targeted rerun'],
          observedEvidence: [],
          lastAction: { actionKind: 'edit', target: 'src/status/label.mjs', changedFiles: ['src/status/label.mjs', 'src/status/index.mjs'] },
        })
      }
      if (runtimeAction.nextAction === 'repair') {
        repaired = true
        return output(role, {
          content: 'status repair written',
          handoffTo: 'coder',
          handoffReason: 'rerun status verification',
          changedFiles: ['src/status/label.mjs', 'src/status/index.mjs'],
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/status/label.mjs'], notes: ['status label repair applied'] },
          verification: { status: 'not-requested', reason: 'status rerun queued' },
          requiredEvidence: ['status label targeted rerun'],
          observedEvidence: [],
          lastAction: { actionKind: 'repair', target: 'src/status/label.mjs', changedFiles: ['src/status/label.mjs'] },
        })
      }
      return output(role, {
        content: 'status targeted rerun passed',
        changedFiles: ['src/status/label.mjs', 'src/status/index.mjs'],
        verifiedFiles: ['src/status/label.mjs', 'src/status/index.mjs', 'test/status.mjs'],
        evidenceFiles: ['src/status/label.mjs', 'src/status/index.mjs', 'test/status.mjs'],
        repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/status/label.mjs'], notes: ['status label repair applied'] },
        verification: { status: 'passed', command: 'node test/status.mjs', reason: 'status targeted rerun passed' },
        requiredEvidence: ['status label targeted rerun'],
        observedEvidence: ['status label targeted rerun'],
        lastAction: { actionKind: 'verify', target: 'test/status.mjs', verifiedFiles: ['src/status/label.mjs', 'src/status/index.mjs'] },
      })
    }, {
      editWrites: {
        'src/status/label.mjs': 'export function statusLabel(value) { return value.toLowerCase(); }\n',
        'src/status/index.mjs': 'export { statusLabel } from "./label.mjs";\n',
      },
      repairWrites: {
        'src/status/label.mjs': 'export function statusLabel(value) { return value.toUpperCase(); }\n',
      },
      verifyCommand: ['node', ['test/status.mjs']],
    }).submitMessage('sess_status_label_harness', 'fix status label failure', {
      maxTurns: 6,
      runtimeSeed: seedWithHarness('sess_status_label_harness', createQueryRuntimeHarnessState(), {
        initialPrompt: 'fix src/status/label.mjs after failing test/status.mjs',
        observations: {
          contextPaths: ['src/status/label.mjs', 'src/status/index.mjs', 'test/status.mjs'],
          completedActions: ['read'],
          failedVerificationTargets: ['test/status.mjs'],
          failureCategories: ['verification failed'],
        },
      }),
    })

    return workspaceRecord('status-label-harness-repair', workspace.root, result.status, {
      initialFailureOutput: safeCommandSummary(initial),
      multiFileWrite: true,
      repairQueueAndTargetedRerun: repaired,
      safeSummaries: [safeCommandSummary(initial), result.stopReason ?? '', `actions:${actions.join(',')}`],
    })
  } finally {
    await workspace.dispose()
  }
}

async function runRestoreVerificationHarnessTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'src/ship/window.mjs': 'export const windowLabel = "overnight";\n',
    'test/ship.mjs': 'import { windowLabel } from "../src/ship/window.mjs";\nif (windowLabel !== "overnight") throw new Error("bad ship window");\n',
  })
  try {
    const result = await workspaceEngine(workspace, async ({ role }) => output(role, {
      content: 'restored verification passed',
      changedFiles: ['src/ship/window.mjs'],
      verifiedFiles: ['src/ship/window.mjs'],
      evidenceFiles: ['src/ship/window.mjs', 'test/ship.mjs'],
      verification: { status: 'passed', command: 'node test/ship.mjs', reason: 'restored ship verification passed' },
      requiredEvidence: ['restored ship verification'],
      observedEvidence: ['restored ship verification'],
      lastAction: { actionKind: 'verify', target: 'test/ship.mjs', verifiedFiles: ['src/ship/window.mjs'] },
    }), {
      verifyCommand: ['node', ['test/ship.mjs']],
    }).submitMessage('sess_restore_verification_harness', 'continue restored shipping verification', {
      maxTurns: 2,
      runtimeSeed: seedWithHarness('sess_restore_verification_harness', createQueryRuntimeHarnessState({
        pendingVerification: [{ queueId: 'verify-ship', targetFiles: ['src/ship/window.mjs'], command: 'node test/ship.mjs' }],
      })),
    })

    return workspaceRecord('restore-verification-harness', workspace.root, result.status, {
      restoreOrContinuation: true,
    })
  } finally {
    await workspace.dispose()
  }
}

async function runFalseCompleteHarnessTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'src/false/done.mjs': 'export const done = false;\n',
    'test/done.mjs': 'import { done } from "../src/false/done.mjs";\nif (!done) throw new Error("done flag false");\n',
  })
  try {
    const result = await workspaceEngine(workspace, async ({ role }) => output(role, {
      content: 'write says done without rerun',
      changedFiles: ['src/false/done.mjs'],
      verification: { status: 'not-requested', reason: 'not rerun' },
      requiredEvidence: ['done flag verification'],
      observedEvidence: ['done flag verification'],
      lastAction: { actionKind: 'edit', target: 'src/false/done.mjs', changedFiles: ['src/false/done.mjs'] },
    }), {
      editWrites: {
        'src/false/done.mjs': 'export const done = true;\n',
      },
      verifyCommand: ['node', ['test/done.mjs']],
    }).submitMessage('sess_false_complete_harness', 'set done flag', {
      maxTurns: 1,
      runtimeSeed: seedWithHarness('sess_false_complete_harness', createQueryRuntimeHarnessState(), {
        initialPrompt: 'set src/false/done.mjs done flag',
        observations: {
          contextPaths: ['src/false/done.mjs'],
          completedActions: ['read'],
        },
      }),
    })

    return workspaceRecord('false-complete-harness-block', workspace.root, result.status, {
      falseCompleteBlocked: result.status === 'stopped_not_proven',
    })
  } finally {
    await workspace.dispose()
  }
}

function seedWithHarness(sessionId: string, harness: QueryRuntimeHarnessState, options: {
  readonly initialPrompt?: string
  readonly observations?: Partial<QueryRuntimeStateSeed['observations']>
} = {}): QueryRuntimeStateSeed {
  return {
    config: {
      sessionId,
      initialPrompt: options.initialPrompt ?? 'resume pending harness state',
      maxTurns: 3,
      startingRole: 'coder',
    },
    currentRole: 'coder',
    turn: 1,
    pendingLifecycle: createEmptyLifecycleIndex(),
    recoveryBoundary: 'completed-turn-reentry',
    truthBoundary: {
      source: 'durable-replay',
      normalizedEventCount: 1,
      pairedTurnCount: 1,
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
      continuationSafety: 'completed-turn-only',
    },
    derivedState: { transcript: [] },
    observations: options.observations as QueryRuntimeStateSeed['observations'],
    harness,
  }
}

function output(role: AgentRole, input: {
  readonly content: string
  readonly handoffTo?: AgentRole
  readonly handoffReason?: string
  readonly changedFiles?: readonly string[]
  readonly verifiedFiles?: readonly string[]
  readonly failedFiles?: readonly { readonly path: string; readonly reason: string }[]
  readonly evidenceFiles?: readonly string[]
  readonly verification?: Partial<CodingResultSummary['verification']>
  readonly repair?: Partial<CodingResultSummary['repair']>
  readonly requiredEvidence?: readonly string[]
  readonly observedEvidence?: readonly string[]
  readonly lastAction?: CodingResultSummary['lastActionResultSeed']
}): AgentExecutionOutput {
  return {
    role,
    content: input.content,
    handoffTo: input.handoffTo,
    handoffReason: input.handoffReason,
    codingResult: codingResult(input),
  }
}

function codingResult(input: {
  readonly changedFiles?: readonly string[]
  readonly verifiedFiles?: readonly string[]
  readonly failedFiles?: readonly { readonly path: string; readonly reason: string }[]
  readonly evidenceFiles?: readonly string[]
  readonly verification?: Partial<CodingResultSummary['verification']>
  readonly repair?: Partial<CodingResultSummary['repair']>
  readonly requiredEvidence?: readonly string[]
  readonly observedEvidence?: readonly string[]
  readonly lastAction?: CodingResultSummary['lastActionResultSeed']
}): CodingResultSummary {
  const changedFiles = [...(input.changedFiles ?? [])]
  const verifiedFiles = [...(input.verifiedFiles ?? [])]
  const failedFiles = [...(input.failedFiles ?? [])]
  const requiredEvidence = [...(input.requiredEvidence ?? ['task proof'])]
  const observedEvidence = [...(input.observedEvidence ?? [])]
  return {
    taskId: 'harness-spine-diagnostic',
    taskKind: 'edit-file',
    targetDescription: 'harness spine diagnostic',
    changedFiles,
    verifiedFiles,
    unverifiedFiles: changedFiles
      .filter((path) => !verifiedFiles.includes(path))
      .map((path) => ({ path, reason: input.verification?.reason ?? 'verification pending' })),
    failedFiles,
    evidence: [...observedEvidence, ...(input.evidenceFiles ?? [])],
    diagnosis: {
      disposition: 'needs-verification',
      reason: 'diagnostic',
      searchPattern: 'harness',
      candidateFiles: [...(input.evidenceFiles ?? [])],
      evidenceFiles: [...(input.evidenceFiles ?? [])],
      evidenceNodes: [],
      evidenceLinks: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: changedFiles,
      attemptedFiles: changedFiles,
      changedFiles,
      unchangedAttemptedFiles: [],
    },
    patch: {
      proposed: changedFiles.length > 0,
      applied: changedFiles.length > 0,
      requiresApproval: false,
      approval: { required: false, granted: true, source: 'not-required' },
      records: [],
    },
    verification: {
      status: input.verification?.status ?? 'not-requested',
      command: input.verification?.command,
      reason: input.verification?.reason,
      selectionScope: input.verification?.selectionScope,
      selectionSource: input.verification?.selectionSource,
      blockerKind: input.verification?.blockerKind,
      nextAction: input.verification?.nextAction,
    },
    repair: {
      status: input.repair?.status ?? 'not-needed',
      attempts: input.repair?.attempts ?? 0,
      recoveredItems: input.repair?.recoveredItems ?? [],
      failedItems: input.repair?.failedItems ?? [],
      notes: input.repair?.notes ?? [],
    },
    continuation: {
      status: 'first-pass-success',
      attempts: 0,
      evidence: [],
    },
    taskSatisfaction: {
      verdict: observedEvidence.length >= requiredEvidence.length ? 'satisfied' : 'insufficient-evidence',
      reasons: observedEvidence.length >= requiredEvidence.length ? ['evidence observed'] : ['missing evidence'],
      requiredEvidence,
      observedEvidence,
    },
    writeEffect: changedFiles.length > 0
      ? (verifiedFiles.length >= changedFiles.length ? 'verified' : 'unverified')
      : 'none',
    lastActionResultSeed: input.lastAction,
  }
}

interface HarnessWorkspace {
  readonly root: string
  readonly execution: ExecutionService
  readonly run: (command: string, args: readonly string[], reportSafeCommand: string) => Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }>
  readonly write: (files: Record<string, string>) => Promise<void>
  readonly dispose: () => Promise<void>
}

async function createHarnessWorkspace(files: Record<string, string>): Promise<HarnessWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'harness-spine-'))
  const execution = createDefaultExecutionService()
  const workspace: HarnessWorkspace = {
    root,
    execution,
    run(command, args, reportSafeCommand) {
      return execution.runCommand({
        operationKind: 'command.run',
        command,
        args,
        cwd: root,
        workspaceRoot: root,
        authority: {
          mode: 'command-allowlisted',
          source: 'workspace-authority',
          reason: 'disposable harness diagnostic command',
        },
        caller: 'query-runtime-harness-test',
        reason: 'targeted disposable workspace verification',
        reportSafeCommand,
        timeoutMs: 5000,
      })
    },
    async write(nextFiles) {
      for (const [relativePath, content] of Object.entries(nextFiles)) {
        await execution.writeTextFile({
          operationKind: 'file.write',
          workspaceRoot: root,
          absolutePath: join(root, relativePath),
          content,
          authority: {
            mode: 'approved-for-write',
            source: 'workspace-authority',
            reason: 'disposable harness diagnostic write',
          },
          caller: 'query-runtime-harness-test',
          reason: 'write disposable workspace fixture',
          reportSafeTarget: relativePath,
        })
      }
    },
    dispose() {
      return rm(root, { recursive: true, force: true })
    },
  }
  await workspace.write(files)
  return workspace
}

function workspaceEngine(
  workspace: HarnessWorkspace,
  runAgent: AgentRunner,
  config: {
    readonly editWrites?: Record<string, string>
    readonly repairWrites?: Record<string, string>
    readonly verifyCommand?: readonly [string, readonly string[]]
  },
): QueryEngine {
  return new QueryEngine({
    runAgent,
    executeRuntimeBatch: async ({ batch }) => {
      const result = batch.items[0]
      if (!result) {
        return { batchId: batch.batchId, terminalSuccessClaim: false, results: [] }
      }
      if (result.actionKind === 'edit' && config.editWrites) {
        await workspace.write(config.editWrites)
        return {
          batchId: batch.batchId,
          terminalSuccessClaim: false,
          results: [{
            toolId: result.toolId,
            actionKind: 'edit',
            coveredFiles: [],
            affectedPaths: Object.keys(config.editWrites),
            exitStatusClass: 'success',
            failureClass: 'none',
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          }],
        }
      }
      if (result.actionKind === 'repair' && config.repairWrites) {
        await workspace.write(config.repairWrites)
        return {
          batchId: batch.batchId,
          terminalSuccessClaim: false,
          results: [{
            toolId: result.toolId,
            actionKind: 'repair',
            coveredFiles: [],
            affectedPaths: Object.keys(config.repairWrites),
            exitStatusClass: 'success',
            failureClass: 'none',
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          }],
        }
      }
      if (result.actionKind === 'verify' && config.verifyCommand) {
        const [command, args] = config.verifyCommand
        const commandResult = await workspace.run(command, args, [command, ...args].join(' '))
        const affectedPaths = result.coveredFiles.length > 0 ? result.coveredFiles : result.targetPaths
        return {
          batchId: batch.batchId,
          terminalSuccessClaim: false,
          results: [{
            toolId: result.toolId,
            actionKind: 'verify',
            coveredFiles: affectedPaths,
            affectedPaths,
            exitStatusClass: commandResult.exitCode === 0 ? 'success' : 'failure',
            failureClass: commandResult.exitCode === 0 ? 'none' : 'command-failed',
            diagnosticSummary: commandResult.exitCode === 0 ? 'command passed' : safeCommandSummary(commandResult),
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          }],
        }
      }
      return {
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: [{
          toolId: result.toolId,
          actionKind: result.actionKind,
          coveredFiles: result.coveredFiles,
          affectedPaths: result.targetPaths,
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        }],
      }
    },
  })
}

function workspaceRecord(
  taskId: string,
  workspaceRoot: string,
  verdict: string,
  input: Partial<Omit<HarnessWorkspaceTaskRecord, 'taskId' | 'workspaceRoot' | 'verdict' | 'manualCorrection'>>,
): HarnessWorkspaceTaskRecord {
  return {
    taskId,
    workspaceRoot,
    verdict,
    executed: input.executed ?? true,
    multiFileWrite: input.multiFileWrite ?? false,
    initialFailureOutput: input.initialFailureOutput ?? '',
    restoreOrContinuation: input.restoreOrContinuation ?? false,
    repairQueueAndTargetedRerun: input.repairQueueAndTargetedRerun ?? false,
    falseCompleteBlocked: input.falseCompleteBlocked ?? false,
    safeSummaries: input.safeSummaries ?? [],
    manualCorrection: false,
  }
}

function safeCommandSummary(result: { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }): string {
  return `exit:${result.exitCode ?? 'null'}:${[result.stderr, result.stdout]
    .join(' ')
    .replace(/\s+/g, ' ')
    .replaceAll(process.cwd(), '<workspace>')
    .replace(/\/tmp\/harness-spine-[^/\s]+/g, '<workspace>')
    .slice(0, 160)}`
}
