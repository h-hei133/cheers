import { truncateToWidth } from "../text/layout.js";
import { componentTheme } from "./theme.js";
import type { PermissionRequest } from "./model.js";
import type { EscalationDecision } from "../../../sandbox/escalationWorkflow.js";
import type { PointerEvent, PointerResult, ViewComponent } from "./contract.js";

const theme = componentTheme();

export interface PermissionCallbacks {
  readonly onAnswer?: (decision: EscalationDecision) => void;
}

const CHOICES: readonly { readonly value: EscalationDecision; readonly hint: string }[] = [
  { value: "allow-once", hint: "allow once" },
  { value: "allow-always", hint: "always allow" },
  { value: "deny", hint: "deny" },
];

export class PermissionDialog implements ViewComponent {
  private request: PermissionRequest | undefined;
  private cursor = 0;
  private readonly callbacks: PermissionCallbacks;

  constructor(callbacks: PermissionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  open(request: PermissionRequest): void {
    this.request = request;
    this.cursor = 0;
  }

  close(): void {
    this.request = undefined;
  }

  get pending(): PermissionRequest | undefined {
    return this.request;
  }

  handleInput(data: string): void {
    if (!this.request) return;
    if (data === "\x1b[A" || data === "k") this.cursor = (this.cursor + CHOICES.length - 1) % CHOICES.length;
    else if (data === "\x1b[B" || data === "j") this.cursor = (this.cursor + 1) % CHOICES.length;
    else if (data === "\r" || data === "\n") this.answer(CHOICES[this.cursor]!.value);
    else if (data === "\x1b") this.answer("deny");
    else if (data === "a") this.answer("allow-once");
    else if (data === "A") this.answer("allow-always");
    else if (data === "d") this.answer("deny");
  }

  handlePointer(event: PointerEvent): PointerResult | undefined {
    if (!this.request || (event.kind !== "press" && event.kind !== "click")) return undefined;
    const index = event.y - 2;
    if (index < 0 || index >= CHOICES.length) return undefined;
    if (event.kind === "press") {
      this.cursor = index;
      return { handled: true, focus: true };
    }
    this.answer(CHOICES[index]!.value);
    return { handled: true };
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safe = Math.max(24, Math.floor(width));
    if (!this.request) return [];
    const lines = [
      theme.warning(`Permission: ${this.request.title}`),
      theme.muted(this.request.detail ?? `Scope: ${this.request.scope}`),
    ];
    CHOICES.forEach((choice, index) => {
      const active = index === this.cursor;
      const marker = active ? theme.accent("❯ ") : "  ";
      const row = truncateToWidth(`${marker}${choice.value} — ${choice.hint}`, safe);
      lines.push(active ? theme.selected(row) : row);
    });
    lines.push(theme.muted("Enter accept · Esc deny · a/A/d shortcut"));
    return lines;
  }

  private answer(decision: EscalationDecision): void {
    this.request = undefined;
    this.callbacks.onAnswer?.(decision);
  }
}
