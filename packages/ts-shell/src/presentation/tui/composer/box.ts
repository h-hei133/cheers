import type { ComposerChromeContext, ComposerRowContext, ComposerStyle } from "./types.js";
import { visibleWidth } from "../utils.js";

export const boxStyle: ComposerStyle = {
  id: "box",
  renderTop(ctx: ComposerChromeContext): string {
    const width = Math.max(20, ctx.width);
    if (!ctx.topTitle) {
      return `\x1b[90m╭─${"─".repeat(width - 4)}─╮\x1b[0m`;
    }
    const title = ` \x1b[1m\x1b[36m${ctx.topTitle}\x1b[0m `;
    const fill = Math.max(0, width - 4 - visibleWidth(title));
    return `\x1b[90m╭─\x1b[0m${title}\x1b[90m${"─".repeat(fill)}─╮\x1b[0m`;
  },
  renderRow(ctx: ComposerRowContext): string {
    const width = Math.max(20, ctx.width);
    const gutter = ctx.gutter ?? "\x1b[36m❯\x1b[0m ";
    const textLen = visibleWidth(ctx.text);
    const contentBudget = Math.max(10, width - 4 - visibleWidth(gutter));
    const pad = Math.max(0, contentBudget - textLen);
    return `\x1b[90m│\x1b[0m ${gutter}${ctx.text}${" ".repeat(pad)} \x1b[90m│\x1b[0m`;
  },
  renderBottom(ctx: ComposerChromeContext): string {
    const width = Math.max(20, ctx.width);
    if (!ctx.statusText) {
      return `\x1b[90m╰─${"─".repeat(width - 4)}─╯\x1b[0m`;
    }
    const status = ` ${ctx.statusText} `;
    const fill = Math.max(0, width - 4 - visibleWidth(status));
    return `\x1b[90m╰─\x1b[0m${status}\x1b[90m${"─".repeat(fill)}─╯\x1b[0m`;
  },
};
