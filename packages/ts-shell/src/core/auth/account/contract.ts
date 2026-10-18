import type { AccountAuthConfig } from '../../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../credential.js';

/** In-memory evidence from verified storage; never serialized into model or event input. */
export interface AccountRotation {
  readonly resolution: ProviderCredentialResolution;
  readonly accountAuth: AccountAuthConfig;
  readonly storage: { readonly source: string; readonly path: string; readonly previousRevision: string; readonly revision: string };
}
/** A stored credential must be published; only a verified receipt can admit captured requests. */
export type AccountPublication = (rotation: AccountRotation | undefined, publish: () => boolean | void) => void;
