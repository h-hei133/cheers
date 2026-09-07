import { renderBlock } from "../transcript/blocks.js";
import type { ViewComponent } from "./contract.js";
import { toBlock, type AgentMessage } from "./model.js";

export class Message implements ViewComponent {
  private message: AgentMessage;

  constructor(message: AgentMessage) {
    this.message = message;
  }

  setMessage(message: AgentMessage): void {
    this.message = message;
  }

  get current(): AgentMessage {
    return this.message;
  }

  toggleCollapsed(): void {
    // Match toBlock defaults: thinking starts folded, every other kind
    // starts expanded. A fixed default would make the first toggle on a
    // tool message a no-op.
    const folded = this.message.collapsed ?? this.message.kind === "thinking";
    this.message = { ...this.message, collapsed: !folded };
  }

  invalidate(): void {}

  render(width: number): string[] {
    return [...renderBlock(toBlock(this.message), Math.max(1, Math.floor(width)))];
  }
}

export function userMessage(text: string): Message {
  return new Message({ kind: "user", text, finalized: true });
}

export function assistantMessage(text: string, finalized = false): Message {
  return new Message({ kind: "assistant", text, finalized });
}

export function thinkingMessage(text: string, collapsed = true, finalized = false): Message {
  return new Message({ kind: "thinking", text, collapsed, finalized });
}

export function noticeMessage(text: string): Message {
  return new Message({ kind: "notice", text, finalized: true });
}

export function errorMessage(text: string): Message {
  return new Message({ kind: "error", text, finalized: true });
}
