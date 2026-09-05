import { describe, expect, it } from "vitest";
import { formatCommandLine, formatToolDetail } from "./commandHighlight.js";
import { stripAnsi } from "../tui/text/ansi.js";

describe("command highlighting", () => {
  it("formats command with distinct colored segments", () => {
    const raw = "git diff HEAD --stat | grep -v test > /tmp/out.txt";
    const formatted = formatCommandLine(raw);
    expect(stripAnsi(formatted)).toBe(raw);
    // Should have multiple ANSI color escape sequences
    const escapes = formatted.match(/\x1b\[/g);
    expect(escapes && escapes.length).toBeGreaterThan(5);
  });

  it("handles simple commands with flags and arguments", () => {
    const raw = "npm run build -w packages/ts-shell";
    const formatted = formatCommandLine(raw);
    expect(stripAnsi(formatted)).toBe(raw);
  });

  it("handles string literals and numbers", () => {
    const raw = 'echo "hello world" 42';
    const formatted = formatCommandLine(raw);
    expect(stripAnsi(formatted)).toBe(raw);
  });

  it("formats tool detail based on tool type", () => {
    const bashDetail = formatToolDetail("bash", "npm test -- --help");
    expect(stripAnsi(bashDetail)).toBe("npm test -- --help");

    const readDetail = formatToolDetail("read", "src/core/tools/registry.ts");
    expect(stripAnsi(readDetail)).toBe("src/core/tools/registry.ts");
    expect(readDetail).toContain("\x1b[");

    const otherDetail = formatToolDetail("custom", "some detail");
    expect(stripAnsi(otherDetail)).toBe("some detail");
  });
});
