import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { forgetSessionTodos, getSessionTodos, setSessionTodos } from '../commands/todoCommandRuntime.js'
import { applyShellSubstrateTransition, createSessionRootMismatchDiagnostic, createShellRuntimeContext, createWorkspaceAttachSwitchDiagnostic, resolveRootBindingDiagnostics, switchActiveSession } from './runtimeContext.js'

describe('shell runtime context', () => {
  it('keeps case-distinct binding diagnostics on case-sensitive platforms', () => {
    const projectRoot = path.resolve('CaseRoot')
    const distinctRoot = path.resolve('caseroot')
    const diagnostics = resolveRootBindingDiagnostics({
      projectRoot, rootMode: 'git-root', requestedWorkspaceRoot: distinctRoot,
      targetPathBase: distinctRoot, gitRoot: projectRoot,
      gitContext: { insideGit: true, root: projectRoot, branch: 'main', isClean: true },
    })
    const codes = diagnostics.map(diagnostic => diagnostic.code)
    expect(codes.includes('root-binding-target-base-mismatch')).toBe(process.platform !== 'win32')
    expect(codes.includes('root-binding-git-auto-upgrade')).toBe(process.platform !== 'win32')
  })

  it('switches active session atomically', () => {
    const context = createShellRuntimeContext({
      cwd: 'D:/repo',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo',
      rootMode: 'git-root',
      targetPathBase: 'D:/repo',
      gitRoot: 'D:/repo',
      runtimeConfig: {
        ...getRuntimeConfig("D:/repo"),
        provider: 'openai',
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
      gitContext: {
        insideGit: true,
        branch: 'main',
        isClean: true,
        root: 'D:/repo',
      },
      session: {
        id: 'sess_old',
        createdAt: 'now',
        updatedAt: 'now',
        status: 'active',
        turns: [],
      },
    })

    const oldSession = context.session
    const oldTodos = [{ id: 1, text: 'restore me', status: 'pending' as const }]
    oldSession.turns.push({ role: 'tool', content: 'saved', metadata: { todo: oldTodos } })
    setSessionTodos(oldSession.id, oldTodos)
    switchActiveSession(context, oldSession)
    expect(getSessionTodos(oldSession.id)).toEqual(oldTodos)
    applyShellSubstrateTransition(context, { cwd: 'D:/repo/subdir' })
    expect(getSessionTodos(oldSession.id)).toEqual(oldTodos)

    setSessionTodos('sess_new', [{ id: 1, text: 'stale', status: 'pending' }])
    switchActiveSession(context, {
      id: 'sess_new',
      createdAt: 'later',
      updatedAt: 'later',
      status: 'active',
      turns: [],
    }, 'D:/repo/worktree-a')

    expect(context.session.id).toBe('sess_new')
    expect(context.activeSession).toEqual({
      sessionId: 'sess_new',
      sessionProjectDir: 'D:/repo/worktree-a',
    })
    expect(getSessionTodos(oldSession.id)).toEqual([])
    expect(getSessionTodos('sess_new')).toEqual([])
    switchActiveSession(context, oldSession)
    expect(getSessionTodos(oldSession.id)).toEqual(oldTodos)
    forgetSessionTodos(oldSession.id)
  })

  it('applies workspace and session substrate transitions atomically', () => {
    const context = createShellRuntimeContext({
      cwd: 'D:/repo',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo',
      rootMode: 'git-root',
      targetPathBase: 'D:/repo',
      gitRoot: 'D:/repo',
      runtimeConfig: {
        ...getRuntimeConfig("D:/repo"),
        provider: 'openai',
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
      gitContext: {
        insideGit: true,
        branch: 'main',
        isClean: true,
        root: 'D:/repo',
      },
      session: {
        id: 'sess_old',
        createdAt: 'now',
        updatedAt: 'now',
        status: 'active',
        turns: [],
      },
    })

    setSessionTodos(context.session.id, [{ id: 1, text: 'old workspace', status: 'pending' }])
    applyShellSubstrateTransition(context, {
      cwd: 'D:/repo/worktree-a',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo/worktree-a',
      rootMode: 'direct',
      targetPathBase: 'D:/repo/worktree-a',
      gitRoot: null,
      session: {
        id: 'sess_worktree',
        createdAt: 'later',
        updatedAt: 'later',
        status: 'active',
        turns: [],
      },
      sessionProjectDir: 'D:/repo/worktree-a',
    })

    expect(context.cwd).toBe('D:/repo/worktree-a')
    expect(context.originalCwd).toBe('D:/repo')
    expect(context.projectRoot).toBe('D:/repo/worktree-a')
    expect(context.rootMode).toBe('direct')
    expect(context.targetPathBase).toBe('D:/repo/worktree-a')
    expect(context.gitRoot).toBeNull()
    expect(context.session.id).toBe('sess_worktree')
    expect(getSessionTodos('sess_old')).toEqual([])
    expect(context.activeSession).toEqual({
      sessionId: 'sess_worktree',
      sessionProjectDir: 'D:/repo/worktree-a',
    })
  })

  it('invalidates a prompt identity when the same session substrate changes', () => {
    const context = createShellRuntimeContext({
      cwd: 'D:/repo',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo',
      rootMode: 'git-root',
      targetPathBase: 'D:/repo',
      gitRoot: 'D:/repo',
      runtimeConfig: getRuntimeConfig('D:/repo'),
      gitContext: { insideGit: true, branch: 'main', isClean: true, root: 'D:/repo' },
      session: {
        id: 'sess_same',
        createdAt: 'now',
        updatedAt: 'now',
        status: 'active',
        turns: [],
      },
    })
    context.promptIdentity = { schemaDigest: 'old-schema', systemDigest: 'old-system' }

    applyShellSubstrateTransition(context, { cwd: 'D:/repo/packages/app' })

    expect(context.promptIdentity).toBeUndefined()
  })

  it('falls back to project root when legacy runtime context lacks target path base', () => {
    const context = createShellRuntimeContext({
      cwd: 'D:/repo',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo',
      rootMode: 'git-root',
      targetPathBase: 'D:/repo',
      gitRoot: 'D:/repo',
      runtimeConfig: {
        ...getRuntimeConfig("D:/repo"),
        provider: 'openai',
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
      gitContext: {
        insideGit: true,
        branch: 'main',
        isClean: true,
        root: 'D:/repo',
      },
      session: {
        id: 'sess_old',
        createdAt: 'now',
        updatedAt: 'now',
        status: 'active',
        turns: [],
      },
    })
    delete (context as { targetPathBase?: string }).targetPathBase

    applyShellSubstrateTransition(context, {
      projectRoot: 'D:/repo',
    })

    expect(context.targetPathBase).toBe('D:/repo')
    expect(
      context.rootBindingDiagnostics.some(
        (diagnostic) => diagnostic.code === 'root-binding-target-base-mismatch',
      ),
    ).toBe(false)
  })

  it('reports root binding diagnostics without warning on normal bindings', () => {
    const gitRootDiagnostics = resolveRootBindingDiagnostics({
      projectRoot: 'D:/repo',
      rootMode: 'git-root',
      requestedWorkspaceRoot: 'D:/repo/packages/app',
      targetPathBase: 'D:/repo',
      gitRoot: 'D:/repo',
      gitContext: {
        insideGit: true,
        branch: 'main',
        isClean: true,
        root: 'D:/repo',
      },
    })

    expect(gitRootDiagnostics).toEqual([
      expect.objectContaining({
        code: 'root-binding-git-auto-upgrade',
        severity: 'info',
      }),
    ])

    const directDiagnostics = resolveRootBindingDiagnostics({
      projectRoot: 'D:/workspace',
      rootMode: 'direct',
      requestedWorkspaceRoot: 'D:/workspace',
      targetPathBase: 'D:/workspace',
      gitRoot: null,
      gitContext: {
        insideGit: false,
        branch: null,
        isClean: null,
        root: null,
      },
    })

    expect(directDiagnostics).toEqual([])
  })

  it('warns on inconsistent root binding fields', () => {
    const diagnostics = resolveRootBindingDiagnostics({
      projectRoot: 'D:/repo',
      rootMode: 'direct',
      requestedWorkspaceRoot: 'D:/repo',
      targetPathBase: 'D:/repo/packages/app',
      gitRoot: 'D:/repo',
      gitContext: {
        insideGit: true,
        branch: 'main',
        isClean: true,
        root: 'D:/repo',
      },
    })

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'root-binding-direct-gitroot-mismatch',
        severity: 'warning',
      }),
      expect.objectContaining({
        code: 'root-binding-target-base-mismatch',
        severity: 'warning',
      }),
    ])
  })

  it('reports blocked diagnostics for session root mismatch', () => {
    const diagnostic = createSessionRootMismatchDiagnostic({
      sessionId: 'sess_other',
      sessionProjectRoot: 'D:/repo-a',
      requestedWorkspaceRoot: 'D:/repo-b/packages/app',
      resolvedProjectRoot: 'D:/repo-b',
    })

    expect(diagnostic).toEqual(
      expect.objectContaining({
        code: 'root-binding-session-mismatch',
        severity: 'blocked',
      }),
    )
    expect(diagnostic.explanation).toContain('D:/repo-a')
    expect(diagnostic.explanation).toContain('D:/repo-b/packages/app')
    expect(diagnostic.explanation).toContain('D:/repo-b')
    expect(diagnostic.nextAction).toContain('Start a new session')
  })

  it('reports warning diagnostics for explicit workspace attach switches', () => {
    const diagnostic = createWorkspaceAttachSwitchDiagnostic({
      currentProjectRoot: 'D:/repo-a',
      requestedWorkspaceRoot: 'D:/repo-b/packages/app',
      resolvedProjectRoot: 'D:/repo-b',
    })

    expect(diagnostic).toEqual(
      expect.objectContaining({
        code: 'root-binding-workspace-switch',
        severity: 'warning',
      }),
    )
    expect(diagnostic.explanation).toContain('D:/repo-a')
    expect(diagnostic.explanation).toContain('D:/repo-b/packages/app')
    expect(diagnostic.explanation).toContain('D:/repo-b')
    expect(diagnostic.nextAction).toContain('/resume current')
  })
})
