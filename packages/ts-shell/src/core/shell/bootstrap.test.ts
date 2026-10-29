import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { StreamingRenderer } from '../../presentation/terminal/streaming.js'
import { SessionManager } from '../../session/SessionManager.js'
import { getWorkflowGitContext } from '../../workflow/gitContext.js'
import { bootstrapShellRuntime } from './bootstrap.js'
import { SessionBootstrapError } from './bootstrap.js'
import { forgetSessionTodos, getSessionTodos } from '../commands/todoCommandRuntime.js'
import { projectTrust } from '../security/trust/store.js'
import { renderStartupSurface } from './startupSurfaceRenderer.js'

describe('shell bootstrap', () => {
  const originalUserProfile = process.env.USERPROFILE
  const originalHome = process.env.HOME
  let fakeHome = ''

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-bootstrap-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome
    // Repository-local TMPDIR must not make these independent projects inherit its Git root.
    vi.stubEnv('GIT_CEILING_DIRECTORIES', fakeHome)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    if (originalUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalUserProfile
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    fs.rmSync(fakeHome, { recursive: true, force: true })
  })

  it.each(['grant', 'revoke'])('reports final configuration diagnostics after trust changes before bootstrap: %s', change => {
    const workspace = path.join(fakeHome, 'workspace'); fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, '.cheers.json'), '{"maxTurns":77}');
    if (change === 'revoke') projectTrust.setProjectTrust(workspace, 'trusted');
    const runtimeConfig = getRuntimeConfig(workspace);
    projectTrust.setProjectTrust(workspace, change === 'grant' ? 'trusted' : 'untrusted');
    const renderer = new StreamingRenderer(); const lines: string[] = [];
    vi.spyOn(renderer, 'renderLine').mockImplementation(line => { lines.push(line); });
    const result = bootstrapShellRuntime({ cwd: workspace, runtimeConfig, gitContext: getWorkflowGitContext(workspace),
      sessionManager: new SessionManager(), renderer });
    expect(result.context.runtimeConfig.maxTurns).toBe(change === 'grant' ? 77 : 15);
    expect(lines.filter(line => line.startsWith('Warning: ')))
      .toEqual(result.context.runtimeConfig.configDiagnostics.map(line => `Warning: ${line}`));
    expect(lines.join(' ').includes('trust-denied')).toBe(change === 'revoke');
    expect(lines.join(' ')).not.toContain('trust-not-established');
    expect(result.lifecycleNotices.some(line => line.startsWith('Warning: '))).toBe(false);
  });

  it('reports diagnostics from the final resumed project instead of the input child project', () => {
    const workspace = path.join(fakeHome, 'workspace'); const child = path.join(workspace, 'child'); fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(workspace, '.cheers.json'), '{"maxTurns":77}');
    fs.writeFileSync(path.join(child, '.cheers.json'), '{"theme":"PRIVATE_THEME"}');
    const manager = new SessionManager(); const session = manager.createNew(workspace);
    const renderer = new StreamingRenderer(); const lines: string[] = [];
    vi.spyOn(renderer, 'renderLine').mockImplementation(line => { lines.push(line); });
    const result = bootstrapShellRuntime({ cwd: child, requestedSessionId: session.id, runtimeConfig: getRuntimeConfig(child),
      gitContext: getWorkflowGitContext(child), sessionManager: manager, renderer, emitLifecycleMessages: false });
    expect(result.context.projectRoot).toBe(workspace);
    expect(lines).toEqual([]);
    expect(result.lifecycleNotices.at(-1)).toBe(`Resumed session ${session.id}`);
    renderStartupSurface(renderer, { runtimeContext: result.context, sessionManager: manager,
      lifecycleNotices: result.lifecycleNotices, provider: 'openai', maxTurns: 15,
      executionPath: 'ts-local', stdinTransportMode: 'stream-live' });
    expect(lines).toContain(`- Session lifecycle: Resumed session ${session.id}`);
    const warnings = lines.filter(line => line.startsWith('- Warning: '));
    expect(warnings).toEqual(result.context.runtimeConfig.configDiagnostics.map(line => `- Warning: ${line}`));
    expect(warnings.join(' ')).toContain('maxTurns'); expect(warnings.join(' ')).not.toContain('theme');
  });

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
    sessionManager.addTurn(session.id, { role: 'user', content: 'Local checklist change', metadata: {
      todo: [{ id: 1, text: 'restored at startup', status: 'pending' }],
    } })
    forgetSessionTodos(session.id)

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
    expect(getSessionTodos(session.id)).toEqual([{ id: 1, text: 'restored at startup', status: 'pending' }])
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

  it.skipIf(process.platform === 'win32').each(['caseroot', 'caseroot/nested'])(
    'rejects case-distinct requested root %s without migration', requestedName => {
      const sessionManager = new SessionManager()
      const source = path.join(fakeHome, 'CaseRoot')
      const destination = path.join(fakeHome, requestedName)
      fs.mkdirSync(source, { recursive: true })
      fs.mkdirSync(destination, { recursive: true })
      const session = sessionManager.createNew(source)
      expect(() => bootstrapShellRuntime({
        cwd: destination, runtimeConfig: getRuntimeConfig(destination),
        gitContext: getWorkflowGitContext(destination), sessionManager,
        renderer: new StreamingRenderer(), requestedSessionId: session.id,
        emitLifecycleMessages: false,
      })).toThrowError(expect.objectContaining({ code: 'session-root-mismatch' }))
      expect(sessionManager.resume(session.id).projectRoot).toBe(source)
    })

  it.skipIf(process.platform === 'win32')('performs an explicit case-distinct root migration', () => {
    const sessionManager = new SessionManager()
    const source = path.join(fakeHome, 'CaseRoot')
    const destination = path.join(fakeHome, 'caseroot')
    fs.mkdirSync(source, { recursive: true })
    fs.mkdirSync(destination, { recursive: true })
    const session = sessionManager.createNew(source)
    const result = bootstrapShellRuntime({
      cwd: destination, requestedWorkspaceRoot: destination, runtimeConfig: getRuntimeConfig(destination),
      gitContext: getWorkflowGitContext(destination), sessionManager,
      renderer: new StreamingRenderer(), requestedSessionId: session.id,
      allowSessionRootMigration: true, emitLifecycleMessages: false,
    })
    expect(result.context.projectRoot).toBe(destination)
    expect(result.context.cwd).toBe(destination)
    expect(result.context.targetPathBase).toBe(destination)
    expect(result.context.session.projectRoot).toBe(destination)
    expect(new SessionManager().resume(session.id).projectRoot).toBe(destination)
    expect(result.lifecycleNotices.join('\n')).toContain('with migrated project root')
  })

  it.each([false, true])('rebuilds workspace binding for the migrated destination, git: %s', git => {
    const sessionManager = new SessionManager()
    const oldRoot = fs.mkdtempSync(path.join(fakeHome, 'old-bound-'))
    const newRoot = fs.mkdtempSync(path.join(fakeHome, 'new-bound-'))
    const requestedRoot = path.join(newRoot, 'nested')
    fs.mkdirSync(requestedRoot)
    if (git) execFileSync('git', ['init', '--quiet', newRoot])
    const session = sessionManager.createNew(oldRoot, {
      rootMode: git ? 'direct' : 'git-root',
      requestedWorkspaceRoot: path.join(oldRoot, 'entry'),
      targetPathBase: oldRoot,
      gitRoot: git ? null : oldRoot,
    })
    const result = bootstrapShellRuntime({
      cwd: requestedRoot,
      launchCwd: requestedRoot,
      requestedWorkspaceRoot: requestedRoot,
      runtimeConfig: getRuntimeConfig(requestedRoot),
      gitContext: getWorkflowGitContext(requestedRoot),
      sessionManager,
      renderer: new StreamingRenderer(),
      requestedSessionId: session.id,
      allowSessionRootMigration: true,
      emitLifecycleMessages: false,
    })
    const binding = {
      projectRoot: git ? newRoot : requestedRoot,
      targetPathBase: git ? newRoot : requestedRoot,
      requestedWorkspaceRoot: requestedRoot,
      rootMode: git ? 'git-root' : 'direct',
      gitRoot: git ? newRoot : null,
    }
    expect(result.context).toMatchObject(binding)
    expect(result.context.session).toMatchObject(binding)
    expect(sessionManager.getSession(session.id)).toMatchObject(binding)
    expect(result.context.rootBindingDiagnostics.some(item => item.code.endsWith('mismatch'))).toBe(false)
  })

  it('starts the handoff identity despite an unfinished current target session', () => {
    const manager = new SessionManager();
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-handoff-'));
    const unfinished = manager.createNew(projectRoot);
    manager.addTurn(unfinished.id, { role: 'user', content: 'old target prompt' });
    const input = { cwd: projectRoot, runtimeConfig: getRuntimeConfig(projectRoot), gitContext: getWorkflowGitContext(projectRoot),
      sessionManager: manager, renderer: new StreamingRenderer(), freshSessionId: 'sess_fresh_handoff', adoptCurrentSession: false };
    const result = bootstrapShellRuntime(input);
    expect(result.context.session.id).toBe('sess_fresh_handoff');
    expect(result.context.session.turns).toEqual([]);
    expect(manager.resume(unfinished.id).turns.map(turn => turn.content)).toEqual(['old target prompt']);
    expect(() => bootstrapShellRuntime({ ...input, requestedSessionId: unfinished.id })).toThrow('cannot also resume');
  });

  it('starts fresh instead of adopting the ordinary idle active current session', () => {
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

    expect(result.context.session.id).not.toBe(oldSession.id)
    expect(result.context.session.id).not.toBe(newerSession.id)
    expect(result.context.session.turns).toEqual([])
  })

  it('adopts the selected idle session only for explicit current-session adoption', () => {
    const sessionManager = new SessionManager();
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-print-adopt-'));
    const selected = sessionManager.createNew(projectRoot);
    sessionManager.addTurn(selected.id, { role: 'user', content: 'kept conversation' });
    const result = bootstrapShellRuntime({ cwd: projectRoot, runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot), sessionManager, renderer: new StreamingRenderer(), adoptCurrentSession: true });
    expect(result.context.session.id).toBe(selected.id);
    expect(result.context.session.turns.map(turn => turn.content)).toEqual(['kept conversation']);
  });

  it('starts fresh with a safe notice when recovery cannot be read, while retaining the old session', () => {
    const sessionManager = new SessionManager();
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-unreadable-recovery-'));
    const selected = sessionManager.createNew(projectRoot);
    sessionManager.addTurn(selected.id, { role: 'user', content: 'retained saved history' });
    const snapshot = vi.spyOn(sessionManager, 'getRecoverySnapshot').mockImplementation(() => { throw new Error('private fixture detail'); });
    const result = bootstrapShellRuntime({ cwd: projectRoot, runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot), sessionManager, renderer: new StreamingRenderer(), adoptCurrentSession: false,
      emitLifecycleMessages: false });
    expect(result.context.session.id).not.toBe(selected.id);
    expect(sessionManager.getSession(selected.id)?.turns.map(turn => turn.content)).toEqual(['retained saved history']);
    expect(result.lifecycleNotices).toContain('Current session recovery could not be verified; starting a fresh session. The saved session was retained.');
    expect(result.lifecycleNotices.join(' ')).not.toContain('private fixture');
    snapshot.mockRestore();
  });

  it.each(['prompt', 'turn', 'pending-tool', 'unknown-mutation'] as const)('retains actual %s recovery on an ordinary interactive launch', kind => {
    const sessionManager = new SessionManager();
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-recovery-'));
    const selected = sessionManager.createNew(projectRoot);
    if (kind === 'prompt') sessionManager.persistUserPromptBarrier(selected.id, 'finish pending prompt');
    if (kind === 'turn') sessionManager.markTurnActive(selected.id);
    if (kind === 'pending-tool') {
      sessionManager.markRunStarted(selected.id, 'finish pending tool');
      sessionManager.appendQueryEvent(selected.id, { type: 'tool.started', taskId: 'pending-write', toolName: 'write' });
    }
    if (kind === 'unknown-mutation') sessionManager.saveError(selected.id, 'Write outcome is unverified.',
      { terminalClassification: 'stopped', terminalReason: 'stopped_not_proven' });
    const before = sessionManager.getRecoverySnapshot(selected.id);
    const result = bootstrapShellRuntime({ cwd: projectRoot, runtimeConfig: getRuntimeConfig(projectRoot),
      gitContext: getWorkflowGitContext(projectRoot), sessionManager, renderer: new StreamingRenderer(), adoptCurrentSession: false,
      emitLifecycleMessages: false });
    expect(result.context.session.id).toBe(selected.id);
    expect(result.lifecycleNotices).toContain(`Resumed session ${selected.id}`);
    expect(sessionManager.getRecoverySnapshot(selected.id)).toMatchObject({ pendingPrompt: before.pendingPrompt,
      terminalReason: before.terminalReason, pendingLifecycle: before.pendingLifecycle });
  });

  it('falls back to fresh session when persisted current session cannot be resumed', () => {
    const sessionManager = new SessionManager()
    const projectRoot = fs.mkdtempSync(path.join(fakeHome, 'project-stale-current-'))
    const current = sessionManager.createNew(projectRoot)
    sessionManager.persistUserPromptBarrier(current.id, 'pending recoverable prompt')
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
      adoptCurrentSession: true,
    })

    expect(result.context.session.id).toBe(selected.id)
    expect(result.lifecycleNotices.length).toBeGreaterThan(0)
    expect(result.lifecycleNotices.at(-1)).toContain(`Resumed session ${selected.id}`)
    expect(renderSpy).not.toHaveBeenCalled()
    renderSpy.mockRestore()
  })
})
