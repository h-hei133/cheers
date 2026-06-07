import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentExecutionOutput, AgentRole, AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { createDefaultExecutionService, type ExecutionService } from '../../../runtime/execution/service.js'
import { decodeSessionHarnessState, encodeSessionHarnessState } from '../../../session/harness/state.js'
import { QueryEngine } from './engine.js'
import { createQueryRuntimeHarnessState, type QueryRuntimeHarnessState } from './harness.js'
import { buildContinuationPolicyEvidence, type QueryRuntimeStateSeed } from './state.js'

describe('query runtime debug loop', () => {
  it('uses real failure output, source facts, and a distinct next hypothesis before the successful repair', async () => {
    const workspace = await createWorkspace({
      'src/rate.mjs': 'export const rate = 2;\n',
      'test/rate.mjs': [
        'import { rate } from "../src/rate.mjs";',
        'if (rate !== 4) throw new Error(`rate mismatch expected 4 received ${rate}`);',
        '',
      ].join('\n'),
    })
    const actions: string[] = []
    const repairPlans: string[] = []
    const summaries: string[] = []
    const sourceReads: string[] = []
    let repairWrites = 0

    try {
      const engine = new QueryEngine({
        runAgent: runtimeOutput({
          verifyTarget: 'src/rate.mjs',
          evidence: 'rate targeted rerun',
        }),
        executeRuntimeBatch: async ({ batch }) => {
          const item = batch.items[0]
          if (!item) return emptyBatch(batch.batchId)
          actions.push(item.actionKind)

          if (item.actionKind === 'verify') {
            const result = await workspace.run('node', ['test/rate.mjs'], 'node test/rate.mjs')
            summaries.push(safeCommandSummary(result))
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'verify',
              coveredFiles: item.coveredFiles.length > 0 ? item.coveredFiles : ['src/rate.mjs'],
              affectedPaths: item.coveredFiles.length > 0 ? item.coveredFiles : ['src/rate.mjs'],
              exitStatusClass: result.exitCode === 0 ? 'success' : 'failed',
              failureClass: result.exitCode === 0 ? 'none' : 'command-failed',
              diagnosticSummary: result.exitCode === 0 ? 'command passed' : safeCommandSummary(result),
              redactionStatus: 'redacted',
              truncated: false,
              commandCoverage: { taskId: 'rate-targeted', coveredFiles: ['src/rate.mjs'], uncoveredFiles: [] },
              terminalSuccessClaim: false,
            })
          }

          if (item.actionKind === 'read') {
            const source = await workspace.read('src/rate.mjs')
            sourceReads.push(source)
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'read',
              coveredFiles: ['src/rate.mjs'],
              affectedPaths: ['src/rate.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              diagnosticSummary: 'source export rate=2 from src/rate.mjs',
              redactionStatus: 'redacted',
              truncated: false,
              sourceFacts: [{
                factId: 'source:rate',
                path: 'src/rate.mjs',
                summary: source.includes('rate = 2') ? 'rate currently equals 2' : 'rate source read',
                confidence: 'high',
              }],
              terminalSuccessClaim: false,
            })
          }

          if (item.actionKind === 'repair') {
            repairPlans.push(`${item.repairPlan?.hypothesis.summary ?? ''}|${item.repairPlan?.sourceFacts.map((fact) => fact.factId).join(',') ?? ''}`)
            repairWrites += 1
            await workspace.write({
              'src/rate.mjs': repairWrites === 1 ? 'export const rate = 3;\n' : 'export const rate = 4;\n',
            })
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'repair',
              coveredFiles: ['src/rate.mjs'],
              affectedPaths: ['src/rate.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              redactionStatus: 'redacted',
              truncated: false,
              terminalSuccessClaim: false,
            })
          }

          return emptyBatch(batch.batchId)
        },
      })

      const events: string[] = []
      for await (const event of engine.streamMessage('sess_debug_rate', 'debug rate failure with source facts', {
        maxTurns: 8,
        runtimeSeed: seedWithHarness('sess_debug_rate', createQueryRuntimeHarnessState({
          pendingVerification: [{ queueId: 'verify-rate', targetFiles: ['src/rate.mjs'], command: 'node test/rate.mjs' }],
        })),
      })) {
        if (event.type === 'runtime.save-point') {
          events.push(...event.savePoint.trajectory.map((entry) => `${entry.phase}:${entry.detail ?? entry.targetFiles.join(',')}`))
        }
      }

      expect(summaries[0]).toContain('rate mismatch expected 4 received 2')
      expect(sourceReads[0]).toContain('export const rate = 2')
      expect(actions).toEqual(expect.arrayContaining(['verify', 'read', 'repair']))
      expect(repairWrites).toBe(2)
      expect(repairPlans[0]).toContain('correct source value using recorded facts')
      expect(repairPlans[0]).toContain('source:rate')
      expect(new Set(repairPlans.map((plan) => plan.split('|')[0])).size).toBeGreaterThan(1)
      expect(events.some((entry) => entry.startsWith('context:source-fact-recorded'))).toBe(true)
      expect(events.some((entry) => entry.startsWith('repair:hypothesis-rejected'))).toBe(true)
      expect(actions.at(-1)).toBe('verify')
    } finally {
      await workspace.dispose()
    }
  })

  it('restores active hypothesis and source facts through the session harness codec', () => {
    const harness = createQueryRuntimeHarnessState({
      pendingRepair: [{
        queueId: 'repair-rate',
        failureClass: 'command-failed',
        failureSummary: 'rate mismatch expected 4 received 2',
        hypothesis: 'repair numeric source value',
        targetFiles: ['src/rate.mjs'],
        sourceFactIds: ['source:rate'],
        hypothesisState: {
          hypothesisId: 'hypothesis:rate:1',
          summary: 'repair numeric source value',
          confidence: 'medium',
          targetFiles: ['src/rate.mjs'],
          sourceFactIds: ['source:rate'],
        },
      }],
      sourceFacts: [{
        factId: 'source:rate',
        path: 'src/rate.mjs',
        summary: 'rate currently equals 2',
        confidence: 'high',
      }],
    })

    const decoded = decodeSessionHarnessState(encodeSessionHarnessState(harness))

    expect(decoded.status).toBe('accepted')
    if (decoded.status === 'accepted') {
      expect(decoded.harness.pendingRepair[0]?.hypothesisState?.summary).toBe('repair numeric source value')
      expect(decoded.harness.sourceFacts[0]?.summary).toBe('rate currently equals 2')
    }
  })

  it('repairs a multi-file failure only after source discovery and a second hypothesis', async () => {
    const workspace = await createWorkspace({
      'src/format.mjs': 'export function format(value) { return value.toUpperCase(); }\n',
      'src/message.mjs': 'import { format } from "./format.mjs";\nexport function message() { return format("hello"); }\n',
      'test/message.mjs': [
        'import { message } from "../src/message.mjs";',
        'const actual = message();',
        'if (actual !== "hello-v2") throw new Error(`message mismatch expected hello-v2 received ${actual}`);',
        '',
      ].join('\n'),
    })
    const actions: string[] = []
    const repairPlans: string[] = []
    const sourceReads: string[] = []
    let repairWrites = 0

    try {
      const engine = new QueryEngine({
        runAgent: async ({ role, runtimeAction }) => {
          if (runtimeAction.nextAction === 'verify') {
            return output(role, {
              content: 'message targeted verification observed',
              changedFiles: ['src/message.mjs', 'src/format.mjs'],
              verifiedFiles: ['src/message.mjs', 'src/format.mjs'],
              verification: { status: 'passed', command: 'node test/message.mjs', reason: 'message targeted rerun', selectionScope: 'targeted' },
              requiredEvidence: ['message targeted rerun'],
              observedEvidence: ['message targeted rerun'],
              lastAction: { actionKind: 'verify', target: 'src/message.mjs', verifiedFiles: ['src/message.mjs', 'src/format.mjs'] },
            })
          }
          if (runtimeAction.nextAction === 'repair') {
            const changedFiles = repairWrites === 1 ? ['src/message.mjs'] : ['src/message.mjs', 'src/format.mjs']
            return output(role, {
              content: 'message repair write applied',
              changedFiles,
              verification: { status: 'not-requested', reason: 'repair requires targeted rerun' },
              repair: { status: 'recovered', recoveredItems: changedFiles, attempts: 1 },
              requiredEvidence: ['message targeted rerun'],
              observedEvidence: [],
              lastAction: { actionKind: 'repair', target: 'src/message.mjs', changedFiles },
            })
          }
          return output(role, {
            content: 'message source inspected',
            evidenceFiles: ['src/message.mjs', 'src/format.mjs'],
            requiredEvidence: ['message targeted rerun'],
            observedEvidence: [],
            lastAction: { actionKind: runtimeAction.nextAction, target: 'src/message.mjs' },
          })
        },
        executeRuntimeBatch: async ({ batch }) => {
          const item = batch.items[0]
          if (!item) return emptyBatch(batch.batchId)
          actions.push(item.actionKind)
          if (item.actionKind === 'verify') {
            const result = await workspace.run('node', ['test/message.mjs'], 'node test/message.mjs')
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'verify',
              coveredFiles: item.coveredFiles.length > 0 ? item.coveredFiles : ['src/message.mjs', 'src/format.mjs'],
              affectedPaths: item.coveredFiles.length > 0 ? item.coveredFiles : ['src/message.mjs', 'src/format.mjs'],
              exitStatusClass: result.exitCode === 0 ? 'success' : 'failed',
              failureClass: result.exitCode === 0 ? 'none' : 'command-failed',
              diagnosticSummary: result.exitCode === 0 ? 'command passed' : safeCommandSummary(result),
              redactionStatus: 'redacted',
              truncated: false,
              commandCoverage: { taskId: 'message-targeted', coveredFiles: ['src/message.mjs', 'src/format.mjs'], uncoveredFiles: [] },
              terminalSuccessClaim: false,
            })
          }
          if (item.actionKind === 'read') {
            const messageSource = await workspace.read('src/message.mjs')
            const formatSource = await workspace.read('src/format.mjs')
            sourceReads.push(messageSource, formatSource)
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'read',
              coveredFiles: ['src/message.mjs', 'src/format.mjs'],
              affectedPaths: ['src/message.mjs', 'src/format.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              diagnosticSummary: 'source message uses format and format uppercases',
              redactionStatus: 'redacted',
              truncated: false,
              sourceFacts: [
                { factId: 'source:message', path: 'src/message.mjs', summary: messageSource.includes('format("hello")') ? 'message delegates to format' : 'message source read', confidence: 'high' },
                { factId: 'source:format', path: 'src/format.mjs', summary: formatSource.includes('toUpperCase') ? 'format uppercases input' : 'format source read', confidence: 'high' },
              ],
              terminalSuccessClaim: false,
            })
          }
          if (item.actionKind === 'repair') {
            repairPlans.push(`${item.repairPlan?.hypothesis.summary ?? ''}|${item.repairPlan?.sourceFacts.map((fact) => fact.factId).join(',') ?? ''}`)
            repairWrites += 1
            await workspace.write(repairWrites === 1
              ? { 'src/message.mjs': 'import { format } from "./format.mjs";\nexport function message() { return format("hello-v2"); }\n' }
              : {
                  'src/message.mjs': 'import { format } from "./format.mjs";\nexport function message() { return format("hello-v2"); }\n',
                  'src/format.mjs': 'export function format(value) { return value; }\n',
                })
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'repair',
              coveredFiles: repairWrites === 1 ? ['src/message.mjs'] : ['src/message.mjs', 'src/format.mjs'],
              affectedPaths: repairWrites === 1 ? ['src/message.mjs'] : ['src/message.mjs', 'src/format.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              redactionStatus: 'redacted',
              truncated: false,
              terminalSuccessClaim: false,
            })
          }
          return emptyBatch(batch.batchId)
        },
      })

      await engine.submitMessage('sess_debug_message', 'debug message failure with source facts', {
        maxTurns: 10,
        runtimeSeed: seedWithHarness('sess_debug_message', createQueryRuntimeHarnessState({
          pendingVerification: [{ queueId: 'verify-message', targetFiles: ['src/message.mjs', 'src/format.mjs'], command: 'node test/message.mjs' }],
        })),
      })

      expect(actions.filter((action) => action === 'verify').length).toBeGreaterThanOrEqual(3)
      expect(repairWrites).toBe(2)
      expect(sourceReads.join('\n')).toContain('toUpperCase')
      expect(repairPlans[0]).toContain('source:message')
      expect(repairPlans[0]).toContain('source:format')
      expect(new Set(repairPlans.map((plan) => plan.split('|')[0])).size).toBeGreaterThan(1)
    } finally {
      await workspace.dispose()
    }
  })

  it('stops not proven when source discovery produces no source facts', async () => {
    const workspace = await createWorkspace({
      'src/missing.mjs': 'export const value = 1;\n',
      'test/missing.mjs': [
        'import { value } from "../src/missing.mjs";',
        'if (value !== 9) throw new Error(`missing-source expected 9 received ${value}`);',
        '',
      ].join('\n'),
    })
    const actions: string[] = []
    const proofGaps: string[] = []
    let repairWrites = 0
    let finalStatus = ''

    try {
      const engine = new QueryEngine({
        runAgent: runtimeOutput({
          verifyTarget: 'src/missing.mjs',
          evidence: 'missing targeted rerun',
        }),
        executeRuntimeBatch: async ({ batch }) => {
          const item = batch.items[0]
          if (!item) return emptyBatch(batch.batchId)
          actions.push(item.actionKind)
          if (item.actionKind === 'verify') {
            const result = await workspace.run('node', ['test/missing.mjs'], 'node test/missing.mjs')
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'verify',
              coveredFiles: ['src/missing.mjs'],
              affectedPaths: ['src/missing.mjs'],
              exitStatusClass: result.exitCode === 0 ? 'success' : 'failed',
              failureClass: result.exitCode === 0 ? 'none' : 'command-failed',
              diagnosticSummary: result.exitCode === 0 ? 'command passed' : safeCommandSummary(result),
              redactionStatus: 'redacted',
              truncated: false,
              terminalSuccessClaim: false,
            })
          }
          if (item.actionKind === 'read') {
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'read',
              coveredFiles: ['src/missing.mjs'],
              affectedPaths: ['src/missing.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              diagnosticSummary: 'read completed but source facts unavailable',
              redactionStatus: 'redacted',
              truncated: false,
              sourceFacts: [],
              terminalSuccessClaim: false,
            })
          }
          if (item.actionKind === 'repair') repairWrites += 1
          return emptyBatch(batch.batchId)
        },
      })

      const result = await engine.submitMessage('sess_debug_missing', 'debug missing source facts', {
        maxTurns: 5,
        runtimeSeed: seedWithHarness('sess_debug_missing', createQueryRuntimeHarnessState({
          pendingVerification: [{ queueId: 'verify-missing', targetFiles: ['src/missing.mjs'], command: 'node test/missing.mjs' }],
        })),
      })

      expect(actions).toEqual(['verify', 'read'])
      expect(repairWrites).toBe(0)
      expect(result.status).toBe('stopped_not_proven')
    } finally {
      await workspace.dispose()
    }
  })

  it('continues restored hypothesis state into repair write and targeted rerun', async () => {
    const workspace = await createWorkspace({
      'src/replay.mjs': 'export const replayValue = 1;\n',
      'test/replay.mjs': [
        'import { replayValue } from "../src/replay.mjs";',
        'if (replayValue !== 7) throw new Error(`replay expected 7 received ${replayValue}`);',
        '',
      ].join('\n'),
    })
    const restored = decodeSessionHarnessState(encodeSessionHarnessState(createQueryRuntimeHarnessState({
      pendingRepair: [{
        queueId: 'repair-replay',
        failureClass: 'command-failed',
        failureSummary: 'replay expected 7 received 1',
        hypothesis: 'correct source value using recorded facts',
        targetFiles: ['src/replay.mjs'],
        sourceFactIds: ['source:replay'],
        hypothesisState: {
          hypothesisId: 'hypothesis:replay:1',
          summary: 'correct source value using recorded facts',
          confidence: 'medium',
          targetFiles: ['src/replay.mjs'],
          sourceFactIds: ['source:replay'],
        },
      }],
      sourceFacts: [{
        factId: 'source:replay',
        path: 'src/replay.mjs',
        summary: 'replayValue currently equals 1',
        confidence: 'high',
      }],
    })))
    const actions: string[] = []
    let repairWrites = 0

    try {
      expect(restored.status).toBe('accepted')
      if (restored.status !== 'accepted') return
      const engine = new QueryEngine({
        runAgent: runtimeOutput({
          verifyTarget: 'src/replay.mjs',
          evidence: 'replay targeted rerun',
        }),
        executeRuntimeBatch: async ({ batch }) => {
          const item = batch.items[0]
          if (!item) return emptyBatch(batch.batchId)
          actions.push(item.actionKind)
          if (item.actionKind === 'repair') {
            expect(item.repairPlan?.hypothesis.summary).toBe('correct source value using recorded facts')
            expect(item.repairPlan?.sourceFacts[0]?.factId).toBe('source:replay')
            repairWrites += 1
            await workspace.write({ 'src/replay.mjs': 'export const replayValue = 7;\n' })
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'repair',
              coveredFiles: ['src/replay.mjs'],
              affectedPaths: ['src/replay.mjs'],
              exitStatusClass: 'success',
              failureClass: 'none',
              redactionStatus: 'redacted',
              truncated: false,
              terminalSuccessClaim: false,
            })
          }
          if (item.actionKind === 'verify') {
            const result = await workspace.run('node', ['test/replay.mjs'], 'node test/replay.mjs')
            return batchResult(batch.batchId, {
              toolId: item.toolId,
              actionKind: 'verify',
              coveredFiles: ['src/replay.mjs'],
              affectedPaths: ['src/replay.mjs'],
              exitStatusClass: result.exitCode === 0 ? 'success' : 'failed',
              failureClass: result.exitCode === 0 ? 'none' : 'command-failed',
              diagnosticSummary: result.exitCode === 0 ? 'command passed' : safeCommandSummary(result),
              redactionStatus: 'redacted',
              truncated: false,
              commandCoverage: { taskId: 'replay-targeted', coveredFiles: ['src/replay.mjs'], uncoveredFiles: [] },
              terminalSuccessClaim: false,
            })
          }
          return emptyBatch(batch.batchId)
        },
      })

      const result = await engine.submitMessage('sess_debug_replay', 'continue restored hypothesis', {
        maxTurns: 4,
        runtimeSeed: seedWithHarness('sess_debug_replay', restored.harness),
      })

      expect(actions).toEqual(['repair', 'verify'])
      expect(repairWrites).toBe(1)
      expect(result.status).toBe('completed')
    } finally {
      await workspace.dispose()
    }
  })

  it('blocks restored repeat repair when referenced source facts are missing', async () => {
    const workspace = await createWorkspace({
      'src/repeat.mjs': 'export const repeatValue = 1;\n',
      'test/repeat.mjs': [
        'import { repeatValue } from "../src/repeat.mjs";',
        'if (repeatValue !== 2) throw new Error(`repeat expected 2 received ${repeatValue}`);',
        '',
      ].join('\n'),
    })
    const actions: string[] = []
    const proofGaps: string[] = []
    let repairWrites = 0
    let finalStatus = ''

    try {
      const engine = new QueryEngine({
        runAgent: runtimeOutput({
          verifyTarget: 'src/repeat.mjs',
          evidence: 'repeat targeted rerun',
        }),
        executeRuntimeBatch: async ({ batch }) => {
          const item = batch.items[0]
          if (!item) return emptyBatch(batch.batchId)
          actions.push(item.actionKind)
          if (item.actionKind === 'repair') {
            repairWrites += 1
          }
          return emptyBatch(batch.batchId)
        },
      })

      for await (const event of engine.streamMessage('sess_debug_repeat_blocked', 'continue repeat repair without source facts', {
        maxTurns: 3,
        runtimeSeed: seedWithHarness('sess_debug_repeat_blocked', createQueryRuntimeHarnessState({
          pendingRepair: [{
            queueId: 'repair-repeat',
            failureClass: 'command-failed',
            failureSummary: 'repeat expected 2 received 1',
            hypothesis: 'correct source value using recorded facts',
            targetFiles: ['src/repeat.mjs'],
            sourceFactIds: ['source:repeat'],
            hypothesisState: {
              hypothesisId: 'hypothesis:repeat:1',
              summary: 'correct source value using recorded facts',
              confidence: 'medium',
              targetFiles: ['src/repeat.mjs'],
              sourceFactIds: ['source:repeat'],
            },
          }],
          sourceFacts: [],
        })),
      })) {
        if (event.type === 'runtime.next-action') {
          proofGaps.push(...event.decision.proofGap)
        }
        if (event.type === 'query.completed') {
          finalStatus = event.result.status
        }
      }

      expect(actions).not.toContain('repair')
      expect(repairWrites).toBe(0)
      expect(finalStatus).toBe('stopped_not_proven')
      expect(proofGaps).toContain('repair source facts missing')
    } finally {
      await workspace.dispose()
    }
  })
})

