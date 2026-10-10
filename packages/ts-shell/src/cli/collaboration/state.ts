import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CollaborationComposition } from './model.js';
export const collaborationHosts = new WeakMap<ShellRuntimeContext, CollaborationComposition>();
