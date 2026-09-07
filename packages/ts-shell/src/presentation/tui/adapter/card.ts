import { renderBlock } from "../transcript/blocks.js";
import type { PointerEvent, PointerResult, ViewComponent } from "./contract.js";
import { toBlock, type AgentMessage } from "./model.js";

export interface ToolCardState {
  readonly title?: string;
  readonly detail?: string;
  readonly text: string;
  readonly diff?: string;
  readonly status?: AgentMessage["status"];
  readonly collapsed?: boolean;
  readonly finalized?: boolean;
}

export class ToolCard implements ViewComponent {
  private state: ToolCardState;

  constructor(state: ToolCardState) {
    this.state = state;
  }

  setState(state: ToolCardState): void {
    this.state = state;
  }

  get current(): ToolCardState {
    return this.state;
  }

  toggleCollapsed(): void {
    this.state = { ...this.state, collapsed: !(this.state.collapsed ?? false) };
  }

  handlePointer(event: PointerEvent): PointerResult | undefined {
    if (event.kind !== "click" && event.kind !== "press") return undefined;
    if (event.kind === "press") return { handled: true, focus: true };
    this.toggleCollapsed();
    return { handled: true };
  }

  invalidate(): void {}

  render(width: number): string[] {
    const message: AgentMessage = {
      kind: "tool",
      text: this.state.text,
      title: this.state.title,
      detail: this.state.detail,
      diff: this.state.diff,
      status: this.state.status,
      collapsed: this.state.collapsed,
      finalized: this.state.finalized,
    };
    return [...renderBlock(toBlock(message), Math.max(1, Math.floor(width)))];
  }
}
