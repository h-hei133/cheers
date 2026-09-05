import { describe, expect, it } from "vitest";
import { defaultTheme } from "../theme/theme.js";
import { formatCommandLine, formatToolDetail } from "../theme/commandHighlight.js";
import { createUnifiedDiff } from "./transcript/diff.js";
import { renderBlock } from "./transcript/blocks.js";
import { renderInline } from "./transcript/markdown.js";
import { stripAnsi } from "./text/ansi.js";

describe("TUI enhancements verification", () => {
  it("verifies theme truecolor color generation", () => {
    const user = defaultTheme.fg("userMessageText", "User Message Text");
    expect(user).toContain("\x1b[");
    const file = defaultTheme.fg("filename", "packages/ts-shell/src/index.ts");
    expect(file).toContain("\x1b[");
  });

  it("verifies command line highlighting segments commands, flags, strings, filenames", () => {
    const cmd = 'git commit -m "feat: new feature" && npm test src/app.ts 42';
    const formatted = formatCommandLine(cmd);
    expect(stripAnsi(formatted)).toBe(cmd);
    expect(formatted).toContain("\x1b[");
  });

  it("verifies tool detail formatting", () => {
    const bash = formatToolDetail("bash", "git diff HEAD --stat | cat");
    expect(stripAnsi(bash)).toBe("git diff HEAD --stat | cat");
    const read = formatToolDetail("read", "src/presentation/tui/paint.ts");
    expect(stripAnsi(read)).toBe("src/presentation/tui/paint.ts");
    expect(read).toContain("\x1b[");
  });

  it("verifies diff generation and tool block diff rendering", () => {
    const diff = createUnifiedDiff("src/calc.ts", "const x = 1;\nconst y = 2;\n", "const x = 1;\nconst y = 20;\n");
    expect(diff).toContain("--- a/src/calc.ts");
    expect(diff).toContain("-const y = 2;");
    expect(diff).toContain("+const y = 20;");

    const diffBlock = {
      kind: "tool" as const,
      title: "edit",
      detail: "src/calc.ts",
      text: "",
      diff,
      status: "ok" as const,
      collapsed: true,
      finalized: true,
    };
    const rendered = renderBlock(diffBlock, 80);
    const joined = rendered.join("\n");
    expect(joined).toContain("edit");
    expect(joined).toContain("src/calc.ts");
    expect(stripAnsi(joined)).toContain("-const y = 2;");
    expect(stripAnsi(joined)).toContain("+const y = 20;");
  });

  it("verifies inline markdown code span has no ugly background bar", () => {
    const inline = renderInline("Check `src/index.ts` or run `npm test` now");
    expect(stripAnsi(inline)).toBe("Check src/index.ts or run npm test now");
    // Does not use old background 238
    expect(inline).not.toContain("\x1b[48;5;238m");
  });
});
