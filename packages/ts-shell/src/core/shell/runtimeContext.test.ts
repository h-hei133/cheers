import { describe, expect, it } from 'vitest'
import { applyShellSubstrateTransition, createShellRuntimeContext, switchActiveSession } from './runtimeContext.js'

describe('shell runtime context', () => {
  it('switches active session atomically', () => {
    const context = createShellRuntimeContext({
      cwd: 'D:/repo',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo',
      runtimeConfig: {
        provider: 'openai',
        daemonEnabled: true,
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
  })

  it('applies workspace and session substrate transitions atomically', () => {
    const context = createShellRuntimeContext({
      cwd: 'D:/repo',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo',
      runtimeConfig: {
        provider: 'openai',
        daemonEnabled: true,
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

    applyShellSubstrateTransition(context, {
      cwd: 'D:/repo/worktree-a',
      originalCwd: 'D:/repo',
      projectRoot: 'D:/repo/worktree-a',
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
    expect(context.session.id).toBe('sess_worktree')
    expect(context.activeSession).toEqual({
      sessionId: 'sess_worktree',
      sessionProjectDir: 'D:/repo/worktree-a',
    })
  })
})
