import { expect, it } from "vitest";
import { closeTerminalHyperlink, displayLinkUrl, safeLinkUrl, terminalHyperlink } from "./link.js";

it("allows only link schemes that cannot execute in a terminal or browser", () => {
  expect(safeLinkUrl("https://example.test/path")).toBe("https://example.test/path");
  expect(safeLinkUrl("./notes.md")).toBe("./notes.md");
  expect(safeLinkUrl("JaVaScRiPt:alert(1)")).toBeUndefined();
  expect(safeLinkUrl("file:///etc/passwd")).toBeUndefined();
  expect(safeLinkUrl("https://example.test/\u009dpath")).toBe("https://example.test/path");
  expect(displayLinkUrl("https://example.test/\x1b]8;;https://evil.test\x07")).toBe(
    "https://example.test/]8;;https://evil.test",
  );
});

it("wraps safe labels in OSC8 and leaves refused targets inert", () => {
  expect(terminalHyperlink("docs", "https://example.test")).toBe(
    "\x1b]8;;https://example.test\x07docs\x1b]8;;\x07",
  );
  expect(terminalHyperlink("docs", "javascript:alert(1)")).toBe("docs");
});

it("closes only a hyperlink left open by slicing, including ST-terminated rows", () => {
  expect(closeTerminalHyperlink("plain")).toBe("plain");
  expect(closeTerminalHyperlink("\x1b]8;;https://example.test\x07label")).toBe(
    "\x1b]8;;https://example.test\x07label\x1b]8;;\x07",
  );
  const closed = "\x1b]8;;https://example.test\x1b\\label\x1b]8;;\x1b\\";
  expect(closeTerminalHyperlink(closed)).toBe(closed);
});
