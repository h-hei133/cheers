import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { JobsInstallation } from './model.js';
export const jobsInstallations = new WeakMap<ShellRuntimeContext, JobsInstallation>();
