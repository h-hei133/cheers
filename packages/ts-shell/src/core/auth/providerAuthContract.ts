import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../../config/runtimeConfig.js";

export type ProviderAuthMethodKind =
  | "api-key"
  | "account-auth"
  | "browser-assisted-capture";

export interface ProviderAuthMethod {
  readonly kind: ProviderAuthMethodKind;
  readonly label: string;
}

export interface ProviderAccountAuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId?: string;
  readonly accountEmail?: string;
  readonly clientId?: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}

export interface ProviderAuthContract {
  readonly provider: RuntimeProvider;
  readonly methods: readonly ProviderAuthMethod[];
  loginAccountAuth(options?: {
    readonly timeoutMs?: number;
  }): Promise<ProviderAccountAuthResult>;
}

export interface ProviderAccountAuthConnectionSummary {
  readonly connectionId: string;
  readonly provider: RuntimeProvider;
  readonly configPath: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}

export function toOpenAIAccountAuthConfig(
  result: ProviderAccountAuthResult,
): OpenAIAccountAuthConfig {
  return {
    type: "openai-chatgpt-account",
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    ...(result.accountId ? { accountId: result.accountId } : {}),
  };
}

export function toGoogleAccountAuthConfig(
  result: ProviderAccountAuthResult,
): GoogleAccountAuthConfig {
  return {
    type: "google-gemini-account",
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    clientId: result.clientId ?? "",
    ...(result.accountEmail ? { accountEmail: result.accountEmail } : {}),
  };
}
