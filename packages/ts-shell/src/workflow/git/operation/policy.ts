import type { SessionMessage } from '../../../session/schema/sessionMessage.js';

/** The native review request narrows this run through the existing plan gate. */
export function gitRequestMode(prompt: SessionMessage | undefined): 'plan' | undefined {
  return prompt?.role === 'user' && prompt.metadata?.source === 'git-review' ? 'plan' : undefined;
}
