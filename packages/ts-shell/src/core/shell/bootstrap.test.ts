import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { StreamingRenderer } from '../../renderer/StreamingRenderer.js'
import { SessionManager } from '../../session/SessionManager.js'
import { getWorkflowGitContext } from '../../workflow/gitContext.js'
import { bootstrapShellRuntime } from './bootstrap.js'
import { SessionBootstrapError } from './bootstrap.js'

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
      launchCwd: process.cwd(),
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
    const normalizedCwd = path.resolve(process.cwd())
    const expectedProjectRoot = path.resolve(
      getWorkflowGitContext(process.cwd()).root ?? process.cwd(),
    )
    const normalizedProjectRoot = path.resolve(result.context.projectRoot)
    expect(result.context.projectRoot).toBeTruthy()
    expect(normalizedProjectRoot).toBe(expectedProjectRoot)
    expect(path.resolve(result.context.cwd)).toBe(normalizedProjectRoot)
    expect(path.resolve(result.context.originalCwd)).toBe(normalizedCwd)
    expect(path.resolve(result.context.session.projectRoot)).toBe(normalizedProjectRoot)
    expect(result.context.activeSession.sessionId).toBe(result.context.session.id)
  })

  it('binds runtime to attached target project while preserving launch cwd', () => {
    const launchDir = fakeHome
    const targetDir = fs.mkdtempSync(path.join(fakeHome, 'attached-target-'))
    const sessionManager = new SessionManager()
    const result = bootstrapShellRuntime({
      cwd: targetDir,
      launchCwd: launchDir,
      runtimeConfig: getRuntimeConfig(targetDir),
      gitContext: getWorkflowGitContext(targetDir),
      sessionManager,
      renderer: new StreamingRenderer(),
    })

    expect(path.resolve(result.context.projectRoot)).toBe(path.resolve(targetDir))
    expect(path.resolve(result.context.cwd)).toBe(path.resolve(targetDir))
    expect(path.resolve(result.context.session.projectRoot)).toBe(path.resolve(targetDir))
    expect(path.resolve(result.context.originalCwd)).toBe(path.resolve(launchDir))
    expect(result.context.activeSession.sessionProjectDir).toBe(result.context.projectRoot)
  })

  it('fails fast when explicit --session-id is missing instead of creating implicit session', () => {
    const sessionManager = new SessionManager()
    expect(() =>
      bootstrapShellRuntime({
        cwd: process.cwd(),
        launchCwd: process.cwd(),
        runtimeConfig: getRuntimeConfig(process.cwd()),
        gitContext: getWorkflowGitContext(process.cwd()),
        sessionManager,
        renderer: new StreamingRenderer(),
        requestedSessionId: 'sess_missing_explicit_id',
      }),
    ).toThrowError(SessionBootstrapError)
  })

  it('allows explicit session reuse when requested root is a child path of session root', () => {
    const sessionManager = new SessionManager()
    const sessionRoot = fs.mkdtempSync(path.join(fakeHome, 'session-root-'))
    const nestedEntry = path.join(sessionRoot, 'nested', 'entry')
    fs.mkdirSync(nestedEntry, { recursive: true })
    const session = sessionManager.createNew(sessionRoot)

    const result = bootstrapShellRuntime({
      cwd: nestedEntry,
      launchCwd: nestedEntry,
      runtimeConfig: getRuntimeConfig(nestedEntry),
      gitContext: getWorkflowGitContext(nestedEntry),
      sessionManager,
      renderer: new StreamingRenderer(),
      requestedSessionId: session.id,
    })

    expect(path.resolve(result.context.session.projectRoot)).toBe(path.resolve(sessionRoot))
    expect(path.resolve(result.context.projectRoot)).toBe(path.resolve(sessionRoot))
    expect(result.context.session.id).toBe(session.id)
  })

  it('blocks explicit session reuse when requested root is a different project root', () => {
    const sessionManager = new SessionManager()
    const projectA = fs.mkdtempSync(path.join(fakeHome, 'project-a-'))
    const projectB = fs.mkdtempSync(path.join(fakeHome, 'project-b-'))
    const session = sessionManager.createNew(projectA)

    expect(() =>
      bootstrapShellRuntime({
        cwd: projectB,
        launchCwd: projectB,
        runtimeConfig: getRuntimeConfig(projectB),
        gitContext: getWorkflowGitContext(projectB),
        sessionManager,
        renderer: new StreamingRenderer(),
        requestedSessionId: session.id,
      }),
    ).toThrowError(SessionBootstrapError)
  })

  it('allows explicit session root migration only when migration flag is set', () => {
    const sessionManager = new SessionManager()
    const projectA = fs.mkdtempSync(path.join(fakeHome, 'project-a-migrate-'))
    const projectB = fs.mkdtempSync(path.join(fakeHome, 'project-b-migrate-'))
    const session = sessionManager.createNew(projectA)

    const result = bootstrapShellRuntime({
      cwd: projectB,
      launchCwd: projectB,
      runtimeConfig: getRuntimeConfig(projectB),
      gitContext: getWorkflowGitContext(projectB),
      sessionManager,
      renderer: new StreamingRenderer(),
      requestedSessionId: session.id,
      allowSessionRootMigration: true,
    })

    expect(result.context.session.id).toBe(session.id)
    expect(path.resolve(result.context.projectRoot)).toBe(path.resolve(projectB))
    expect(path.resolve(result.context.session.projectRoot)).toBe(path.resolve(projectB))
    expect(path.resolve(sessionManager.resume(session.id).projectRoot)).toBe(
      path.resolve(projectB),
    )
  })
})
