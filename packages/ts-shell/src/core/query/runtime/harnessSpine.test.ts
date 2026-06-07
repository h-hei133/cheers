import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentExecutionOutput, AgentRole, AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { buildTaskProofInput } from '../../../evidence/task/proof.js'
import { projectTaskVerdict } from '../../../result/task/verdict.js'
import { createDefaultExecutionService, type ExecutionService } from '../../../runtime/execution/service.js'
import { buildCompactContinuitySummary } from '../../../session/continuation/compactSummary.js'
import {
  decodeCompactSessionHarnessState,
  decodeSessionHarnessState,
  encodeSessionHarnessState,
} from '../../../session/harness/state.js'
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

    const runtimeSeed = seedWithHarness('sess_harness_write_block', createQueryRuntimeHarnessState(), {
      initialPrompt: 'update src/profile/name.ts after profile owner context was read',
      observations: {
        contextPaths: ['src/profile/name.ts'],
        completedActions: ['read'],
      },
    })

    for await (const event of engine.streamMessage('sess_harness_write_block', 'update src/profile/name.ts', {
      maxTurns: 1,
      runtimeSeed,
    })) {
      if (event.type === 'runtime.queue-settled') {
        queues.push(event.pendingVerification.map((item) => item.targetFiles.join(',')))
      }
    }

    const result = await engine.submitMessage('sess_harness_write_block_result', 'update src/profile/name.ts', {
      maxTurns: 1,
      runtimeSeed: {
        ...runtimeSeed,
        config: {
          ...runtimeSeed.config,
          sessionId: 'sess_harness_write_block_result',
        },
      },
    })
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

  it('blocks provider edit output while restored repair requires discovery', async () => {
    const workspace = await createHarnessWorkspace({
      'src/pricing/rules.mjs': 'export const discount = 0.05;\n',
      'test/pricing.mjs': 'import { discount } from "../src/pricing/rules.mjs";\nif (discount !== 0.1) throw new Error(`expected discount 0.1 got ${discount}`);\n',
    })
    try {
      const initial = await workspace.run('node', ['test/pricing.mjs'], 'node test/pricing.mjs')
      const actions: string[] = []
      const batchActions: string[] = []
      const completedContents: string[] = []
      const queueSettlements: string[][] = []
      const engine = new QueryEngine({
        runAgent: async ({ role, runtimeAction }) => {
          actions.push(runtimeAction.nextAction)
          return output(role, {
            content: 'incorrectly edited pricing rule without reading required owner context',
            changedFiles: ['src/pricing/rules.mjs'],
            verifiedFiles: ['src/pricing/rules.mjs'],
            verification: {
              status: 'passed',
              command: 'node test/pricing.mjs',
              reason: 'generic green after wrong edit',
              selectionScope: 'broader',
            },
            requiredEvidence: ['pricing owner context', 'targeted pricing verification'],
            observedEvidence: ['pricing owner context', 'targeted pricing verification'],
            lastAction: {
              actionKind: 'edit',
              target: 'src/pricing/rules.mjs',
              changedFiles: ['src/pricing/rules.mjs'],
              verifiedFiles: ['src/pricing/rules.mjs'],
            },
          })
        },
        executeRuntimeBatch: async ({ batch }) => {
          batchActions.push(batch.actionKind)
          return {
            batchId: batch.batchId,
            terminalSuccessClaim: false,
            results: batch.items.map((item) => ({
              toolId: item.toolId,
              actionKind: item.actionKind,
              coveredFiles: ['src/pricing/rules.mjs'],
              affectedPaths: ['src/pricing/rules.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              diagnosticSummary: safeCommandSummary(initial),
              truncated: false,
              redactionStatus: 'redacted',
              terminalSuccessClaim: false,
            })),
          }
        },
      })

      for await (const event of engine.streamMessage('sess_harness_wrong_edit_context', 'continue pricing repair with missing context', {
        maxTurns: 1,
        runtimeSeed: seedWithHarness('sess_harness_wrong_edit_context', createQueryRuntimeHarnessState({
          pendingRepair: [{
            queueId: 'repair-pricing',
            failureClass: 'missing-context',
            failureSummary: 'repair failed because pricing owner was not read',
            hypothesis: 'inspect pricing rule owner before another repair',
            priorAttempt: 'src/pricing/rules.mjs:blind-edit',
            contextNeed: 'src/pricing/rules.mjs',
            targetFiles: ['src/pricing/rules.mjs'],
          }],
        })),
      })) {
        if (event.type === 'runtime.queue-settled') {
          queueSettlements.push(event.pendingVerification.map((item) => item.targetFiles.join(',')))
        }
        if (event.type === 'turn.completed') {
          completedContents.push(event.output.content)
        }
        if (event.type === 'query.completed') {
          expect(event.result.status).toBe('stopped_not_proven')
        }
      }

      expect(initial.exitCode).not.toBe(0)
      expect(actions.every((action) => action === 'read')).toBe(true)
      expect(batchActions.every((action) => action === 'read')).toBe(true)
      expect(batchActions).not.toContain('edit')
      expect(completedContents.at(-1)).toContain('runtime action blocked: discovery required before edit')
      expect(queueSettlements.at(-1) ?? []).not.toContain('src/pricing/rules.mjs')
    } finally {
      await workspace.dispose()
    }
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

  it('restores durable session harness queues and drives normal targeted verification', async () => {
    const encoded = encodeSessionHarnessState(createQueryRuntimeHarnessState({
      pendingVerification: [{ queueId: 'verify-session-durable', targetFiles: ['src/session/durable.ts'], command: 'npm test durable' }],
    }))
    const decoded = decodeSessionHarnessState(encoded)
    expect(decoded.status).toBe('accepted')
    if (decoded.status !== 'accepted') return
    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: 'durable session verification passed',
          changedFiles: ['src/session/durable.ts'],
          verifiedFiles: ['src/session/durable.ts'],
          verification: { status: 'passed', command: 'npm test durable', reason: 'durable targeted rerun passed' },
          requiredEvidence: ['durable targeted rerun'],
          observedEvidence: ['durable targeted rerun'],
          lastAction: { actionKind: 'verify', target: 'src/session/durable.ts', verifiedFiles: ['src/session/durable.ts'] },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: ['src/session/durable.ts'],
          affectedPaths: ['src/session/durable.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    const result = await engine.submitMessage('sess_durable_harness_restore', 'continue durable verification', {
      maxTurns: 2,
      runtimeSeed: seedWithHarness('sess_durable_harness_restore', decoded.harness),
    })

    expect(actions[0]).toBe('verify')
    expect(result.status).toBe('completed')
  })

  it('restores compact harness queues and rejects stale compact state', async () => {
    const compact = buildCompactContinuitySummary({
      summary: undefined,
      continuity: undefined,
      approvalAuditHistory: [],
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [{ queueId: 'verify-compact-durable', targetFiles: ['src/compact/durable.ts'], command: 'npm test compact' }],
      }),
    })
    const decoded = decodeCompactSessionHarnessState({ continuity: compact.continuity })
    expect(decoded.status).toBe('accepted')
    if (decoded.status !== 'accepted') return

    const stale = decodeCompactSessionHarnessState({
      continuity: {
        harnessState: {
          ...encodeSessionHarnessState(decoded.harness),
          ledger: [{
            sequence: 3,
            turn: 1,
            role: 'coder',
            actionKind: 'verify',
            toolId: 'verify-stale',
            targetFiles: ['src/compact/durable.ts'],
            affectedPaths: ['src/compact/durable.ts'],
            exitStatusClass: 'success',
            failureClass: 'command-failed',
            truncated: false,
            redactionStatus: 'raw',
          }],
        },
      },
    })
    expect(stale.status).toBe('rejected')

    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: 'compact verification passed',
          changedFiles: ['src/compact/durable.ts'],
          verifiedFiles: ['src/compact/durable.ts'],
          verification: { status: 'passed', command: 'npm test compact', reason: 'compact targeted rerun passed' },
          requiredEvidence: ['compact targeted rerun'],
          observedEvidence: ['compact targeted rerun'],
          lastAction: { actionKind: 'verify', target: 'src/compact/durable.ts', verifiedFiles: ['src/compact/durable.ts'] },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: ['src/compact/durable.ts'],
          affectedPaths: ['src/compact/durable.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    await engine.submitMessage('sess_compact_harness_restore', 'continue compact verification', {
      maxTurns: 2,
      runtimeSeed: seedWithHarness('sess_compact_harness_restore', decoded.harness),
    })

    expect(actions[0]).toBe('verify')
  })

  it('redirects a wrong edit to discovery when restored repair needs context', async () => {
    const actions: string[] = []
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: 'read restored missing owner context',
          evidenceFiles: ['src/catalog/rules.ts'],
          requiredEvidence: ['catalog owner context'],
          observedEvidence: ['catalog owner context'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/catalog/rules.ts' },
        })
      },
      executeRuntimeBatch: async ({ batch }) => ({
        batchId: batch.batchId,
        terminalSuccessClaim: false,
        results: batch.items.map((item) => ({
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: ['src/catalog/rules.ts'],
          affectedPaths: ['src/catalog/rules.ts'],
          exitStatusClass: 'success',
          failureClass: 'none',
          truncated: false,
          redactionStatus: 'redacted',
          terminalSuccessClaim: false,
        })),
      }),
    })

    await engine.submitMessage('sess_wrong_edit_redirect', 'continue catalog edit after missing context', {
      maxTurns: 1,
      runtimeSeed: seedWithHarness('sess_wrong_edit_redirect', createQueryRuntimeHarnessState({
        pendingRepair: [{
          queueId: 'repair-catalog',
          failureClass: 'missing-context',
          failureSummary: 'wrong edit attempted before catalog owner context',
          hypothesis: 'read catalog owner before edit',
          priorAttempt: 'edit:src/catalog/rules.ts',
          contextNeed: 'src/catalog/rules.ts',
          targetFiles: ['src/catalog/rules.ts'],
        }],
      }), {
        initialPrompt: 'edit src/catalog/rules.ts',
      }),
    })

    expect(actions[0]).toBe('read')
    expect(actions).not.toContain('edit')
  })

  it('keeps targeted verification pending after a generic verification result', async () => {
    const actions: string[] = []
    const queues: string[][] = []
    let verifyAttempts = 0
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: verifyAttempts < 2 ? 'generic verification is not enough' : 'targeted verification passed',
          handoffTo: verifyAttempts < 2 ? 'reviewer' : undefined,
          handoffReason: verifyAttempts < 2 ? 'targeted rerun still pending' : undefined,
          changedFiles: ['src/verify/target.ts'],
          verifiedFiles: verifyAttempts >= 2 ? ['src/verify/target.ts'] : [],
          verification: verifyAttempts >= 2
            ? { status: 'passed', command: 'npm test target', reason: 'targeted rerun passed' }
            : { status: 'not-requested', reason: 'generic command did not cover target' },
          requiredEvidence: ['targeted verification'],
          observedEvidence: verifyAttempts >= 2 ? ['targeted verification'] : [],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/verify/target.ts', verifiedFiles: verifyAttempts >= 2 ? ['src/verify/target.ts'] : [] },
        })
      },
      executeRuntimeBatch: async ({ batch }) => {
        verifyAttempts += 1
        return {
          batchId: batch.batchId,
          terminalSuccessClaim: false,
          results: batch.items.map((item) => ({
            toolId: item.toolId,
            actionKind: item.actionKind,
            coveredFiles: verifyAttempts === 1 ? ['package.json'] : ['src/verify/target.ts'],
            affectedPaths: verifyAttempts === 1 ? ['package.json'] : ['src/verify/target.ts'],
            exitStatusClass: 'success',
            failureClass: 'none',
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          })),
        }
      },
    })

    for await (const event of engine.streamMessage('sess_generic_verify_rejected', 'continue targeted verification', {
      maxTurns: 3,
      runtimeSeed: seedWithHarness('sess_generic_verify_rejected', createQueryRuntimeHarnessState({
        pendingVerification: [{ queueId: 'verify-targeted', targetFiles: ['src/verify/target.ts'], command: 'npm test target' }],
      })),
    })) {
      if (event.type === 'runtime.queue-settled') {
        queues.push(event.pendingVerification.flatMap((item) => item.targetFiles))
      }
    }

    expect(actions.filter((action) => action === 'verify')).toHaveLength(2)
    expect(queues[0]).toContain('src/verify/target.ts')
    expect(queues.at(-1)).toEqual([])
  })

  it('changes from bad repair to discovery when repair failure needs missing context', async () => {
    const actions: string[] = []
    let repairBatchPending = true
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        const repairTurn = runtimeAction.nextAction === 'repair'
        return output(role, {
          content: repairTurn ? 'bad repair failed from missing context' : 'read missing repair context',
          handoffTo: repairTurn ? 'reviewer' : undefined,
          handoffReason: repairTurn ? 'missing context after bad repair' : undefined,
          failedFiles: repairTurn ? [{ path: 'src/repair/context.ts', reason: 'missing context for repair' }] : [],
          evidenceFiles: repairTurn ? [] : ['src/repair/context.ts'],
          verification: repairTurn ? { status: 'failed', reason: 'missing context for repair', nextAction: 'read repair context' } : { status: 'not-requested' },
          requiredEvidence: ['repair context'],
          observedEvidence: repairTurn ? [] : ['repair context'],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/repair/context.ts' },
        })
      },
      executeRuntimeBatch: async ({ batch }) => {
        const isFirst = repairBatchPending
        repairBatchPending = false
        return {
          batchId: batch.batchId,
          terminalSuccessClaim: false,
          results: batch.items.map((item) => ({
            toolId: item.toolId,
            actionKind: item.actionKind,
            coveredFiles: ['src/repair/context.ts'],
            affectedPaths: ['src/repair/context.ts'],
            exitStatusClass: isFirst ? 'failure' : 'success',
            failureClass: isFirst ? 'missing-context' : 'none',
            diagnosticSummary: isFirst ? 'missing context for repair' : 'context read',
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          })),
        }
      },
    })

    await engine.submitMessage('sess_bad_repair_discovery', 'continue failed repair', {
      maxTurns: 2,
      runtimeSeed: seedWithHarness('sess_bad_repair_discovery', createQueryRuntimeHarnessState({
        pendingRepair: [{
          queueId: 'repair-context',
          failureClass: 'verification-failed',
          failureSummary: 'repair needed',
          hypothesis: 'repair context target',
          targetFiles: ['src/repair/context.ts'],
        }],
      })),
    })

    expect(actions).toEqual(['repair', 'read'])
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

  it('executes durable session recovery workspace tasks with restore and imperfect actions', async () => {
    const results = await Promise.all([
      runSessionLabelRepairRestoreTask(),
      runCompactTargetedRerunTask(),
      runArtifactSourceProofRestoreTask(),
    ])

    expect(results.map((result) => `${result.taskId}:${result.verdict}`)).toEqual([
      'session-label-repair-restore:completed',
      'compact-targeted-rerun:completed',
      'artifact-source-proof-restore:completed',
    ])
    expect(results.filter((result) => result.executed)).toHaveLength(3)
    expect(results.filter((result) => result.restoreOrContinuation)).toHaveLength(3)
    expect(results.filter((result) => result.taskId !== 'compact-targeted-rerun')).toHaveLength(2)
    expect(results.filter((result) => result.initialFailureOutput.length > 0)).toHaveLength(3)
    expect(results.filter((result) => result.repairQueueAndTargetedRerun).length).toBeGreaterThanOrEqual(2)
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

async function runSessionLabelRepairRestoreTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'src/session/label.mjs': 'export function label(value) { return value.toLowerCase(); }\n',
    'test/session-label.mjs': 'import { label } from "../src/session/label.mjs";\nif (label("paid") !== "PAID") throw new Error(`expected PAID got ${label("paid")}`);\n',
  })
  try {
    const initial = await workspace.run('node', ['test/session-label.mjs'], 'node test/session-label.mjs')
    const actions: string[] = []
    const result = await workspaceEngine(workspace, async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'repair') {
        return output(role, {
          content: 'session label repair written after restore',
          handoffTo: 'reviewer',
          handoffReason: 'rerun restored label verification',
          changedFiles: ['src/session/label.mjs'],
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/session/label.mjs'], notes: ['restored repair queue applied'] },
          verification: { status: 'not-requested', reason: 'targeted rerun queued' },
          requiredEvidence: ['session label targeted rerun'],
          observedEvidence: [],
          lastAction: { actionKind: 'repair', target: 'src/session/label.mjs', changedFiles: ['src/session/label.mjs'] },
        })
      }
      return output(role, {
        content: 'session label targeted rerun passed',
        changedFiles: ['src/session/label.mjs'],
        verifiedFiles: ['src/session/label.mjs', 'test/session-label.mjs'],
        evidenceFiles: ['src/session/label.mjs', 'test/session-label.mjs'],
        verification: { status: 'passed', command: 'node test/session-label.mjs', reason: 'session label targeted rerun passed' },
        requiredEvidence: ['session label targeted rerun'],
        observedEvidence: ['session label targeted rerun'],
        lastAction: { actionKind: 'verify', target: 'test/session-label.mjs', verifiedFiles: ['src/session/label.mjs'] },
      })
    }, {
      repairWrites: {
        'src/session/label.mjs': 'export function label(value) { return value.toUpperCase(); }\n',
      },
      verifyCommand: ['node', ['test/session-label.mjs']],
    }).submitMessage('sess_session_label_repair_restore', 'continue restored label repair', {
      maxTurns: 4,
      runtimeSeed: seedWithHarness('sess_session_label_repair_restore', createQueryRuntimeHarnessState({
        pendingRepair: [{
          queueId: 'repair-session-label',
          failureClass: 'command-failed',
          failureSummary: safeCommandSummary(initial),
          hypothesis: 'repair session label from restored failure',
          targetFiles: ['src/session/label.mjs'],
        }],
      })),
    })

    return workspaceRecord('session-label-repair-restore', workspace.root, result.status, {
      restoreOrContinuation: true,
      multiFileWrite: false,
      initialFailureOutput: safeCommandSummary(initial),
      repairQueueAndTargetedRerun: actions.includes('repair') && actions.includes('verify'),
      safeSummaries: [safeCommandSummary(initial), `actions:${actions.join(',')}`],
    })
  } finally {
    await workspace.dispose()
  }
}

