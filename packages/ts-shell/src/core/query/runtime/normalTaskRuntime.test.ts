import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { createDefaultExecutionService, type ExecutionService } from '../../../runtime/execution/service.js'
import { QueryEngine } from './engine.js'
import type { QueryRuntimeTaskState } from './taskState.js'

describe('normal task runtime', () => {
  it('completes a disposable multi-file edit after missing context discovery and targeted verification', async () => {
    const workspace = await createWorkspace({
      'src/inventory/status.ts': 'export const status = "pending";\n',
      'src/inventory/status.test.ts': 'import { status } from "./status";\n',
      'package.json': '{"scripts":{"test":"node --check src/inventory/status.ts"}}\n',
    })
    const actions: string[] = []

    try {
      const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
        actions.push(`${turn}:${runtimeAction.nextAction}`)
        if (runtimeAction.nextAction === 'search') {
          return {
            role,
            content: 'inventory owner discovered',
            handoffTo: nextRoleAfter(role),
            handoffReason: `read discovered owner turn ${turn}`,
            codingResult: codingResult({
              evidenceFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
              requiredEvidence: ['inventory owner context'],
              observedEvidence: [],
              lastAction: { actionKind: 'search', target: 'src/inventory/status.ts' },
            }),
          }
        }
        if (runtimeAction.nextAction === 'read') {
          return {
            role,
            content: 'inventory files read',
            handoffTo: nextRoleAfter(role),
            handoffReason: `route inventory edit turn ${turn}`,
            codingResult: codingResult({
              evidenceFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
              requiredEvidence: ['inventory owner context'],
              observedEvidence: ['inventory owner context'],
              lastAction: { actionKind: 'read', target: 'src/inventory/status.ts' },
            }),
          }
        }
        if (runtimeAction.nextAction === 'edit') {
          return {
            role,
            content: 'inventory status edited',
            handoffTo: nextRoleAfter(role),
            handoffReason: `verify inventory edit turn ${turn}`,
            codingResult: codingResult({
              changedFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
              evidenceFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
              verification: { status: 'not-requested', reason: 'focused check pending' },
              requiredEvidence: ['post-write inventory verification'],
              observedEvidence: [],
              lastAction: {
                actionKind: 'edit',
                target: 'src/inventory/status.ts',
                changedFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
              },
            }),
          }
        }
        return {
          role,
          content: 'inventory verification passed',
          codingResult: codingResult({
            changedFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
            evidenceFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
            verification: {
              status: 'passed',
              command: 'node --check src/inventory/status.ts',
              reason: 'focused inventory check passed',
            },
            requiredEvidence: ['post-write inventory verification'],
            observedEvidence: ['post-write inventory verification'],
            lastAction: {
              actionKind: 'verify',
              target: 'src/inventory/status.ts',
              verifiedFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
              verification: { status: 'passed', reason: 'focused inventory check passed' },
            },
          }),
        }
      }

      const engine = new QueryEngine({
        runAgent,
        executeRuntimeBatch: workspace.batchExecutor({
          edit: {
            'src/inventory/status.ts': 'export const status = "ready";\n',
            'src/inventory/status.test.ts': 'import { status } from "./status";\nif (status !== "ready") throw new Error("bad status");\n',
          },
          verifyCommand: ['node', ['--check', 'src/inventory/status.ts']],
        }),
      } as any)

      const result = await engine.submitMessage('sess_inventory_unseen', 'update inventory status owner after missing context', {
        maxTurns: 5,
      })

      expect(result.status, `${result.stopReason ?? 'no-stop'} ${actions.join(',')}`).toBe('completed')
      expect(result.terminalClassification).toBe('success')
      expect(actions).toContain('1:search')
      expect(actions).toContain('2:read')
      expect(actions).toContain('3:edit')
      expect(actions).toContain('4:verify')
      expect(result.codingResult?.verifiedFiles).toEqual([
        'src/inventory/status.ts',
        'src/inventory/status.test.ts',
      ])
    } finally {
      await workspace.dispose()
    }
  })

  it('repairs a failed disposable verification and completes only after targeted rerun', async () => {
    const workspace = await createWorkspace({
      'src/billing/tax.ts': 'export const tax = 0;\n',
      'src/billing/tax.test.ts': 'import { tax } from "./tax";\nif (tax !== 7) throw new Error("bad tax");\n',
    })
    const actions: string[] = []

    try {
      const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
        actions.push(runtimeAction.nextAction)
        if (runtimeAction.nextAction === 'search') {
          return {
            role,
            content: 'billing context found',
            handoffTo: nextRoleAfter(role),
            handoffReason: `route billing change turn ${turn}`,
            codingResult: codingResult({
              evidenceFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              requiredEvidence: ['billing context'],
              observedEvidence: ['billing context'],
              lastAction: { actionKind: 'search', target: 'src/billing/tax.ts' },
            }),
          }
        }
        if (runtimeAction.nextAction === 'read') {
          return {
            role,
            content: 'billing files read',
            handoffTo: nextRoleAfter(role),
            handoffReason: `apply billing change turn ${turn}`,
            codingResult: codingResult({
              evidenceFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              requiredEvidence: ['billing context'],
              observedEvidence: ['billing context'],
              lastAction: { actionKind: 'read', target: 'src/billing/tax.ts' },
            }),
          }
        }
        if (runtimeAction.nextAction === 'edit') {
          return {
            role,
            content: 'billing edit with failed check',
            handoffTo: nextRoleAfter(role),
            handoffReason: `failed check needs repair turn ${turn}`,
            codingResult: codingResult({
              taskKind: 'debug-repair',
              changedFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              failedFiles: [{ path: 'src/billing/tax.test.ts', reason: 'expected 7 got 6' }],
              evidenceFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              verification: { status: 'failed', reason: 'focused billing check failed' },
              requiredEvidence: ['billing verification after repair'],
              observedEvidence: [],
              lastAction: {
                actionKind: 'edit',
                target: 'src/billing/tax.ts',
                changedFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              },
            }),
          }
        }
        if (runtimeAction.nextAction === 'repair') {
          return {
            role,
            content: 'billing repair applied',
            handoffTo: nextRoleAfter(role),
            handoffReason: `rerun billing check turn ${turn}`,
            codingResult: codingResult({
              taskKind: 'debug-repair',
              changedFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              evidenceFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/billing/tax.ts'] },
              verification: { status: 'not-requested', reason: 'post repair check pending' },
              requiredEvidence: ['billing verification after repair'],
              observedEvidence: [],
              lastAction: {
                actionKind: 'repair',
                target: 'src/billing/tax.ts',
                changedFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              },
            }),
          }
        }
        return {
          role,
          content: 'billing verification passed after repair',
          codingResult: codingResult({
            taskKind: 'debug-repair',
            changedFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
            evidenceFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
            repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/billing/tax.ts'] },
            verification: {
              status: 'passed',
              command: 'node --check src/billing/tax.ts',
              reason: 'post repair billing check passed',
            },
            requiredEvidence: ['billing verification after repair'],
            observedEvidence: ['billing verification after repair'],
            lastAction: {
              actionKind: 'verify',
              target: 'src/billing/tax.ts',
              verifiedFiles: ['src/billing/tax.ts', 'src/billing/tax.test.ts'],
              verification: { status: 'passed', reason: 'post repair billing check passed' },
            },
          }),
        }
      }
      const engine = new QueryEngine({
        runAgent,
        executeRuntimeBatch: workspace.batchExecutor({
          edit: {
            'src/billing/tax.ts': 'export const tax = 6;\n',
            'src/billing/tax.test.ts': 'import { tax } from "./tax";\nif (tax !== 7) throw new Error("bad tax");\n',
          },
          repair: {
            'src/billing/tax.ts': 'export const tax = 7;\n',
          },
          verifyCommand: ['node', ['--check', 'src/billing/tax.ts']],
        }),
      } as any)

      const result = await engine.submitMessage('sess_billing_repair_unseen', 'update billing tax and handle focused check result', {
        maxTurns: 6,
      })

      expect(result.status, `${result.stopReason ?? 'no-stop'} ${actions.join(',')}`).toBe('completed')
      expect(actions).toEqual(['search', 'read', 'edit', 'repair', 'verify'])
      expect(result.codingResult?.repair.status).toBe('recovered')
      expect(result.codingResult?.verification.status).toBe('passed')
    } finally {
      await workspace.dispose()
    }
  })

  it('validates an artifact through source and verification claim evidence', async () => {
    const workspace = await createWorkspace({
      'data/orders.csv': 'id,total\n1,21\n',
      'reports/orders-summary.md': '',
    })
    const actions: string[] = []

    try {
      const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
          return {
            role,
            content: 'orders source located',
            handoffTo: nextRoleAfter(role),
            handoffReason: 'produce source-backed report',
            codingResult: codingResult({
              taskKind: 'data-artifact',
              evidenceFiles: ['data/orders.csv', 'reports/orders-summary.md'],
              requiredEvidence: ['source receipt for orders data'],
              observedEvidence: ['data/orders.csv'],
              lastAction: { actionKind: runtimeAction.nextAction, target: 'data/orders.csv' },
            }),
          }
        }
        return {
          role,
          content: 'orders summary artifact produced',
          codingResult: codingResult({
            taskKind: 'data-artifact',
            changedFiles: ['reports/orders-summary.md'],
            evidenceFiles: ['data/orders.csv', 'reports/orders-summary.md'],
            verification: {
              status: 'passed',
              command: 'node --check reports/orders-summary.md',
              reason: 'artifact source and validation receipts matched',
            },
            requiredEvidence: [
              'source receipt for orders data',
              'verification receipt for orders summary',
            ],
            observedEvidence: [
              'data/orders.csv',
              'verification receipt for orders summary',
            ],
            lastAction: {
              actionKind: 'artifact',
              target: 'reports/orders-summary.md',
              changedFiles: ['reports/orders-summary.md'],
            },
          }),
        }
      }
      const engine = new QueryEngine({
        runAgent,
        executeRuntimeBatch: workspace.batchExecutor({
          artifact: {
            'reports/orders-summary.md': '# Orders Summary\n\nSource: data/orders.csv\nTotal: 21\n',
          },
          verifyCommand: ['node', ['--version']],
        }),
      } as any)

      const result = await engine.submitMessage('sess_orders_artifact_unseen', 'produce an orders summary artifact from data/orders.csv', {
        maxTurns: 4,
      })

      expect(result.status).toBe('completed')
      expect(actions).toContain('artifact')
      expect(result.codingResult?.taskKind).toBe('data-artifact')
      expect(result.codingResult?.verification.status).toBe('passed')
    } finally {
      await workspace.dispose()
    }
  })

  it('repairs a second failed disposable check before final verification', async () => {
    const workspace = await createWorkspace({
      'src/pricing/threshold.ts': 'export const threshold = 10;\n',
      'src/pricing/threshold.test.ts': 'import { threshold } from "./threshold";\nif (threshold !== 12) throw new Error("bad threshold");\n',
    })
    const actions: string[] = []

    try {
      const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
        actions.push(runtimeAction.nextAction)
        if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
          return {
            role,
            content: 'pricing context ready',
            handoffTo: nextRoleAfter(role),
            handoffReason: `pricing context turn ${turn}`,
            codingResult: codingResult({
              evidenceFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              requiredEvidence: ['pricing context'],
              observedEvidence: ['pricing context'],
              lastAction: { actionKind: runtimeAction.nextAction, target: 'src/pricing/threshold.ts' },
            }),
          }
        }
        if (runtimeAction.nextAction === 'edit') {
          return {
            role,
            content: 'pricing edit failed focused check',
            handoffTo: nextRoleAfter(role),
            handoffReason: `pricing failed check turn ${turn}`,
            codingResult: codingResult({
              taskKind: 'debug-repair',
              changedFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              failedFiles: [{ path: 'src/pricing/threshold.test.ts', reason: 'expected 12 got 11' }],
              evidenceFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              verification: { status: 'failed', reason: 'pricing threshold check failed' },
              requiredEvidence: ['pricing verification after repair'],
              observedEvidence: [],
              lastAction: {
                actionKind: 'edit',
                target: 'src/pricing/threshold.ts',
                changedFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              },
            }),
          }
        }
        if (runtimeAction.nextAction === 'repair') {
          return {
            role,
            content: 'pricing repair applied',
            handoffTo: nextRoleAfter(role),
            handoffReason: `pricing rerun turn ${turn}`,
            codingResult: codingResult({
              taskKind: 'debug-repair',
              changedFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              evidenceFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/pricing/threshold.ts'] },
              verification: { status: 'not-requested', reason: 'pricing post-repair check pending' },
              requiredEvidence: ['pricing verification after repair'],
              observedEvidence: [],
              lastAction: {
                actionKind: 'repair',
                target: 'src/pricing/threshold.ts',
                changedFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              },
            }),
          }
        }
        return {
          role,
          content: 'pricing verification passed after repair',
          codingResult: codingResult({
            taskKind: 'debug-repair',
            changedFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
            evidenceFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
            repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/pricing/threshold.ts'] },
            verification: {
              status: 'passed',
              command: 'node --check src/pricing/threshold.ts',
              reason: 'pricing post-repair check passed',
            },
            requiredEvidence: ['pricing verification after repair'],
            observedEvidence: ['pricing verification after repair'],
            lastAction: {
              actionKind: 'verify',
              target: 'src/pricing/threshold.ts',
              verifiedFiles: ['src/pricing/threshold.ts', 'src/pricing/threshold.test.ts'],
              verification: { status: 'passed', reason: 'pricing post-repair check passed' },
            },
          }),
        }
      }
      const engine = new QueryEngine({
        runAgent,
        executeRuntimeBatch: workspace.batchExecutor({
          edit: {
            'src/pricing/threshold.ts': 'export const threshold = 11;\n',
            'src/pricing/threshold.test.ts': 'import { threshold } from "./threshold";\nif (threshold !== 12) throw new Error("bad threshold");\n',
          },
          repair: {
            'src/pricing/threshold.ts': 'export const threshold = 12;\n',
          },
          verifyCommand: ['node', ['--check', 'src/pricing/threshold.ts']],
        }),
      } as any)

      const result = await engine.submitMessage('sess_pricing_repair_unseen', 'update pricing threshold and handle focused check result', {
        maxTurns: 6,
      })

      expect(result.status, `${result.stopReason ?? 'no-stop'} ${actions.join(',')}`).toBe('completed')
      expect(actions).toEqual(['search', 'read', 'edit', 'repair', 'verify'])
      expect(result.codingResult?.repair.status).toBe('recovered')
      expect(result.codingResult?.verification.status).toBe('passed')
    } finally {
      await workspace.dispose()
    }
  })

  it('continues restored changed files through targeted disposable verification', async () => {
    const workspace = await createWorkspace({
      'src/profile/format.ts': 'export const format = "ok";\n',
      'src/profile/format.test.ts': 'import { format } from "./format";\nif (format !== "ok") throw new Error("bad format");\n',
    })
    const actions: string[] = []

    try {
      const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
        actions.push(runtimeAction.nextAction)
        return {
          role,
          content: 'restored profile verification passed',
          codingResult: codingResult({
            taskKind: 'continuation',
            changedFiles: ['src/profile/format.ts', 'src/profile/format.test.ts'],
            evidenceFiles: ['src/profile/format.ts', 'src/profile/format.test.ts'],
            verification: {
              status: 'passed',
              command: 'node --check src/profile/format.ts',
              reason: 'restored profile check passed',
            },
            requiredEvidence: ['profile continuation verification'],
            observedEvidence: ['profile continuation verification'],
            lastAction: {
              actionKind: 'verify',
              target: 'src/profile/format.ts',
              verifiedFiles: ['src/profile/format.ts', 'src/profile/format.test.ts'],
              verification: { status: 'passed', reason: 'restored profile check passed' },
            },
          }),
        }
      }
      const engine = new QueryEngine({
        runAgent,
        executeRuntimeBatch: workspace.batchExecutor({
          verifyCommand: ['node', ['--check', 'src/profile/format.ts']],
        }),
      } as any)

      const result = await engine.submitMessage('sess_profile_continue_unseen', 'continue restored profile formatter verification', {
        maxTurns: 2,
        runtimeSeed: runtimeSeedWithTaskState('sess_profile_continue_unseen', {
          source: 'compact',
          pendingAction: 'verify',
          proofGap: ['verification proof missing for changed files'],
          changedFiles: ['src/profile/format.ts', 'src/profile/format.test.ts'],
          verifiedFiles: [],
          unverifiedFiles: ['src/profile/format.ts', 'src/profile/format.test.ts'],
          failureCategories: [],
          repairAttempts: [],
          nextVerificationPlan: {
            command: 'node --check src/profile/format.ts',
            targetFiles: ['src/profile/format.ts', 'src/profile/format.test.ts'],
            failedFiles: [],
            status: 'not-requested',
            nextAction: 'rerun profile verification',
          },
          artifactPendingState: { claims: [], evidenceIds: [], missingClaims: [] },
          continuationSafety: { status: 'safe', reasons: ['compact state carried changed files'] },
        }),
      })

      expect(result.status).toBe('completed')
      expect(actions).toEqual(['verify'])
      expect(result.codingResult?.verifiedFiles).toEqual([
        'src/profile/format.ts',
        'src/profile/format.test.ts',
      ])
    } finally {
      await workspace.dispose()
    }
  })

  it('leaves selected workspace apply not proven when post-write verification is missing', async () => {
    const workspace = await createWorkspace({
      'src/shipping/rate.ts': 'export const rate = 1;\n',
      'src/shipping/rate.test.ts': 'import { rate } from "./rate";\n',
    })

    try {
      const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
        if (runtimeAction.nextAction === 'search' || runtimeAction.nextAction === 'read') {
          return {
            role,
            content: 'shipping owner located',
            handoffTo: nextRoleAfter(role),
            handoffReason: 'apply shipping change',
            codingResult: codingResult({
              evidenceFiles: ['src/shipping/rate.ts', 'src/shipping/rate.test.ts'],
              requiredEvidence: ['shipping context'],
              observedEvidence: ['shipping context'],
              lastAction: { actionKind: runtimeAction.nextAction, target: 'src/shipping/rate.ts' },
            }),
          }
        }
        return {
          role,
          content: 'shipping write applied without verification',
          handoffTo: nextRoleAfter(role),
          handoffReason: 'post-write verification still missing',
          codingResult: codingResult({
            changedFiles: ['src/shipping/rate.ts', 'src/shipping/rate.test.ts'],
            evidenceFiles: ['src/shipping/rate.ts', 'src/shipping/rate.test.ts'],
            verification: { status: 'not-requested', reason: 'post-write check missing' },
            requiredEvidence: ['shipping post-write verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit',
              target: 'src/shipping/rate.ts',
              changedFiles: ['src/shipping/rate.ts', 'src/shipping/rate.test.ts'],
            },
          }),
        }
      }
      const engine = new QueryEngine({
        runAgent,
        executeRuntimeBatch: workspace.batchExecutor({
          edit: {
            'src/shipping/rate.ts': 'export const rate = 2;\n',
            'src/shipping/rate.test.ts': 'import { rate } from "./rate";\nif (rate !== 2) throw new Error("bad rate");\n',
          },
        }),
      } as any)

      const result = await engine.submitMessage('sess_shipping_not_proven_unseen', 'update shipping rate but require post-write verification', {
        maxTurns: 3,
      })

      expect(result.status).toBe('stopped_not_proven')
      expect(result.stopReason).toContain('proof gap')
      expect(result.codingResult?.changedFiles).toEqual([
        'src/shipping/rate.ts',
        'src/shipping/rate.test.ts',
      ])
    } finally {
      await workspace.dispose()
    }
  })
})

