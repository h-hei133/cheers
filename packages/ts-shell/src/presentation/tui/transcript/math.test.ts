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

it("keeps an unknown command rather than dropping its meaning", () => {
  expect(projectMath("$\\unknown{x}$")).toBe("\\unknown{x}");
});

it("keeps the raw formula when it exceeds a budget", () => {
  const body = "x".repeat(5000);
  expect(projectMath(`$${body}$`)).toBe(`$${body}$`);
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
