import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CollaborationClient } from '../../collaboration/client/service.js';
import type { CollaborationHost } from '../../collaboration/client/host.js';
import type { Acceptance, Binding, Proposal } from '../../collaboration/contract/model.js';
import type { CollaborationGuest } from '../../collaboration/client/guest.js';

export interface CollaborationComposition {
  context: ShellRuntimeContext; runtime: ShellSessionRuntime; manager: SessionManager; gate: () => ToolGateOptions;
  client?: CollaborationClient; host?: CollaborationHost; guest?: CollaborationGuest; pending?: AbortController;
  bound?: Binding; proposals: readonly Omit<Proposal, 'text'>[]; accepted: Map<string, Acceptance>;
  active?: { acceptance: Acceptance; controller: AbortController; expiresAt: number; sourceEntryId?: string };
}
