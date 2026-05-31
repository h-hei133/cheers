import { describe, expect, it } from "vitest";
import {
  MAX_BOUNDED_WRITE_OPERATIONS,
  MIN_MULTI_WRITE_OPERATIONS,
  boundedWriteCountLabel,
  isBoundedWriteOperationCount,
  isTooManyBoundedWriteOperations,
} from "./writePolicy.js";

describe("bounded write policy", () => {
  it("keeps single-operation routing separate and enables only 2-32 bounded operations", () => {
    expect(MIN_MULTI_WRITE_OPERATIONS).toBe(2);
    expect(MAX_BOUNDED_WRITE_OPERATIONS).toBe(32);
    expect(isBoundedWriteOperationCount(1)).toBe(false);
    expect(isBoundedWriteOperationCount(2)).toBe(true);
    expect(isBoundedWriteOperationCount(8)).toBe(true);
    expect(isBoundedWriteOperationCount(9)).toBe(true);
    expect(isBoundedWriteOperationCount(16)).toBe(true);
    expect(isBoundedWriteOperationCount(32)).toBe(true);
    expect(isBoundedWriteOperationCount(33)).toBe(false);
    expect(isBoundedWriteOperationCount(0)).toBe(false);
    expect(isBoundedWriteOperationCount(-1)).toBe(false);
  });

  it("classifies 33+ as too many without granting broad apply_patch support", () => {
    expect(isTooManyBoundedWriteOperations(8)).toBe(false);
    expect(isTooManyBoundedWriteOperations(32)).toBe(false);
    expect(isTooManyBoundedWriteOperations(33)).toBe(true);
    expect(boundedWriteCountLabel(32)).toBe("32-operation bounded small-N");
  });
});
