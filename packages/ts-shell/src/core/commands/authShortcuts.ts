import type { CommandContext, LocalCommandResult } from './types.js';
import { runConnectCommand } from './connectCommandRuntime.js';

/** Exact auth-owner aliases; login/logout never duplicate credential mutation. */
export function runLoginShortcut(args: string[], context: CommandContext): Promise<LocalCommandResult> { return runConnectCommand(['login', ...args], context); }
export function runLogoutShortcut(args: string[], context: CommandContext): Promise<LocalCommandResult> { return runConnectCommand(['logout', ...args], context); }
