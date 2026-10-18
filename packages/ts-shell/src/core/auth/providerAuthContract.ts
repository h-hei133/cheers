import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
  SubscriptionAccountAuthConfig,
} from "../../config/runtimeConfig.js";

export type ProviderAuthMethodKind =
  | "api-key"
  | "account-auth"
  | "browser-assisted-capture"
  /**
   * A sign-in that shows a code to be entered elsewhere, for a machine that has
   * no browser to open. Distinct from `account-auth`, which needs one.
   */
  | "device-code";

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
  readonly production?: object;
}

export interface ProviderAuthContract {
  readonly provider: RuntimeProvider;
  readonly methods: readonly ProviderAuthMethod[];
  loginAccountAuth(options?: {
    readonly timeoutMs?: number;
    /**
     * Told what to show the person while the sign-in is in progress.
     *
     * A device-code flow has nothing to open: the code and the address it is
     * entered at are the whole instruction, and a surface that can only learn
     * them after the flow returns can never show them in time. Absent means the
     * surface has no way to display one, which is not an error — the flow still
     * runs and the credential still arrives.
     */
    readonly onProgress?: (progress: SignInProgress) => void;
  }): Promise<ProviderAccountAuthResult>;
}

/**
 * What a person needs to be shown to complete a sign-in.
 *
 * The `authorizeUrl` is the same field for both kinds of flow: a browser sign-in
 * puts the URL there, and a code sign-in puts the address the code goes to. What
 * differs is `userCode`, which only a code sign-in has.
 */
export interface SignInProgress {
  readonly authorizeUrl: string;
  readonly userCode?: string;
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

/**
 * The stored shape of a credential a subscription sign-in produced.
 *
 * Separate from the two account shapes because there is no account id and no
 * client id: the subscription is the identity, and renewal uses the second token
 * the issuer handed back rather than a second sign-in.
 */
export function toSubscriptionAccountAuthConfig(input: {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly baseUrl?: string;
}): SubscriptionAccountAuthConfig {
  return {
    type: "subscription",
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  };
}