async function runCompactTargetedRerunTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'src/compact/target.mjs': 'export const compactTarget = true;\n',
    'test/compact-target.mjs': 'import { compactTarget } from "../src/compact/target.mjs";\nif (!compactTarget) throw new Error("compact target false");\n',
    'test/compact-failing.mjs': 'throw new Error("prior compact verification failure");\n',
  })
  try {
    const initial = await workspace.run('node', ['test/compact-failing.mjs'], 'node test/compact-failing.mjs')
    const compact = buildCompactContinuitySummary({
      summary: undefined,
      continuity: undefined,
      approvalAuditHistory: [],
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [{ queueId: 'verify-compact-target', targetFiles: ['src/compact/target.mjs'], command: 'node test/compact-target.mjs' }],
      }),
    })
    const decoded = decodeCompactSessionHarnessState({ continuity: compact.continuity })
    if (decoded.status !== 'accepted') {
      throw new Error(`compact harness rejected: ${decoded.reasons.join(',')}`)
    }
    const actions: string[] = []
    let attempt = 0
    const engine = new QueryEngine({
      runAgent: async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return output(role, {
          content: attempt < 2 ? 'generic compact verification did not cover target' : 'compact targeted rerun passed',
          handoffTo: attempt < 2 ? 'reviewer' : undefined,
          handoffReason: attempt < 2 ? 'target remains pending' : undefined,
          changedFiles: ['src/compact/target.mjs'],
          verifiedFiles: attempt >= 2 ? ['src/compact/target.mjs'] : [],
          verification: attempt >= 2
            ? { status: 'passed', command: 'node test/compact-target.mjs', reason: 'compact targeted rerun passed' }
            : { status: 'not-requested', reason: 'generic verification did not cover target' },
          requiredEvidence: ['compact targeted rerun'],
          observedEvidence: attempt >= 2 ? ['compact targeted rerun'] : [],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/compact/target.mjs', verifiedFiles: attempt >= 2 ? ['src/compact/target.mjs'] : [] },
        })
      },
      executeRuntimeBatch: async ({ batch }) => {
        attempt += 1
        if (attempt === 1) {
          return {
            batchId: batch.batchId,
            terminalSuccessClaim: false,
            results: batch.items.map((item) => ({
              toolId: item.toolId,
              actionKind: item.actionKind,
              coveredFiles: ['package.json'],
              affectedPaths: ['package.json'],
              exitStatusClass: 'success',
              failureClass: 'none',
              truncated: false,
              redactionStatus: 'redacted',
              terminalSuccessClaim: false,
            })),
          }
        }
        const commandResult = await workspace.run('node', ['test/compact-target.mjs'], 'node test/compact-target.mjs')
        return {
          batchId: batch.batchId,
          terminalSuccessClaim: false,
          results: batch.items.map((item) => ({
            toolId: item.toolId,
            actionKind: item.actionKind,
            coveredFiles: ['src/compact/target.mjs'],
            affectedPaths: ['src/compact/target.mjs'],
            exitStatusClass: commandResult.exitCode === 0 ? 'success' : 'failure',
            failureClass: commandResult.exitCode === 0 ? 'none' : 'command-failed',
            diagnosticSummary: safeCommandSummary(commandResult),
            truncated: false,
            redactionStatus: 'redacted',
            terminalSuccessClaim: false,
          })),
        }
      },
    })
    const result = await engine.submitMessage('sess_compact_targeted_rerun', 'continue compact targeted rerun', {
      maxTurns: 3,
      runtimeSeed: seedWithHarness('sess_compact_targeted_rerun', decoded.harness),
    })

    return workspaceRecord('compact-targeted-rerun', workspace.root, result.status, {
      restoreOrContinuation: true,
      initialFailureOutput: safeCommandSummary(initial),
      repairQueueAndTargetedRerun: actions.filter((action) => action === 'verify').length === 2,
      safeSummaries: [safeCommandSummary(initial), `actions:${actions.join(',')}`],
    })
  } finally {
    await workspace.dispose()
  }
}

