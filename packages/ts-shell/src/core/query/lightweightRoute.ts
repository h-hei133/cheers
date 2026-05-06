import type { ProviderCredentialResolution } from "../shell/providerCredentials.js";

export function validateLightweightProviderCredential(input: {
  readonly providerMode: "synthetic" | "real";
  readonly providerCredentialResolution: ProviderCredentialResolution;
}): { readonly ok: true } | { readonly ok: false; readonly stopReason: string } {
  if (input.providerMode === "synthetic") {
    return { ok: true };
  }

  const provider = input.providerCredentialResolution.provider;
  const credential = input.providerCredentialResolution.credential;
  const hasCredential = Boolean(
    credential?.apiKey?.trim() || credential?.accountAuth?.accessToken?.trim(),
  );
  if (!hasCredential) {
    return {
      ok: false,
      stopReason: `Provider readiness failed (provider-readiness:missing-key): ${input.providerCredentialResolution.expectedEnvVarName} or configured credential is missing for lightweight chat.`,
    };
  }
  if (
    (provider === "openai-compatible" ||
      provider === "google" ||
      provider === "antigravity" ||
      provider === "claudecode") &&
    !input.providerCredentialResolution.baseUrl?.trim()
  ) {
    return {
      ok: false,
      stopReason: `Provider readiness failed (provider-readiness:missing-config): ${provider} requires a configured base URL for lightweight chat.`,
    };
  }
  if (
    (provider === "openai-compatible" ||
      provider === "google" ||
      provider === "antigravity" ||
      provider === "claudecode") &&
    !input.providerCredentialResolution.model?.trim()
  ) {
    return {
      ok: false,
      stopReason: `Provider readiness failed (provider-readiness:missing-config): ${provider} requires a configured model for lightweight chat.`,
    };
  }
  return { ok: true };
}
