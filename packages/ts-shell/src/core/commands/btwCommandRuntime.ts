import { projectSessionModel } from "../../session/model/projection.js";
import { textSyntax, parseTextArgs } from "./syntax/text.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { accountAuthFor, providerAuthorization } from "../../provider/request/authorization.js";
import { requestSimpleCompletion } from "../../provider/request/completion.js";
import { loadCatalog } from "../models/catalogStore.js";
import { resolveRequestShape } from "../models/requestShape.js";
import { providerEndpoint } from "../models/catalog.js";
import { providerFetchForEndpoint } from "../../provider/request/fetch.js";
import { endpointShape } from "../../provider/endpoints/index.js";
import { classifyProviderFailure, type ProviderFailureClass } from "../../provider/registry/provider.js";

/** How long a side question may take before it is abandoned. */
const SIDE_QUESTION_TIMEOUT_MS = 15_000;

/** What the side channel is asked to be. Terse, because the answer is a tangent. */
const SIDE_QUESTION_SYSTEM_PROMPT =
  "You are a concise, helpful coding assistant answering a quick side-question out of band. Give a direct, accurate, terse answer in markdown.";

/**
 * A side question, answered out of band.
 *
 * It goes through the provider layer like every other model call. It used to
 * build its own request against whatever `SILICONFLOW_*` or `OPENAI_*` variables
 * happened to be set, which meant a session configured through `/connect` asked
 * its side question of a different provider entirely — and the request-shape,
 * credential, and transport handling done in the provider layer never applied to
 * it.
 */
export const btwSyntax = textSyntax("btw", "question", true);

export async function runBtwCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseTextArgs(btwSyntax, args, context.rawCommandArgs);
  if (!parsed.ok) {
    return {
      kind: "local",
      output: `${parsed.reason}\n${syntaxHelp(btwSyntax)}\nExample: /btw what is the difference between Array.slice and splice in JS?\n\nSide questions provide answers outside your active conversation history.`,
    };
  }
  const question = parsed.text;

  const runtimeConfig = projectSessionModel(getRuntimeConfig(context.cwd), context.sessionId);
  const resolution = resolveProviderCredential({ runtimeConfig });
  const credential = resolution.credential;
  const catalog = loadCatalog();
  const endpoint = providerEndpoint(catalog, resolution.provider);

  let answer = "";
  let attempted = false;
  let failure: ProviderFailureClass | undefined;
  const accountAuth = credential ? accountAuthFor(resolution.provider, credential) : undefined;
  if (credential?.apiKey || accountAuth || endpointShape(endpoint).signer) {
    attempted = true;
    const model = resolution.model ?? credential?.model ?? "";
    const shape = resolveRequestShape(catalog, resolution.provider, model, undefined);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIDE_QUESTION_TIMEOUT_MS);
    try {
      answer =
        (await requestSimpleCompletion({
          provider: {
            headers: providerAuthorization({
              apiKey: credential?.apiKey,
              ...(accountAuth ? { accountAuth } : {}),
              ...(endpoint ? { endpoint } : {}),
            }).headers,
            baseUrl: resolution.baseUrl ?? credential?.baseUrl ?? "",
            model,
            providerId: resolution.provider,
            ...(endpoint ? { endpoint } : {}),
            fetchImpl: providerFetchForEndpoint(runtimeConfig, endpoint, endpointShape),
          },
          messages: [
            { role: "system", content: SIDE_QUESTION_SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
          supportsTemperature: shape.supportsTemperature,
          signal: controller.signal,
          onFailure: (classification) => { failure = classification; },
        })) ?? "";
    } catch (error) {
      failure ??= classifyProviderFailure({
        errorName: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (!answer) {
    // Two different situations, and telling them apart is the difference between
    // a user checking their configuration and a user checking their network. A
    // request that went out and failed is not a missing credential.
    answer = attempted
      ? `Side question noted: "${question}".\n(The provider request returned no answer. Failure: ${failure ?? "provider_output_insufficient"}.)`
      : `Side question noted: "${question}".\n(No provider credential is configured, so nothing was sent.)`;
  }

  const lines: string[] = [
    `# 💬 Side Question (/btw): "${question}"`,
    "",
    "---",
    answer,
    "",
    "---",
    "*✨ Note: This exchange is out-of-band and is 100% excluded from your main session history.*",
  ];

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