async function runArtifactSourceProofRestoreTask(): Promise<HarnessWorkspaceTaskRecord> {
  const workspace = await createHarnessWorkspace({
    'test/artifact-source.mjs': 'import { reportTitle } from "../src/artifact/report.mjs";\nif (reportTitle !== "restored-report") throw new Error(`missing source receipt for ${reportTitle}`);\n',
  })
  try {
    const initial = await workspace.run('node', ['test/artifact-source.mjs'], 'node test/artifact-source.mjs')
    const actions: string[] = []
    const result = await workspaceEngine(workspace, async ({ role, runtimeAction }) => {
      actions.push(runtimeAction.nextAction)
      if (runtimeAction.nextAction === 'repair') {
        return output(role, {
          content: 'artifact source written after restore',
          handoffTo: 'reviewer',
          handoffReason: 'verify artifact source receipt',
          changedFiles: ['src/artifact/report.mjs'],
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/artifact/report.mjs'], notes: ['artifact source created'] },
          verification: { status: 'not-requested', reason: 'source receipt pending' },
          requiredEvidence: ['artifact source receipt'],
          observedEvidence: [],
          lastAction: { actionKind: 'repair', target: 'src/artifact/report.mjs', changedFiles: ['src/artifact/report.mjs'] },
        })
      }
      return output(role, {
        content: 'artifact source receipt verified',
        changedFiles: ['src/artifact/report.mjs'],
        verifiedFiles: ['src/artifact/report.mjs', 'test/artifact-source.mjs'],
        evidenceFiles: ['src/artifact/report.mjs', 'test/artifact-source.mjs'],
        verification: { status: 'passed', command: 'node test/artifact-source.mjs', reason: 'artifact source receipt verified' },
        requiredEvidence: ['artifact source receipt'],
        observedEvidence: ['test/artifact-source.mjs'],
        lastAction: { actionKind: 'verify', target: 'test/artifact-source.mjs', verifiedFiles: ['src/artifact/report.mjs'] },
      })
    }, {
      repairWrites: {
        'src/artifact/report.mjs': 'export const reportTitle = "restored-report";\n',
      },
      verifyCommand: ['node', ['test/artifact-source.mjs']],
    }).submitMessage('sess_artifact_source_proof_restore', 'continue artifact source proof', {
      maxTurns: 4,
      runtimeSeed: seedWithHarness('sess_artifact_source_proof_restore', createQueryRuntimeHarnessState({
        pendingRepair: [{
          queueId: 'repair-artifact-source',
          failureClass: 'artifact-proof-missing',
          failureSummary: 'artifact source proof missing after restore',
          hypothesis: 'create artifact source and verify receipt',
          targetFiles: ['src/artifact/report.mjs'],
        }],
      }), {
        initialPrompt: 'write artifact report source and verify source receipt',
        observations: {
          artifactClaims: ['artifact source receipt'],
          artifactClaimEvidence: [],
        },
      }),
    })

    return workspaceRecord('artifact-source-proof-restore', workspace.root, result.status, {
      restoreOrContinuation: true,
      initialFailureOutput: safeCommandSummary(initial),
      repairQueueAndTargetedRerun: actions.includes('repair') && actions.includes('verify'),
      safeSummaries: [safeCommandSummary(initial), `actions:${actions.join(',')}`],
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
