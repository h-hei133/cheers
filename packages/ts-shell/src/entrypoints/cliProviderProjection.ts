import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";

export type CliProviderMode = "synthetic" | "real";
export type CliProviderReadinessLabel =
  | "synthetic-default"
  | "real-provider-configured"
  | "real-provider-missing-credential";

export interface CliProviderProjectionInput {
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly providerModeEnv?: string;
}

export interface CliProviderProjection {
  readonly provider: ProviderCredentialResolution["provider"];
  readonly providerMode: CliProviderMode;
  readonly readinessLabel: CliProviderReadinessLabel;
  readonly credentialSource:
    | NonNullable<ProviderCredentialResolution["credential"]>["source"]
    | "missing";
  readonly authMode:
    | NonNullable<ProviderCredentialResolution["credential"]>["authMode"]
    | "none";
  readonly expectedEnvVarName: string;
  readonly model?: string;
  readonly baseUrlConfigured: boolean;
}

export function projectCliProviderProjection(
  input: CliProviderProjectionInput,
): CliProviderProjection {
  const providerMode: CliProviderMode =
    input.providerModeEnv === "synthetic" ? "synthetic" : "real";
  const credential = input.providerCredentialResolution.credential;
  const readinessLabel: CliProviderReadinessLabel =
    providerMode === "synthetic"
      ? "synthetic-default"
      : credential
        ? "real-provider-configured"
        : "real-provider-missing-credential";

  return {
    provider: input.providerCredentialResolution.provider,
    providerMode,
    readinessLabel,
    credentialSource: credential?.source ?? "missing",
    authMode: credential?.authMode ?? "none",
    expectedEnvVarName: input.providerCredentialResolution.expectedEnvVarName,
    model: input.providerCredentialResolution.model,
    baseUrlConfigured: Boolean(input.providerCredentialResolution.baseUrl),
  };
}
