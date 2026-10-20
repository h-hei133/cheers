import { describe, expect, it } from "vitest";
import { splitTableRow } from "./table.js";

describe("table row cells", () => {
  it("matches a code span by its opening backtick run", () => {
    expect(splitTableRow("| left | ``x | y`` |")).toEqual(["left", "``x | y``"]);
    expect(splitTableRow("| left | ```x `|` y``` |")).toEqual(["left", "```x `|` y```"]);
  });

  it("still treats an escaped pipe outside a code span as cell content", () => {
    expect(splitTableRow("| left | x \\| y |")).toEqual(["left", "x | y"]);
  });
});
