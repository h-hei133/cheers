import type { PermissionScope } from "../../../cli/approval/permissionScope.js";
import type { EscalationDecision } from "../../../sandbox/escalationWorkflow.js";
import type { StatusFacts, StatusItemId } from "../chrome/items.js";
import type { Block, ToolStatus } from "../transcript/blocks.js";
import type { TurnActivity } from "../transcript/live.js";

export type AgentMessageKind = "user" | "assistant" | "thinking" | "tool" | "command" | "notice" | "error";

export interface AgentMessage {
  readonly kind: AgentMessageKind;
  readonly text: string;
  readonly title?: string;
  readonly detail?: string;
  readonly diff?: string;
  readonly status?: ToolStatus;
  readonly collapsed?: boolean;
  readonly finalized?: boolean;
}

export interface PermissionRequest {
  readonly title: string;
  readonly detail?: string;
  readonly scope: PermissionScope;
}

export type PermissionAnswer = EscalationDecision;

export interface SessionFacts {
  readonly facts: StatusFacts;
  readonly items: readonly StatusItemId[];
  readonly activity: TurnActivity | undefined;
  readonly busy: boolean;
  /** Wall-clock instant the activity row is drawn for; defaults to now. */
  readonly now?: number;
}

export function toBlock(message: AgentMessage): Block {
  switch (message.kind) {
    case "user":
      return { kind: "user", text: message.text, finalized: message.finalized ?? true };
    case "assistant":
      return { kind: "assistant", text: message.text, finalized: message.finalized ?? false };
    case "thinking":
      return {
        kind: "thinking",
        text: message.text,
        collapsed: message.collapsed ?? true,
        finalized: message.finalized ?? false,
      };
    case "tool":
      return {
        kind: "tool",
        title: message.title,
        detail: message.detail,
        text: message.text,
        diff: message.diff,
        status: message.status ?? (message.finalized === true ? "ok" : "running"),
        collapsed: message.collapsed,
        finalized: message.finalized ?? false,
      };
    case "command":
      return { kind: "command", title: message.title, text: message.text, finalized: message.finalized ?? true };
    case "error":
      return { kind: "error", text: message.text, finalized: true };
    case "notice":
    default:
      return { kind: "notice", text: message.text, finalized: true };
  }
}
