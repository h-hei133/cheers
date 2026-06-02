import {
  projectProductSurfaceViewModel,
  type ProductSurfaceViewModel,
  type ProductSurfaceInput,
} from "../../presentation/surface/model.js";
import {
  renderSessionStatusEnvelope,
} from "../../presentation/terminal/renderer.js";
import {
  projectSessionStatusEnvelope,
  type SessionStatusEnvelope,
} from "../../session/presentation/envelope.js";

export type CliSessionProductSurfaceInput = ProductSurfaceInput;

export interface CliSessionProductSurface {
  readonly lines: readonly string[];
  readonly verdict: string;
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
  readonly envelope: SessionStatusEnvelope;
  readonly productSurface: ProductSurfaceViewModel;
}

export function projectCliSessionProductSurface(
  input: CliSessionProductSurfaceInput,
): CliSessionProductSurface | undefined {
  const viewModel = projectProductSurfaceViewModel(input);
  if (!viewModel) {
    return undefined;
  }
  return projectCliSessionProductStatus(viewModel);
}

export function projectCliSessionProductStatus(
  viewModel: ProductSurfaceViewModel,
): CliSessionProductSurface {
  const envelope = projectSessionStatusEnvelope(viewModel);
  return {
    lines: renderSessionStatusEnvelope(envelope, { mode: "detailed" }).lines,
    verdict: viewModel.verdict,
    notProvenClaims: viewModel.notProvenClaims,
    nextAction: viewModel.nextAction,
    envelope,
    productSurface: viewModel,
  };
}
