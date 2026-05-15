export const MIN_MULTI_WRITE_OPERATIONS = 2;
export const MAX_BOUNDED_WRITE_OPERATIONS = 32;

export type BoundedWriteOperationFamily =
  | "update-only"
  | "mixed"
  | "delete-only"
  | "move-only";

export function isBoundedWriteOperationCount(count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= MIN_MULTI_WRITE_OPERATIONS &&
    count <= MAX_BOUNDED_WRITE_OPERATIONS
  );
}

export function isTooManyBoundedWriteOperations(count: number): boolean {
  return Number.isInteger(count) && count > MAX_BOUNDED_WRITE_OPERATIONS;
}

export function boundedWriteCountLabel(count: number): string {
  return `${count}-operation bounded small-N`;
}
