import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runMvpIntegratedFlow } from './runMvpIntegratedFlow.js'
import { safeRemoveDir } from '../test-utils/cleanup.js'

describe('MVP integrated end-to-end flow (T10)', () => {
  const workspaceRoot = path.join(os.tmpdir(), 'private-agents-t10-workspace')

  afterEach(async () => {
    await safeRemoveDir(workspaceRoot)
  })

  it('covers prompt -> handoff -> tool approval -> streamed result', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({ name: 't10-workspace' }, null, 2),
      'utf8',
    )

    const result = await runMvpIntegratedFlow({
      sessionId: 'sess_t10_happy',
      prompt: 'Need approval to run tool-assisted implementation',
      workspaceRoot,
      escalationDecision: 'allow-once',
      maxTurns: 6,
    })

    expect(result.status).toBe('completed')
    expect(result.transcript.map(turn => turn.role)).toEqual([
      'planner',
      'coder',
      'reviewer',
    ])

    const mergedNotes = result.sharedContext.notes.join('\n')
    expect(mergedNotes).toContain('workflow: branch=')
    expect(mergedNotes).toContain('mcp: clients=')
    expect(mergedNotes).toContain('read(package.json)')
    expect(mergedNotes).toContain('bash(node --version)')

    expect(result.transcript[0]?.content).toContain('PLANNER:')
    expect(result.transcript[1]?.content).toContain('CODER:')
    expect(result.transcript[2]?.content).toContain('REVIEWER:')
    expect(result.finalOutput).toContain('REVIEWER:')
  }, 15000)

  it('denies forbidden operation and safely continues with fallback path', async () => {
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true })
    await fs.writeFile(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({ name: 't10-workspace' }, null, 2),
      'utf8',
    )
    await fs.writeFile(path.join(workspaceRoot, 'src', 'index.ts'), 'export {}\n', 'utf8')

    const result = await runMvpIntegratedFlow({
      sessionId: 'sess_t10_forbidden',
      prompt: 'Run forbidden operation but continue safely after denied escalation',
      workspaceRoot,
      escalationDecision: 'deny',
      maxTurns: 6,
    })

    expect(result.status).toBe('completed')
    expect(result.transcript.map(turn => turn.role)).toEqual([
      'planner',
      'coder',
      'reviewer',
    ])

    const mergedNotes = result.sharedContext.notes.join('\n')
    expect(mergedNotes).toContain('workflow: branch=')
    expect(mergedNotes).toContain('mcp: clients=')
    expect(mergedNotes).toContain('tool: denied bash(node --version) -> Escalation denied by user.')
    expect(mergedNotes).toContain('safe fallback glob(.ts)')
    expect(result.finalOutput).toContain('REVIEWER:')
  }, 15000)
})
