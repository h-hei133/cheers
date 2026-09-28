import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { StreamingRenderer } from '../../presentation/terminal/streaming.js'
import { SessionManager } from '../../session/SessionManager.js'
import { getWorkflowGitContext } from '../../workflow/gitContext.js'
import { bootstrapShellRuntime } from './bootstrap.js'
import { SessionBootstrapError } from './bootstrap.js'

describe('shell bootstrap', () => {
  const originalUserProfile = process.env.USERPROFILE
  const originalHome = process.env.HOME
  let fakeHome = ''

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-bootstrap-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome
  })

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalUserProfile
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
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

  it('explicitly rebinds compatible roots when migration flag is set', () => {
    const sessionManager = new SessionManager()
    const sessionRoot = fs.mkdtempSync(path.join(fakeHome, 'session-root-rebind-'))
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
      allowSessionRootMigration: true,
    })

    expect(result.context.session.id).toBe(session.id)
    expect(path.resolve(result.context.projectRoot)).toBe(path.resolve(nestedEntry))
    expect(path.resolve(result.context.session.projectRoot)).toBe(path.resolve(nestedEntry))
    expect(path.resolve(sessionManager.resume(session.id).projectRoot)).toBe(
      path.resolve(nestedEntry),
    )
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

  it('resumes project current session by default when no --session-id is provided', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-current-'))
    const oldSession = sessionManager.createNew(projectRoot)
    const newerSession = sessionManager.createNew(projectRoot)

    // Simulate `/sessions switch <id>` selecting an older session as current.
    sessionManager.resume(oldSession.id)

    const result = bootstrapShellRuntime({
      cwd: projectRoot,
      launchCwd: projectRoot,
      runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot),
      sessionManager,
      renderer: new StreamingRenderer(),
    })

    expect(result.context.session.id).toBe(oldSession.id)
    expect(result.context.session.id).not.toBe(newerSession.id)
  })

  it('falls back to fresh session when persisted current session cannot be resumed', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-stale-current-'))
    const current = sessionManager.createNew(projectRoot)
    const originalResume = sessionManager.resume.bind(sessionManager)
    const resumeSpy = vi
      .spyOn(sessionManager, 'resume')
      .mockImplementation((sessionId: string, projectRootArg?: string) => {
        if (sessionId === current.id) {
          throw new Error('simulated-resume-failure')
        }
        return originalResume(sessionId, projectRootArg)
      })

    const result = bootstrapShellRuntime({
      cwd: projectRoot,
      launchCwd: projectRoot,
      runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot),
      sessionManager,
      renderer: new StreamingRenderer(),
    })

    expect(result.context.session.id).not.toBe(current.id)
    expect(sessionManager.getCurrentSessionForProject(projectRoot)?.id).toBe(
      result.context.session.id,
    )
    resumeSpy.mockRestore()
  })

  it('isolates cross-root current session pointers and explains the trust boundary', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-current-root-'))
    const otherRoot = fs.mkdtempSync(path.join(fakeHome, 'project-current-other-'))
    const crossRootSession = sessionManager.createNew(otherRoot)
    sessionManager.setCurrentSessionForProject(projectRoot, crossRootSession.id)

    const result = bootstrapShellRuntime({
      cwd: projectRoot,
      launchCwd: projectRoot,
      runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot),
      sessionManager,
      renderer: new StreamingRenderer(),
      emitLifecycleMessages: false,
    })

    expect(result.context.session.id).not.toBe(crossRootSession.id)
    expect(path.resolve(result.context.projectRoot)).toBe(path.resolve(projectRoot))
    expect(path.resolve(result.context.session.projectRoot)).toBe(path.resolve(projectRoot))
    expect(sessionManager.getCurrentSessionForProject(projectRoot)?.id).toBe(
      result.context.session.id,
    )
    expect(path.resolve(sessionManager.resume(crossRootSession.id).projectRoot)).toBe(
      path.resolve(otherRoot),
    )
    expect(result.lifecycleNotices.at(-1)).toContain('Current session pointer ignored:')
    expect(result.lifecycleNotices.at(-1)).toContain(crossRootSession.id)
    expect(result.lifecycleNotices.at(-1)).toContain('is bound to')
    expect(result.lifecycleNotices.at(-1)).toContain('Starting a fresh session.')
  })

  it('explains damaged current session pointer stores without restoring stale state', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-current-damaged-'))
    const currentStorePath = path.join(fakeHome, '.cheers', 'current-session.json')
    fs.mkdirSync(path.dirname(currentStorePath), { recursive: true })
    fs.writeFileSync(currentStorePath, '{broken', 'utf8')

    const result = bootstrapShellRuntime({
      cwd: projectRoot,
      launchCwd: projectRoot,
      runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot),
      sessionManager,
      renderer: new StreamingRenderer(),
      emitLifecycleMessages: false,
    })

    expect(path.resolve(result.context.projectRoot)).toBe(path.resolve(projectRoot))
    expect(sessionManager.getCurrentSessionForProject(projectRoot)?.id).toBe(
      result.context.session.id,
    )
    expect(result.lifecycleNotices.at(-1)).toContain('Current session pointer ignored:')
    expect(result.lifecycleNotices.at(-1)).toContain(
      'Current session selection store could not be read',
    )
    expect(result.lifecycleNotices.at(-1)).toContain('Starting a fresh session.')
  })

  it('keeps explicit --session-id precedence over persisted current session pointer', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-explicit-priority-'))
    const persistedCurrent = sessionManager.createNew(projectRoot)
    const explicitTarget = sessionManager.createNew(projectRoot)

    // Re-point current pointer away from explicit target.
    sessionManager.resume(persistedCurrent.id)

    const result = bootstrapShellRuntime({
      cwd: projectRoot,
      launchCwd: projectRoot,
      runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot),
      sessionManager,
      renderer: new StreamingRenderer(),
      requestedSessionId: explicitTarget.id,
    })

    expect(result.context.session.id).toBe(explicitTarget.id)
  })

  it('captures lifecycle notices without printing when emitLifecycleMessages is false', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-lifecycle-notice-'))
    const selected = sessionManager.createNew(projectRoot)
    sessionManager.resume(selected.id)
    const renderer = new StreamingRenderer()
    const renderSpy = vi.spyOn(renderer, 'renderLine').mockImplementation(() => {})

    const result = bootstrapShellRuntime({
      cwd: projectRoot,
      launchCwd: projectRoot,
      runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot),
      sessionManager,
      renderer,
      emitLifecycleMessages: false,
    })

    expect(result.context.session.id).toBe(selected.id)
    expect(result.lifecycleNotices.length).toBeGreaterThan(0)
    expect(result.lifecycleNotices.at(-1)).toContain(`Resumed session ${selected.id}`)
    expect(renderSpy).not.toHaveBeenCalled()
    renderSpy.mockRestore()
  })
})
