import { describe, expect, it } from "vitest";

import { handleCliFatalError } from "./cliFatalErrorBoundary.js";

describe("handleCliFatalError", () => {
  const run = (error: unknown) => {
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
    return writes;
  };

  it("prints the message and exits 1", () => {
    expect(run(new Error("boom"))).toEqual([["boom"]]);
  });

  it("does not print the stack", () => {
    // Passing the error object as a second argument made Node render the stack,
    // so a failure the runtime had already explained still ended in frames
    // pointing at internals. The crash recorder keeps the stack where it is
    // useful; this line is what the user reads.
    const error = new Error("Context overflow error");
    const writes = run(error);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(1);
    expect(String(writes[0]![0])).not.toContain("at ");
  });

  it("renders a non-Error value without throwing", () => {
    expect(run("plain failure")).toEqual([["plain failure"]]);
  });
});
