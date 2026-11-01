export interface CliFatalErrorBoundaryInput {
  readonly error: unknown;
  readonly writeError: (message?: unknown, ...optionalParams: unknown[]) => void;
  readonly exit: (code: number) => never;
}

/**
 * The last thing a failed start prints.
 *
 * Only the message. Passing the error object as a second argument made Node
 * print the stack, so every failure — including one the runtime had already
 * explained and recorded — ended in frames pointing at internals the user
 * cannot act on. The stack is not lost: the crash recorder keeps it beside the
 * profile when the failure is unexpected, which is where it is useful.
 */
export function handleCliFatalError(
  input: CliFatalErrorBoundaryInput,
): never {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  input.writeError(message);
  input.exit(1);
}
