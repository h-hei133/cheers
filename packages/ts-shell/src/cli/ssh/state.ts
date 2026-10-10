import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { SshComposition } from './model.js';
export const sshHosts = new WeakMap<ShellRuntimeContext, SshComposition>();