function seedWithHarness(sessionId: string, harness: QueryRuntimeHarnessState): QueryRuntimeStateSeed {
  return {
    config: {
      sessionId,
      initialPrompt: 'resume pending debug state',
      maxTurns: 8,
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
    harness,
  }
}

function runtimeOutput(input: {
  readonly verifyTarget: string
  readonly evidence: string
}): AgentRunner {
  return async ({ role, runtimeAction }) => {
    if (runtimeAction.nextAction === 'verify') {
      return output(role, {
        content: 'targeted verification observed',
        changedFiles: [input.verifyTarget],
        verifiedFiles: [input.verifyTarget],
        verification: { status: 'passed', command: 'node test/rate.mjs', reason: input.evidence, selectionScope: 'targeted' },
        requiredEvidence: [input.evidence],
        observedEvidence: [input.evidence],
        lastAction: { actionKind: 'verify', target: input.verifyTarget, verifiedFiles: [input.verifyTarget] },
      })
    }
    if (runtimeAction.nextAction === 'repair') {
      return output(role, {
        content: 'repair write applied',
        changedFiles: [input.verifyTarget],
        verification: { status: 'not-requested', reason: 'repair requires targeted rerun' },
        repair: { status: 'recovered', recoveredItems: [input.verifyTarget], attempts: 1 },
        requiredEvidence: [input.evidence],
        observedEvidence: [],
        lastAction: { actionKind: 'repair', target: input.verifyTarget, changedFiles: [input.verifyTarget] },
      })
    }
    return output(role, {
      content: 'source context inspected',
      evidenceFiles: [input.verifyTarget],
      requiredEvidence: [input.evidence],
      observedEvidence: [],
      lastAction: { actionKind: runtimeAction.nextAction, target: input.verifyTarget },
    })
  }
}

function output(role: AgentRole, input: {
  readonly content: string
  readonly changedFiles?: readonly string[]
  readonly verifiedFiles?: readonly string[]
  readonly evidenceFiles?: readonly string[]
  readonly verification?: Partial<CodingResultSummary['verification']>
  readonly repair?: Partial<CodingResultSummary['repair']>
  readonly requiredEvidence?: readonly string[]
  readonly observedEvidence?: readonly string[]
  readonly lastAction?: CodingResultSummary['lastActionResultSeed']
}): AgentExecutionOutput {
  const changedFiles = [...(input.changedFiles ?? [])]
  const verifiedFiles = [...(input.verifiedFiles ?? [])]
  const requiredEvidence = [...(input.requiredEvidence ?? ['debug proof'])]
  const observedEvidence = [...(input.observedEvidence ?? [])]
  return {
    role,
    content: input.content,
    codingResult: {
      taskId: 'debug-loop-diagnostic',
      taskKind: 'run-command',
      targetDescription: 'debug loop diagnostic',
      changedFiles,
      verifiedFiles,
      unverifiedFiles: changedFiles.filter((path) => !verifiedFiles.includes(path)).map((path) => ({ path, reason: 'verification pending' })),
      failedFiles: [],
      evidence: [...observedEvidence, ...(input.evidenceFiles ?? [])],
      diagnosis: {
        disposition: 'needs-verification',
        reason: 'debug diagnostic',
        searchPattern: 'debug',
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
      continuation: { status: 'first-pass-success', attempts: 0, evidence: [] },
      taskSatisfaction: {
        verdict: observedEvidence.length >= requiredEvidence.length ? 'satisfied' : 'insufficient-evidence',
        reasons: observedEvidence.length >= requiredEvidence.length ? ['evidence observed'] : ['missing evidence'],
        requiredEvidence,
        observedEvidence,
      },
      writeEffect: changedFiles.length > 0 ? (verifiedFiles.length >= changedFiles.length ? 'verified' : 'unverified') : 'none',
      lastActionResultSeed: input.lastAction,
    },
  }
}

interface Workspace {
  readonly root: string
  readonly execution: ExecutionService
  readonly run: (command: string, args: readonly string[], reportSafeCommand: string) => Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }>
  readonly read: (relativePath: string) => Promise<string>
  readonly write: (files: Record<string, string>) => Promise<void>
  readonly dispose: () => Promise<void>
}

async function createWorkspace(files: Record<string, string>): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), 'debug-loop-'))
  const execution = createDefaultExecutionService()
  const workspace: Workspace = {
    root,
    execution,
    run(command, args, reportSafeCommand) {
      return execution.runCommand({
        operationKind: 'command.run',
        command,
        args,
        cwd: root,
        workspaceRoot: root,
        authority: { mode: 'command-allowlisted', source: 'workspace-authority', reason: 'debug diagnostic command' },
        caller: 'query-runtime-debug-test',
        reason: 'targeted disposable workspace verification',
        reportSafeCommand,
        timeoutMs: 5000,
      })
    },
    read(relativePath) {
      return execution.readTextFile({
        operationKind: 'file.read',
        workspaceRoot: root,
        absolutePath: join(root, relativePath),
        authority: { mode: 'read-only', source: 'workspace-authority', reason: 'debug diagnostic source read' },
        caller: 'query-runtime-debug-test',
        reason: 'read disposable workspace source',
        reportSafeTarget: relativePath,
      })
    },
    async write(nextFiles) {
      for (const [relativePath, content] of Object.entries(nextFiles)) {
        await execution.writeTextFile({
          operationKind: 'file.write',
          workspaceRoot: root,
          absolutePath: join(root, relativePath),
          content,
          authority: { mode: 'approved-for-write', source: 'workspace-authority', reason: 'debug diagnostic write' },
          caller: 'query-runtime-debug-test',
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

function batchResult(batchId: string, result: any) {
  return { batchId, terminalSuccessClaim: false as const, results: [result] }
}

function emptyBatch(batchId: string) {
  return { batchId, terminalSuccessClaim: false as const, results: [] }
}

function safeCommandSummary(result: { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }): string {
  return `exit:${result.exitCode ?? 'null'}:${[result.stderr, result.stdout]
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\/tmp\/debug-loop-[^/\s]+/g, '<workspace>')
    .slice(0, 220)}`
}
