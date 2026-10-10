import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { SshProfile } from '../../runtime/execution/ssh/model.js';
import type { SshClient } from '../../runtime/execution/ssh/client.js';
import type { JobStore } from '../../workflow/jobs/store.js';
import type { JobService } from '../../workflow/jobs/service.js';

export interface SshComposition {
  readonly context: ShellRuntimeContext;
  readonly manager: SessionManager;
  readonly runtime: ShellSessionRuntime;
  readonly gate: (tool?: string) => ToolGateOptions;
  readonly jobs: JobStore;
  readonly report?: (message: string) => void;
  readonly operations: Map<AbortController, Promise<void>>;
  readonly submissions: Set<Promise<unknown>>;
  closing?: boolean;
  cancellationRevision: number;
  profile?: SshProfile;
  client?: SshClient;
  service?: JobService;
  pending?: AbortController;
}
