import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import {
  renderRootBindingDiagnostics,
} from "../../core/shell/startupSurfaceRenderer.js";
import {
  SessionBootstrapError,
} from "../../core/shell/bootstrap.js";

export interface CliBootstrapErrorBoundaryInput {
  readonly error: unknown;
  readonly renderer: StreamingRenderer;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}

export function handleCliBootstrapError(
  input: CliBootstrapErrorBoundaryInput,
): never {
  if (input.error instanceof SessionBootstrapError) {
    if (input.error.rootBindingDiagnostics.length > 0) {
      input.renderer.renderLine(
        "Session bootstrap blocked by root binding diagnostics.",
      );
      renderRootBindingDiagnostics(
        input.renderer,
        input.error.rootBindingDiagnostics,
      );
    } else {
      input.writeError(input.error.message);
      input.writeError(input.error.recoveryHint);
    }
    input.exit(1);
  }

  throw input.error;
}
