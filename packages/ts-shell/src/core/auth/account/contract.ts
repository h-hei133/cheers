import type { AccountAuthConfig } from '../../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../credential.js';

/** In-memory evidence from verified storage; never serialized into model or event input. */
export interface AccountRotation {
  readonly resolution: ProviderCredentialResolution;
  readonly accountAuth: AccountAuthConfig;
  readonly storage: { readonly source: string; readonly path: string; readonly previousRevision: string; readonly revision: string };
}
export type AccountPublication = (rotation: AccountRotation, publish: () => boolean | void) => void;
