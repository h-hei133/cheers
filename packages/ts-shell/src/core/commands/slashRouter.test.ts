import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listVisibleCommands } from './registry.js'
import { routeSlashCommand } from './slashRouter.js'

describe('slash router (W4)', () => {
  let workspaceRoot = ''

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-command-registry-'))
  })

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('routes local doctor command', async () => {
    const result = await routeSlashCommand('/doctor', { cwd: workspaceRoot })
    expect(result).toBeTruthy()
    expect(result?.kind).toBe('local')
    if (result?.kind === 'local') {
      expect(result.output).toContain('Private Coding Agents CLI Doctor')
    }
  })

  it('routes prompt resume command', async () => {
    const result = await routeSlashCommand('/resume sess_123', { cwd: workspaceRoot })
    expect(result).toBeTruthy()
    expect(result?.kind).toBe('shell-action')
    if (result?.kind === 'shell-action') {
      expect(result.action).toBe('resume-session')
      expect(result.sessionId).toBe('sess_123')
    }
  })

  it('returns a readable local error for unknown slash commands', async () => {
    const result = await routeSlashCommand('/unknown-cmd', { cwd: workspaceRoot })
    expect(result).toBeTruthy()
    expect(result?.kind).toBe('local')
    if (result?.kind === 'local') {
      expect(result.output).toContain('Unknown slash command')
    }
  })

  it('routes /cancel, /sessions, /mcp, and /help as shell actions', async () => {
    for (const [command, action] of [
      ['/cancel', 'cancel-run'],
      ['/sessions', 'list-sessions'],
      ['/mcp', 'show-mcp'],
      ['/help', 'show-help'],
    ] as const) {
      const result = await routeSlashCommand(command, { cwd: workspaceRoot })
      expect(result?.kind).toBe('shell-action')
      if (result?.kind === 'shell-action') {
        expect(result.action).toBe(action)
      }
    }
  })

  it('hides /mcp when MCP command exposure is disabled', async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.json'),
      JSON.stringify({ enableMcpTools: false }),
      'utf8',
    )

    const visible = listVisibleCommands(workspaceRoot).map(command => command.name)
    expect(visible).not.toContain('mcp')

    const routed = await routeSlashCommand('/mcp', { cwd: workspaceRoot })
    expect(routed?.kind).toBe('local')
    if (routed?.kind === 'local') {
      expect(routed.output).toContain('Unknown slash command')
    }
  })
})
