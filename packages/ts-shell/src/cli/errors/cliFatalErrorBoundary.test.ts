import { describe, expect, it } from "vitest";

import { handleCliFatalError } from "./cliFatalErrorBoundary.js";

describe("handleCliFatalError", () => {
  it("preserves fatal stderr wording and exit code", () => {
    const error = new Error("boom");
    const writes: unknown[][] = [];

    expect(() =>
      handleCliFatalError({
        error,
        writeError: (...args) => {
          writes.push(args);
        },
        exit: (code) => {
          throw new Error(`exit:${code}`);
        },
      }),
    ).toThrow("exit:1");

    expect(writes).toEqual([["Fatal error:", error]]);
  });
});
