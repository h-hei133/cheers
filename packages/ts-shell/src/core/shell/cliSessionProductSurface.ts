import {
  projectProductSurfaceViewModel,
  type ProductSurfaceInput,
} from "../../presentation/productSurface.js";
import { renderTerminalMessage } from "../../presentation/terminalMessageRenderer.js";

export type CliSessionProductSurfaceInput = ProductSurfaceInput;

export interface CliSessionProductSurface {
  readonly lines: readonly string[];
  readonly verdict: string;
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
}

export function projectCliSessionProductSurface(
  input: CliSessionProductSurfaceInput,
): CliSessionProductSurface | undefined {
  const viewModel = projectProductSurfaceViewModel(input);
  if (!viewModel) {
    return undefined;
  }
  return {
    lines: renderTerminalMessage(viewModel).lines,
    verdict: viewModel.verdict,
    notProvenClaims: viewModel.notProvenClaims,
    nextAction: viewModel.nextAction,
  };
}
