import { describe, expect, it } from 'vitest'
import { getWorkflowGitContext } from './gitContext.js'

describe('workflow git context', () => {
  it('detects current repository git state', () => {
    const context = getWorkflowGitContext(process.cwd())
    expect(context.insideGit).toBe(true)
    expect(context.branch).toBeTruthy()
    expect(context.root).toBeTruthy()
  })
})
