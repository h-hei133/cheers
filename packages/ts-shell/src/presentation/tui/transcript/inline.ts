import { applyStyles, defaultTheme } from "../../theme/theme.js";
import { inlineWithinBudget, transformInline, type InlineContext } from "../text/inline.js";
import { displayLinkUrl, terminalHyperlink } from "../text/link.js";
import { createMathFinder } from "./math.js";

export interface MarkdownRenderOptions {
  /** Captured terminal support; omitted calls retain the standalone renderer default. */
  readonly supportsHyperlinks?: boolean;
}

/** Terminal styling consumes the same source-span decisions as the exported page. */
export function renderInline(text: string, options?: MarkdownRenderOptions): string {
  return renderInlineAt(text, undefined, options);
}

/** Table cells opt into breaks only after opaque code, links and math are captured. */
export function renderInlineAt(text: string, context?: InlineContext, options?: MarkdownRenderOptions, breaks = false): string {
  if (!inlineWithinBudget(text, context)) return text;
  return transformInline(text, {
    renderCode: code => defaultTheme.fg(code.includes("/") || code.includes("\\") || /\.[a-zA-Z0-9_-]+$/.test(code) ? "filename" : "mdCode", code),
    renderText: plain => plain,
    renderEscape: character => character,
    renderEmphasis: (body, style) => style === "strong" ? defaultTheme.bold(body)
      : applyStyles(body, [style === "em" ? ["\x1b[3m", 23] : ["\x1b[9m", 29]]),
    ...(breaks ? { renderBreak: () => "\n" } : {}),
    renderLink: (label, href, next) => {
      const renderedLabel = defaultTheme.fg("mdLink", renderInlineAt(label, next, options, breaks));
      const visibleTarget = displayLinkUrl(href);
      return `${terminalHyperlink(renderedLabel, href, options?.supportsHyperlinks)}${visibleTarget ? defaultTheme.fg("mdLinkUrl", ` (${visibleTarget})`) : ""}`;
    },
    findMath: createMathFinder(text),
  }, context);
}
