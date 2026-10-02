import { expect, it } from "vitest";
import { parseTheme } from "./schema.js";
import dark from "./dark.json" with { type: "json" };

it("resolves variable chains while inheriting omitted tokens", () => {
  const result = parseTheme({ vars: { base: "#123456", linked: "base" }, colors: { accent: "linked", text: "blue" } }, "custom", dark);
  expect(result.name).toBe("custom");
  expect(result.colors.accent).toBe("#123456");
  expect(result.colors.text).toBe("blue");
  expect(result.colors.error).toBe(dark.colors.error);
});

it.each([
  [{ colors: { accentt: "#ffffff" } }, /Unknown color token/],
  [{ colors: {}, extra: true }, /Unknown theme field/],
  [{ colors: [] }, /colors must be/],
  [{ colors: { text: "#fff" } }, /Invalid color/],
  [{ colors: { text: "missing" } }, /missing variable/],
  [{ vars: { a: "b", b: "a" }, colors: {} }, /Circular/],
  [{ vars: { unused: 123 }, colors: {} }, /Invalid color/],
  [{ colors: { text: "toString" } }, /missing variable/],
  [{ name: 123, colors: {} }, /name must be/],
])("rejects malformed themes without a silent color fallback", (input, message) => {
  expect(() => parseTheme(input, "broken", dark)).toThrow(message);
});

it("handles long variable chains without recursive stack growth", () => {
  const vars: Record<string, string> = {};
  for (let n = 0; n < 10_000; n++) vars[`v${n}`] = n === 9999 ? "#123456" : `v${n + 1}`;
  expect(parseTheme({ vars, colors: { text: "v0" } }, "deep", dark).colors.text).toBe("#123456");
});


it("inherits new semantic roles from legacy overrides unless explicitly replaced", () => {
  const result = parseTheme({ vars: { blue: "#102030" }, colors: {
    commandFlag: "blue", border: "#203040", dim: "#304050", syntaxKeyword: "#abcdef", mdQuoteBorder: "#123456",
  } }, "custom", dark);
  expect(result.colors.commandFlag).toBe("#102030");
  expect(result.colors.syntaxKeyword).toBe("#abcdef");
  expect(result.colors.mdQuoteBorder).toBe("#123456");
  expect(result.colors.mdCodeBorder).toBe("#203040");
  expect(result.colors.mdRule).toBe("#203040");
  expect(result.colors.mdLinkUrl).toBe("#304050");
  expect(result.colors.mdQuoteText).toBe("#304050");
  const legacy = parseTheme({ colors: { commandFlag: "#102030", text: "#203040" } }, "legacy", dark);
  expect(legacy.colors.syntaxKeyword).toBe("#102030");
  expect(legacy.colors.syntaxText).toBe("#203040");
});
