import type { AccountAuthConfig, RuntimeProvider } from '../../config/runtimeConfig.js';
import type { ThinkingPreference } from '../models/effort.js';
import type { PoolBlock } from './account/pool.js';

export type ProviderCredentialSource = 'cli' | 'env' | 'connection' | 'config';
export type ProviderCredentialAuthMode = 'api-key' | 'account-auth';

export interface ResolvedProviderCredential {
  /** The actual selected record, including fallback selection without an active ID. */
  readonly connectionId?: string;
  readonly provider: RuntimeProvider;
  readonly authMode: ProviderCredentialAuthMode;
  readonly apiKey?: string;
  readonly accountAuth?: AccountAuthConfig;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly source: ProviderCredentialSource;
  readonly envVarName: string;
}

export interface ProviderCredentialResolution {
  /** A selected pending connection cannot borrow credentials from another source. */
  readonly blocked?: 'connection-pending' | 'connection-unavailable' | 'connection-overridden' | 'pool-required' | PoolBlock;
  /** Explicit selection inputs retained for identity checks against later settings. */
  readonly selection?: { readonly provider?: RuntimeProvider; readonly baseUrl?: string; readonly connectionId?: string; readonly credentialScope?: 'provider' };
  readonly thinkingEffort?: ThinkingPreference;
  readonly provider: RuntimeProvider;
  readonly credential?: ResolvedProviderCredential;
  readonly expectedEnvVarName: string;
  readonly baseUrl?: string;
  readonly model?: string;
}
