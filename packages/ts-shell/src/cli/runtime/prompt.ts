import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { researchTools } from '../../research/run/tools.js';
import { gitFeatureTools } from './git.js';
import { securityFeatureTools } from './security.js';
import { sshFeatureTools } from './ssh.js';
import { evaluationFeatureTools } from './evaluation.js';
import type { ContextEntry } from '../../context/attachment/entry.js';
import { renderContextEntry } from '../../context/attachment/entry.js';
import type { ToolDefinition } from '../../tools/types.js';

/** Ordinary foreground capability roster; workflow-specific tools are supplied by their owner. */
export function foregroundTools(context: ShellRuntimeContext, research: readonly ToolDefinition[] = researchTools(),
  director: readonly ToolDefinition[] = []) {
  return [...research, ...gitFeatureTools(context), ...securityFeatureTools(context), ...sshFeatureTools(context),
    ...evaluationFeatureTools(context), ...director];
}

export function promptWithContext(prompt: string, entries: readonly ContextEntry[]): string {
  return entries.length ? [entries.map(renderContextEntry).join('\n\n'), '<user_request>', prompt, '</user_request>'].join('\n\n') : prompt;
}
