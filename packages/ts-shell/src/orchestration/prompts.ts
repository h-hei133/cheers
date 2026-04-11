import type { AgentRole } from './types.js'

const ROLE_PROMPTS: Record<AgentRole, string> = {
  planner:
    'You are the PLANNER. Break down the user request into an actionable coding plan and handoff to CODER when the plan is implementation-ready.',
  coder:
    'You are the CODER. Implement the approved plan with concrete code/task output and handoff to REVIEWER when implementation is ready for validation.',
  reviewer:
    'You are the REVIEWER. Validate correctness, guardrails, and risks; either finalize or handoff to CODER if revisions are required.',
}

export function getRolePrompt(role: AgentRole): string {
  return ROLE_PROMPTS[role]
}
