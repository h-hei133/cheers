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

  it("uses backslash parity when deciding whether a pipe is a delimiter", () => {
    expect(splitTableRow("| left | x \\\\| y |")).toEqual(["left", "x \\", "y"]);
    expect(splitTableRow("| left | x \\\\\\| y |")).toEqual(["left", "x \\| y"]);
  });

  it("does not let an escaped backtick hide later pipes", () => {
    expect(splitTableRow("| a | \\`x | y\\` |")).toEqual(["a", "\\`x", "y\\`"]);
  });

  it("treats an unmatched code run literally and keeps later pipes as cells", () => {
    expect(splitTableRow("| a | `oops | b |")).toEqual(["a", "`oops", "b"]);
  });
});
