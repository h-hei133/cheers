import type { AgentLifecycleEvent } from '../../../core/agent/events.js';
import type { SessionMessage } from '../../../session/schema/sessionMessage.js';

/** A finished native effect needs its durable result before a child can continue. */
export class AgentOutcomeProof {
  private readonly mutations = new Set<string>();
  private uncertain = false;
  get unknown(): boolean { return this.uncertain || this.mutations.size > 0; }
  admission = (): string | undefined => this.uncertain ? 'Agent mutation outcome is unverified; inspect its retained receipt.' : undefined;
  command = (result: { readonly terminationFailed?: boolean; readonly outputFailed?: boolean }): void => {
    this.uncertain ||= result.terminationFailed === true || result.outputFailed === true;
  };
  observe = (event: AgentLifecycleEvent): void => {
    if (event.type === 'tool_execution_end' && ['write', 'edit', 'apply_patch'].includes(event.toolName)) this.mutations.add(event.toolCallId);
  };
  published(message: SessionMessage): void {
    if (message.role !== 'tool' || !message.tool_call_id) return;
    if (this.mutations.has(message.tool_call_id) || typeof message.metadata?.operationId === 'string')
      this.uncertain ||= ['pending', 'partial', 'unverified', 'unknown'].includes(String(message.metadata?.status));
    this.mutations.delete(message.tool_call_id);
  }
}
