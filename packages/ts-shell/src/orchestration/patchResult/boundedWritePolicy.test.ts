import { describe, expect, it } from "vitest";
import {
  MAX_BOUNDED_WRITE_OPERATIONS,
  MIN_MULTI_WRITE_OPERATIONS,
  boundedWriteCountLabel,
  isBoundedWriteOperationCount,
  isTooManyBoundedWriteOperations,
} from "./boundedWritePolicy.js";

describe("bounded write policy", () => {
  it("keeps single-operation routing separate and enables only 2-8 bounded operations", () => {
    expect(MIN_MULTI_WRITE_OPERATIONS).toBe(2);
    expect(MAX_BOUNDED_WRITE_OPERATIONS).toBe(8);
    expect(isBoundedWriteOperationCount(1)).toBe(false);
    expect(isBoundedWriteOperationCount(2)).toBe(true);
    expect(isBoundedWriteOperationCount(8)).toBe(true);
    expect(isBoundedWriteOperationCount(9)).toBe(false);
  });

  it("classifies 9+ as too many without granting broad apply_patch support", () => {
    expect(isTooManyBoundedWriteOperations(8)).toBe(false);
    expect(isTooManyBoundedWriteOperations(9)).toBe(true);
    expect(boundedWriteCountLabel(8)).toBe("8-operation bounded small-N");
  });
});
