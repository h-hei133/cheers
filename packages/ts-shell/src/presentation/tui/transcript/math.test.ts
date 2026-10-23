import { expect, it } from "vitest";
import { latexToDisplayText, projectMath } from "./math.js";

it("converts common inline formulas to readable text", () => {
  expect(projectMath("$x^2 + y_1$")).toBe("x² + y₁");
  expect(projectMath("$\\frac{a}{b}$")).toBe("(a)/(b)");
  expect(projectMath("$\\sqrt{x}$")).toBe("√(x)");
  expect(projectMath("$\\alpha \\leq \\beta$")).toBe("α ≤ β");
  expect(projectMath("\\(a+b\\)")).toBe("a+b");
});

it("leaves currency, code spans and escaped dollars alone", () => {
  expect(projectMath("$5 and $10")).toBe("$5 and $10");
  expect(projectMath("`$x^2$`")).toBe("`$x^2$`");
  expect(projectMath("``code $x^2$``")).toBe("``code $x^2$``");
  expect(projectMath("\\`text $x^2$\\`")).toBe("\\`text x²\\`");
  expect(projectMath("`unmatched $x^2$")).toBe("`unmatched x²");
  expect(projectMath("\\$x\\$")).toBe("\\$x\\$");
});

it("keeps the complete formula when any command is unknown", () => {
  expect(projectMath("$\\unknown{x}+\\alpha$")).toBe("$\\unknown{x}+\\alpha$");
  expect(projectMath("$\\frac{a}$")).toBe("$\\frac{a}$");
  expect(projectMath("$\\sqrt$")).toBe("$\\sqrt$");
});

it("keeps the raw formula when it exceeds a budget", () => {
  const body = "x".repeat(5000);
  expect(projectMath(`$${body}$`)).toBe(`$${body}$`);
  const withLink = `$${body} [docs](https://example.test)$`;
  expect(projectMath(withLink)).toBe(withLink);
  const nested = "$" + "{".repeat(20) + "x" + "}".repeat(20) + "$";
  expect(projectMath(nested)).toBe(nested);
});

it("keeps malformed groups raw instead of rewriting them", () => {
  expect(projectMath("$\\frac{a}{b$")).toBe("$\\frac{a}{b$");
  expect(projectMath("$a}b$")).toBe("$a}b$");
});

it("keeps inline matrices on one row and lays out display matrices by row", () => {
  expect(projectMath("$\\begin{bmatrix}1&20\\\\300&4\\end{bmatrix}$")).toBe("[ 1    20 ] | [ 300  4 ]");
  expect(latexToDisplayText("\\begin{bmatrix}1&20\\\\300&4\\end{bmatrix}")).toBe([
    "[ 1    20 ]",
    "[ 300  4 ]",
  ].join("\n"));
  const oversized = `$$\\begin{matrix}${Array.from({ length: 13 }, () => "1").join("\\\\")}\\end{matrix}$$`;
  expect(projectMath(oversized)).toBe(oversized);
});

it("projects whitelisted standalone math environments", () => {
  expect(latexToDisplayText("\\begin{equation}\\alpha+\\beta\\end{equation}")).toBe("α+β");
  expect(latexToDisplayText("\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}")).toBe([
    "x | x>0",
    "-x | x≤0",
  ].join("\n"));
});

it("keeps nested environments and display budgets on the raw fallback", () => {
  const nested = "\\begin{bmatrix}1&\\begin{matrix}2\\end{matrix}\\\\3&4\\end{bmatrix}";
  expect(latexToDisplayText(nested)).toBeUndefined();
  expect(projectMath(`$${nested}$`)).toBe(`$${nested}$`);

  const tooManyRows = `\\begin{align}${Array.from({ length: 25 }, (_, index) => `x_${index}`).join("\\\\")}\\end{align}`;
  expect(latexToDisplayText(tooManyRows)).toBeUndefined();

  const wide = "🙂".repeat(1009);
  const tooManyBytes = `\\begin{matrix}${[wide, ...Array.from({ length: 11 }, () => "x")].join("\\\\")}\\end{matrix}`;
  expect(Buffer.byteLength(tooManyBytes, "utf8")).toBeLessThanOrEqual(4096);
  expect(latexToDisplayText(tooManyBytes)).toBeUndefined();
});
