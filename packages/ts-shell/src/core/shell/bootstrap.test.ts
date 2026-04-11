import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { StreamingRenderer } from '../../renderer/StreamingRenderer.js'
import { SessionManager } from '../../session/SessionManager.js'
import { getWorkflowGitContext } from '../../workflow/gitContext.js'
import { bootstrapShellRuntime } from './bootstrap.js'

describe('shell bootstrap', () => {
  const originalUserProfile = process.env.USERPROFILE
  let fakeHome = ''

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-bootstrap-'))
    process.env.USERPROFILE = fakeHome
  })

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile
    fs.rmSync(fakeHome, { recursive: true, force: true })
  })

  it('returns ordered bootstrap phases and runtime context', () => {
    const sessionManager = new SessionManager()
    const result = bootstrapShellRuntime({
      cwd: process.cwd(),
      runtimeConfig: getRuntimeConfig(process.cwd()),
      gitContext: getWorkflowGitContext(process.cwd()),
      sessionManager,
      renderer: new StreamingRenderer(),
    })

    expect(result.phases).toEqual([
      'fast-path-parse',
      'config-load',
      'workspace-session-resolution',
      'background-services-start',
      'interactive-shell-ready',
    ])
    expect(result.context.session.id).toContain('sess_')
    expect(result.context.cwd).toBe(process.cwd())
    expect(result.context.originalCwd).toBe(process.cwd())
    expect(result.context.projectRoot).toBeTruthy()
    expect(result.context.activeSession.sessionId).toBe(result.context.session.id)
  })
})
