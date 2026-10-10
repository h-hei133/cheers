import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { Director } from '../../workflow/director/model.js';
import type { AgentJob } from '../../workflow/jobs/agent/model.js';
import type { JobsComposition } from '../jobs/model.js';

export interface DirectorOwner {
  readonly host: JobsComposition;
  readonly row: Director;
  readonly admission: () => string | undefined;
  readonly config: (original: RuntimeConfig) => RuntimeConfig;
  readonly reserved: (job: AgentJob) => void;
  readonly close: () => Promise<string>;
}
