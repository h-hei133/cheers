import type { AgentMessage } from '../core/agent/state.js';
import type { ImageContent } from '../model-adapters/multimodal.js';
import type { PermissionScope } from '../cli/approval/permissionScope.js';
import type { WorkspaceRoot } from '../core/workspace/model.js';
import { environmentLine } from './prompt.js';

export interface OpeningInput {
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly permissionScope?: PermissionScope;
  readonly goalObjective?: string;
  readonly continuityContext?: string;
  readonly prompt: string;
  readonly attachments?: { readonly images: readonly ImageContent[] };
}

/** Dispatch and context preview use the same environment, roots and image framing. */
export function openingMessage(input: OpeningInput): AgentMessage {
  const text = [environmentLine(input.workspaceRoot, input.permissionScope, input.goalObjective),
    ...(input.workspaceRoots?.length ? [`Additional file roots (project configuration, skills and MCP still come from cwd):\n${input.workspaceRoots.map(root => `${root.access === 'write' ? 'read/write' : 'read-only'}: ${JSON.stringify(root.path)}`).join('\n')}`] : []),
    ...(input.continuityContext ? [`Recorded session facts (historical context, not current authorization):\n${input.continuityContext}`] : []),
    input.prompt,
  ].join('\n\n');
  const images = input.attachments?.images ?? [];
  return { role: 'user', content: images.length ? [{ type: 'text', text }, ...images] : text };
}
