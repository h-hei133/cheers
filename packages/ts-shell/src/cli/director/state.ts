import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { DirectorOwner } from './model.js';

export const liveDirectors = new WeakMap<ShellRuntimeContext, DirectorOwner>();
