import type { AgentMessage } from '../core/agent/state.js';
import type { ImageContent } from '../model-adapters/multimodal.js';
import type { PermissionScope } from '../core/shell/approval/scope.js';
import type { WorkspaceRoot } from '../core/workspace/model.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { environmentLine } from './prompt.js';

export interface OpeningEnvironment {
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly permissionScope?: PermissionScope;
  readonly goalObjective?: string;
}

export interface OpeningInput extends OpeningEnvironment {
  readonly continuityContext?: string;
  readonly prompt: string;
  readonly attachments?: { readonly images: readonly ImageContent[] };
}

/** Capture the environment independently of the user's text and attachments. */
export function requestEnvironment(input: OpeningEnvironment): string {
  return [environmentLine(input.workspaceRoot, input.permissionScope, input.goalObjective),
    ...(input.workspaceRoots?.length ? [`Additional file roots (project configuration, skills and MCP still come from cwd):\n${input.workspaceRoots.map(root => `${root.access === 'write' ? 'read/write' : 'read-only'}: ${JSON.stringify(root.path)}`).join('\n')}`] : []),
  ].join('\n\n');
}

function recordedEnvironment(message?: AgentMessage): string | undefined {
  if (message?.role !== 'user') return undefined;
  const environment = message.metadata?.requestEnvironment;
  return typeof environment === 'string' && environment.length <= 512 * 1024
    && environment.startsWith('[Environment Context: cwd=') ? environment : undefined;
}

/** Dispatch and context preview use the same environment, roots and image framing. */
export function openingMessage(input: OpeningInput, stored?: SessionMessage,
  capturedEnvironment?: string): AgentMessage {
  const environment = capturedEnvironment ?? requestEnvironment(input);
  const metadata = recordedEnvironment(stored) === environment ? stored?.metadata : undefined;
  const text = [...(metadata ? [] : [environment]),
    ...(input.continuityContext ? [`Recorded session facts (historical context, not current authorization):\n${input.continuityContext}`] : []),
    input.prompt,
  ].join('\n\n');
  const images = input.attachments?.images ?? [];
  return { role: 'user', content: images.length ? [{ type: 'text', text }, ...images] : text,
    ...(metadata ? { metadata } : {}) };
}

/** Render environment changes at the original prompt positions. */
export function replayEnvironment(messages: readonly AgentMessage[]): readonly AgentMessage[] {
  let previous: string | undefined;
  let framed: AgentMessage[] | undefined;
  for (const [index, message] of messages.entries()) {
    const environment = recordedEnvironment(message);
    if (!environment || environment === previous || message.role !== 'user') {
      framed?.push(message);
      continue;
    }
    previous = environment;
    const { content } = message;
    const first = typeof content === 'string' ? undefined : content[0];
    const framedContent = typeof content === 'string' ? `${environment}\n\n${content}`
      : first?.type === 'text'
        ? [{ ...first, text: `${environment}\n\n${first.text}` }, ...content.slice(1)]
        : [{ type: 'text' as const, text: environment }, ...content];
    framed ??= messages.slice(0, index);
    framed.push({ ...message, content: framedContent });
  }
  return framed ?? messages;
}