async function createWorkspace(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'normal-task-runtime-'))
  const executionService = createDefaultExecutionService()
  for (const [relativePath, content] of Object.entries(files)) {
    await executionService.writeTextFile({
      absolutePath: join(root, relativePath),
      content,
    })
  }
  return {
    root,
    batchExecutor: (config: {
      readonly edit?: Record<string, string>
      readonly repair?: Record<string, string>
      readonly artifact?: Record<string, string>
      readonly verifyCommand?: readonly [string, readonly string[]]
    }) => async ({ batch }: any) => {
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
      const commandResult = item.actionKind === 'verify' && config.verifyCommand
        ? await executionService.runCommand({
            command: config.verifyCommand[0],
            args: config.verifyCommand[1],
            cwd: root,
            reportSafeCommand: [config.verifyCommand[0], ...config.verifyCommand[1]].join(' '),
            workspaceRoot: root,
            authority: {
              mode: 'approved-for-write',
              source: 'policy',
              reason: 'Focused disposable workspace verification.',
            },
            caller: 'normal-task-runtime-test',
            operationKind: 'command.run',
            reason: 'Focused disposable workspace verification.',
            policy: {
              authorityRequirement: 'approval-required',
              decisionId: 'normal-task-runtime',
              decisionStatus: 'approved',
              policySource: 'test',
              redactionStatus: 'report-safe',
              reportSafeSummary: 'Focused disposable workspace verification.',
              terminalSuccessClaim: false,
              notProvenClaims: ['command-result-is-not-task-success'],
            },
          })
        : undefined

      return {
        batchId: batch.batchId,
        results: [{
          toolId: item.toolId,
          actionKind: item.actionKind,
          coveredFiles: item.actionKind === 'verify' ? item.coveredFiles : [],
          affectedPaths: item.targetPaths,
          exitStatusClass: commandResult && commandResult.exitCode !== 0 ? 'failure' : 'success',
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
      absolutePath: join(root, relativePath),
      content,
    })
  }
}

function nextRoleAfter(role: 'planner' | 'coder' | 'reviewer') {
  return role === 'planner' || role === 'reviewer' ? 'coder' : 'reviewer'
}

function runtimeSeedWithTaskState(
  sessionId: string,
  taskState: QueryRuntimeTaskState,
) {
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
    sharedContext: {
      sessionId,
      initialPrompt: 'continue restored task state',
      notes: [],
      handoffs: [],
    },
    transcript: [],
    visitedTransitions: [],
    recoveryBoundary: 'completed-turn-reentry' as const,
    truthBoundary: {
      source: 'durable-replay' as const,
      normalizedEventCount: 0,
      pairedTurnCount: 0,
      policyEvidence: ['policy:completed-turn-only'] as const,
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
  taskKind?: CodingResultSummary['taskKind']
  changedFiles?: string[]
  failedFiles?: Array<{ path: string; reason: string }>
  evidenceFiles?: string[]
  repair?: Partial<CodingResultSummary['repair']>
  verification?: Partial<CodingResultSummary['verification']>
  verifiedFiles?: string[]
  requiredEvidence?: string[]
  observedEvidence?: string[]
  lastAction?: CodingResultSummary['lastActionResultSeed']
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
      reason: 'Evidence files supplied by focused normal runtime diagnostic.',
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
      status: input.taskKind === 'continuation' ? 'resumed' : 'first-pass-success',
      attempts: input.taskKind === 'continuation' ? 1 : 0,
      evidence: input.taskKind === 'continuation' ? ['restored task state'] : [],
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
