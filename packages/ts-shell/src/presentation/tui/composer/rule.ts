import type { ComposerChromeContext, ComposerRowContext, ComposerStyle } from "./types.js";
import { visibleWidth } from "../utils.js";

export const ruleStyle: ComposerStyle = {
  id: "rule",
  renderTop(ctx: ComposerChromeContext): string {
    const width = Math.max(20, ctx.width);
    if (!ctx.statusText) {
      return `\x1b[90m${"─".repeat(width)}\x1b[0m`;
    }
    const chip = ` [${ctx.statusText}] `;
    const fill = Math.max(0, width - visibleWidth(chip) - 2);
    return `\x1b[90m${"─".repeat(fill)}\x1b[0m${chip}\x1b[90m──\x1b[0m`;
  },
  renderRow(ctx: ComposerRowContext): string {
    const gutter = ctx.gutter ?? "\x1b[36m❯\x1b[0m ";
    return `${gutter}${ctx.text}`;
  },
  renderBottom(ctx: ComposerChromeContext): string {
    const width = Math.max(20, ctx.width);
    return `\x1b[90m${"─".repeat(width)}\x1b[0m`;
  },
};
