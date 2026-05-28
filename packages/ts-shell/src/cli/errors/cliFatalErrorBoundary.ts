export interface CliFatalErrorBoundaryInput {
  readonly error: unknown;
  readonly writeError: (message?: unknown, ...optionalParams: unknown[]) => void;
  readonly exit: (code: number) => never;
}

export function handleCliFatalError(
  input: CliFatalErrorBoundaryInput,
): never {
  input.writeError("Fatal error:", input.error);
  input.exit(1);
}
