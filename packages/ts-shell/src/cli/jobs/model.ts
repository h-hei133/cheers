import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { JobStore } from '../../workflow/jobs/store.js';
import type { LocalJournal } from '../../workflow/jobs/local/journal.js';
import type { TaskRegistry } from '../../workflow/jobs/local/registry.js';
import type { BackgroundTask } from '../../workflow/jobs/local/model.js';
import type { AgentService } from '../../workflow/jobs/agent/service.js';
import type { DagService } from '../../workflow/jobs/dag/service.js';
import type { AgentRuntimeInput } from './agent/model.js';

export interface JobsComposition {
  readonly context: ShellRuntimeContext;
  readonly manager: SessionManager;
  readonly runtime: ShellSessionRuntime;
  readonly gate: (tool?: string) => ToolGateOptions;
  readonly session: Session;
  readonly jobs: JobStore;
  readonly local: LocalJournal;
  readonly registry: TaskRegistry;
  readonly agents: AgentService;
  readonly dags: DagService;
  readonly agentRuntimeInput?: AgentRuntimeInput;
}
export interface JobsInstallation {
  closing: boolean;
  readonly manager: SessionManager;
  readonly runtime: ShellSessionRuntime;
  readonly gate: JobsComposition['gate'];
  readonly hosts: Map<string, JobsComposition>;
  readonly listeners: Set<(task: BackgroundTask) => void>;
  readonly retiring: Set<Promise<void>>;
  readonly agentRuntimeInput?: AgentRuntimeInput;
}
