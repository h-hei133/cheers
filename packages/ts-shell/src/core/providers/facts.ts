import type { RuntimeProvider } from "../../config/runtimeConfig.js";

/**
 * What each provider is, said once.
 *
 * Facts about a provider were spelled out wherever they were needed: its
 * environment variable in one file, its display label in another, whether it is
 * treated as compatible-style in a third, its default model in a fourth. Adding a
 * provider meant finding all of them, and nothing failed when one was missed —
 * the answer was simply wrong in that one place, which is the kind of defect that
 * survives review because each file reads correctly on its own.
 *
 * A fact is here when it is fixed for the provider and true wherever it is asked.
 * Anything that depends on the call site — a stored credential's shape, whether a
 * connection is active, what the user typed — is not a fact about the provider
 * and does not belong here.
 */

/** One provider, as everything that needs to know about it needs to know. */
export interface ProviderFacts {
  /** The name shown to a person. */
  readonly label: string;
  /** The environment variable an API key is read from. */
  readonly apiKeyEnvVar: string;
  /**
   * Whether this provider is reached through a user-supplied base URL.
   *
   * Not "does it speak the default wire shape" — `openai` does, and is false
   * here. What this answers is whether the user has to name an endpoint and a
   * model for the provider to work at all, which is true of the gateways onto
   * compatible services and not of the providers whose endpoint is built in.
   *
   * The name is the one four separate copies of this predicate used. What they
   * actually meant is above; what they were called is below.
   */
  readonly compatibleStyle: boolean;
  /**
   * Which field of a per-provider config object holds this provider's account
   * credential, when it has one.
   *
   * The shape carries one key per provider because the credential types differ.
   * Naming the key here is what lets the readers stop spelling out which
   * provider owns which slot.
   */
  readonly accountAuthKey?: "openai" | "google";
  /** The credential discriminator this provider's account login produces. */
  readonly accountAuthType?: "openai-chatgpt-account" | "google-gemini-account";
  /**
   * The model an account connection uses when the user named none.
   *
   * Declared because the answer is a property of the service, not of the command
   * that asks: the same default is used by the login flow and by the model
   * command, and those two would otherwise be able to disagree.
   */
  readonly accountAuthDefaultModel?: string;
  /**
   * The models an account connection accepts, when the service publishes a fixed
   * set. Absent means the account can reach whatever the provider lists.
   */
  readonly accountAuthAllowedModels?: readonly string[];
  /**
   * The models to offer when the catalogue cannot be reached.
   *
   * Declared here because it is a property of the service, and because the
   * alternative — a chain of `if`s over provider names — had a fall-through that
   * answered with a different company's models. A provider added to the list
   * without one now fails to compile rather than silently offering those.
   */
  readonly fallbackModels: readonly string[];
}

/**
 * The providers this build knows.
 *
 * `satisfies` rather than an annotation: it proves every provider in the union
 * has an entry, which is the failure that matters here — a provider with no
 * declaration would otherwise be found at the moment someone used it.
 */
const FACTS = {
  openai: {
    label: "OpenAI",
    apiKeyEnvVar: "OPENAI_API_KEY",
    compatibleStyle: false,
    accountAuthKey: "openai",
    accountAuthType: "openai-chatgpt-account",
    accountAuthDefaultModel: "gpt-5.4",
    fallbackModels: ["gpt-4.1-mini", "gpt-4.1", "gpt-5.4"],
    accountAuthAllowedModels: [
      "gpt-5.1-codex",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex-mini",
      "gpt-5.2",
      "gpt-5.2-codex",
      "gpt-5.3-codex",
      "gpt-5.4",
      "gpt-5.4-mini",
    ],
  },
  anthropic: {
    label: "Anthropic",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    compatibleStyle: false,
    fallbackModels: ["claude-sonnet-4-5", "claude-opus-4-1"],
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    apiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY",
    compatibleStyle: true,
    fallbackModels: ["deepseek-ai/DeepSeek-V4-Flash", "Qwen/Qwen2.5-Coder-32B-Instruct"],
  },
  google: {
    label: "Google (OpenAI-compatible)",
    apiKeyEnvVar: "GOOGLE_API_KEY",
    compatibleStyle: true,
    accountAuthKey: "google",
    accountAuthType: "google-gemini-account",
    accountAuthDefaultModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  antigravity: {
    label: "Antigravity (OpenAI-compatible)",
    apiKeyEnvVar: "ANTIGRAVITY_API_KEY",
    compatibleStyle: true,
    fallbackModels: ["gpt-4.1-mini", "gpt-4.1", "gpt-5.4"],
  },
  claudecode: {
    label: "Anthropic-compatible proxy",
    apiKeyEnvVar: "CLAUDECODE_API_KEY",
    compatibleStyle: true,
    fallbackModels: ["gpt-4.1-mini", "gpt-4.1", "gpt-5.4"],
  },
} as const satisfies Record<RuntimeProvider, ProviderFacts>;

/**
 * The facts for a provider.
 *
 * An unknown name is not treated as one of these. The union is what the rest of
 * the code is typed against, so a lookup that fell back would answer questions
 * about a provider nobody declared with the answers for a different one — an
 * environment variable read from the wrong name, a label naming the wrong
 * service. Throwing makes the caller's assumption visible at the point it breaks.
 */
export function providerFacts(provider: RuntimeProvider): ProviderFacts {
  const facts = FACTS[provider] as ProviderFacts | undefined;
  if (!facts) {
    throw new Error(`No declaration for provider '${String(provider)}'.`);
  }
  return facts;
}

/**
 * Whether a provider needs a user-supplied endpoint and model.
 *
 * Was four identical copies of the same four-name comparison, one per file that
 * needed the answer. A provider added to three of them and missed in the fourth
 * would silently take the wrong path in the one that was missed.
 */
export function needsUserEndpoint(provider: RuntimeProvider): boolean {
  return providerFacts(provider).compatibleStyle;
}

/** The field of a per-provider account-auth object this provider's credential is stored in. */
export type AccountAuthKey = NonNullable<ProviderFacts["accountAuthKey"]>;

/**
 * The config slot a provider's account credential lives in, or nothing.
 *
 * A provider with no account login has none, which is the answer rather than a
 * reason to guess: reading another provider's slot would hand back a credential
 * belonging to a different service.
 */
export function accountAuthKey(provider: RuntimeProvider): AccountAuthKey | undefined {
  return providerFacts(provider).accountAuthKey;
}
