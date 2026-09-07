import { truncateToWidth } from "../text/layout.js";
import { componentTheme } from "./theme.js";
import { formatElapsed, spinnerFrame, type TurnActivity } from "../transcript/live.js";
import type { ViewComponent } from "./contract.js";

const theme = componentTheme();

export class Loader implements ViewComponent {
  private label = "Loading...";
  private activity: TurnActivity | undefined;

  setMessage(label: string): void {
    this.label = label;
  }

  setActivity(activity: TurnActivity | undefined): void {
    this.activity = activity;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safe = Math.max(8, Math.floor(width));
    const now = Date.now();
    const frame = this.activity?.cancelling ? theme.warning("◼") : theme.accent(spinnerFrame(now));
    const label = this.activity?.cancelling ? "interrupting" : (this.activity?.label ?? this.label);
    const facts = this.activity ? [formatElapsed(now - this.activity.startedAt)] : [];
    const row = truncateToWidth(`${frame} ${label} ${theme.muted(facts.join(" · "))}`, safe);
    return ["", row];
  }
}
