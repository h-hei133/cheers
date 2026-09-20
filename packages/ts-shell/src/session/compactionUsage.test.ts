import { describe, expect, it, vi } from 'vitest'
import type { AgentMessage } from '../core/agent/state.js'
import { planCompaction } from './compaction.js'

const u = (c: string): AgentMessage => ({ role: 'user', content: c })
const a = (c: string): AgentMessage => ({ role: 'assistant', content: c })

describe('measured usage drives the trigger', () => {
  it('compacts when the provider reports a full context even though the text is small', () => {
    const messages: AgentMessage[] = []
    for (let i = 0; i < 4; i += 1) messages.push(u(`q${i}`), a(`a${i}`))

    // Text alone would never cross the threshold.
    const estimatedOnly = planCompaction(messages, { contextWindow: 64_000, reserveTokens: 8_000 })
    console.log('estimate-only plan:', JSON.stringify(estimatedOnly))

    // The provider says the last prompt cost 60k of a 64k window.
    const measured = vi.fn(() => 60_000)
    const withUsage = planCompaction(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      measureContextTokens: measured,
    })
    console.log('measured plan:', JSON.stringify(withUsage))

    expect(estimatedOnly).toBeUndefined()
    expect(withUsage).not.toBeUndefined()
    expect(messages[withUsage!.cut].role).toBe('user')
  })
})
