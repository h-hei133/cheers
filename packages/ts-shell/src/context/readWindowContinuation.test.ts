import { describe, expect, it } from "vitest";

import {
  attemptSelectiveReanchorByFingerprint,
  computeFragmentFingerprint,
  extractLastReadDeliveredFragmentFromContinuity,
  resolveReadWindowDirectiveForWorkflow,
} from "./readWindowContinuation.js";

describe("readWindowContinuation", () => {
  it("continues from the last delivered read position without claiming completion", () => {
    expect(
      resolveReadWindowDirectiveForWorkflow("continue reading next 3 lines", {
        lastReadDeliveredLines: 4,
        lastReadWindowStart: 2,
        lastReadWindowEnd: 4,
        lastReadWindowSize: 2,
      }),
    ).toEqual({
      mode: "continue",
      lineOffset: 4,
      lineCount: 3,
    });
  });

  it("recovers fragment facts from continuation evidence", () => {
    expect(
      extractLastReadDeliveredFragmentFromContinuity({
        lastContinuationEvidence: [
          "read-fragment-line-indexes:0,2,3",
          "read-fragment-ranges:0-0;2-3",
          "read-fragment-fingerprint:" + "a".repeat(64),
          "repair-read-filter:function-definitions",
        ],
      }),
    ).toEqual({
      lineIndexes: [0, 2, 3],
      ranges: ["0-0", "2-3"],
      fingerprint: "a".repeat(64),
      filter: "function-definitions",
    });
  });

  it("reanchors filtered fragments only when a unique current match exists", () => {
    const expectedFingerprint = computeFragmentFingerprint(
      ["export function keep() {}", "export const value = () => 1;"].join("\n"),
    );

    expect(
      attemptSelectiveReanchorByFingerprint({
        sourceLines: [
          "const header = 1;",
          "export function keep() {}",
          "export const value = () => 1;",
          "const footer = 2;",
        ],
        expectedFingerprint,
        readFilter: "function-definitions",
        sourceWindowStart: 0,
        sourceWindowEnd: 2,
        previousFragmentIndexes: [0, 1],
      }),
    ).toMatchObject({
      status: "matched",
      indexes: [1, 2],
      reason: "unique-fingerprint-match",
    });
  });
});
