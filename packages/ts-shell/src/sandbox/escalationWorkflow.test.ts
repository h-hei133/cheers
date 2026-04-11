import { describe, expect, it } from 'vitest'
import { EscalationWorkflow, type EscalationPrompt } from './escalationWorkflow.js'

describe('escalation workflow UX', () => {
  it('builds a readable prompt with risk and recommendation', async () => {
    const workflow = new EscalationWorkflow()
    let capturedPrompt: EscalationPrompt | null = null

    workflow.setPromptCallback(async prompt => {
      capturedPrompt = prompt
      return {
        promptId: prompt.id,
        decision: 'deny',
        respondedAt: Date.now(),
      }
    })

    await workflow.requestEscalation('bash', 'write', 'C:/outside/file.txt', {
      allowed: false,
      requiresEscalation: true,
      reason: 'Write outside workspace requires escalation',
      policyRule: 'default-deny-out-of-workspace',
    })

    expect(capturedPrompt).toBeTruthy()
    if (!capturedPrompt) {
      throw new Error('Prompt was not captured')
    }

    expect(capturedPrompt.title).toBe('Permission escalation required')
    expect(capturedPrompt.message).toContain('Risk level: HIGH')
    expect(capturedPrompt.message).toContain('Why it was blocked: Write outside workspace requires escalation')
    expect(capturedPrompt.message).toContain('Recommended default: Deny unless you fully trust this operation')
    expect(capturedPrompt.recommendedAction).toContain('Deny unless you fully trust this operation')
    expect(capturedPrompt.defaultOption).toBe('deny')
  })
})
