import { projectSessionModel } from "../../session/model/projection.js";
import { textSyntax, parseTextArgs } from "./syntax/text.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { credentialBlockMessage, resolveProviderCredential } from "../shell/providerCredentials.js";
import { credentialIdentityFor } from "../auth/account/pool.js";
import { accountAuthFor, providerAuthorization } from "../../provider/request/authorization.js";
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../auth/account/target.js';
import { configuredOutputLimit } from '../../provider/request/output.js';
import { requestSimpleCompletion } from "../../provider/request/completion.js";
import { loadCatalog } from "../models/catalogStore.js";
import { resolveRequestShape } from "../models/requestShape.js";
import { catalogModel, catalogProvider } from "../models/catalog.js";
import { providerFetchForEndpoint } from "../../provider/request/fetch.js";
import { endpointShape } from "../../provider/endpoints/index.js";
import { classifyProviderFailure, type ProviderFailureClass } from "../../provider/registry/provider.js";
import { ModelAdmissionError } from '../agent/request/model.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import { createReport, span } from './report/projection.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import { recordSessionUsage } from '../../observability/usageTelemetry.js';
import { hasUsage, usageFromProvider } from '../../provider/response/usage.js';

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

  const blocked = context.admission?.();
  if (blocked) return { kind: "local", output: blocked };
  const publication = context.readConfiguration?.();
  const runtimeConfig = publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
  const resolution = context.resolveConfigTarget?.(runtimeConfig) ?? resolveProviderCredential({ runtimeConfig });
  const credential = resolution.credential;
  const catalog = publication?.catalog ?? loadCatalog();
  if (resolution.blocked) return { kind: 'local', output: `Side question refused: ${credentialBlockMessage(resolution.blocked)}` };
  let baseUrl: string | undefined;
  try { baseUrl = providerCredentialBaseUrl(catalog, resolution); }
  catch { return { kind: 'local', output: 'Side question refused: the selected endpoint conflicts with the account credential binding.' }; }
  if (catalogProvider(catalog, resolution.provider, baseUrl).ambiguous) return { kind: 'local', output: 'Side question refused: multiple model catalogue entries claim this endpoint.' };
  const endpoint = providerCredentialEndpoint(catalog, resolution, baseUrl);

  let answer = "";
  let attempted = false;
  let failure: ProviderFailureClass | undefined;
  const accountAuth = credential ? accountAuthFor(resolution.provider, credential) : undefined;
  const identity = credentialIdentityFor(resolution.provider, credential);
  if (credential?.apiKey || accountAuth || endpointShape(endpoint).signer) {
    attempted = true;
    const model = resolution.model ?? credential?.model ?? "";
    const shape = resolveRequestShape(catalog, resolution.provider, model, undefined, baseUrl);
    const attribution = captureUsageAttribution({ provider: resolution.provider, model, baseUrl: baseUrl ?? '',
      rates: catalogModel(catalog, resolution.provider, model, baseUrl)?.cost });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIDE_QUESTION_TIMEOUT_MS);
    try {
      answer =
        (await requestSimpleCompletion({
          shape,
          onUsage: usage => {
            if (!hasUsage(usage)) return;
            const record = { ...usageFromProvider(usage), provider: resolution.provider, model, attribution };
            if (context.recordAuxiliaryUsage) context.recordAuxiliaryUsage(record);
            else if (context.sessionId) recordSessionUsage(context.sessionId, record, { affectsContext: false });
          },
          requestPolicy: context.requestPolicy,
          provider: {
            headers: providerAuthorization({
              apiKey: credential?.apiKey,
              ...(accountAuth ? { accountAuth } : {}),
              ...(endpoint ? { endpoint } : {}),
            }).headers,
            baseUrl: baseUrl ?? "",
            model,
            providerId: resolution.provider,
            ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
            ...(endpoint ? { endpoint } : {}),
            fetchImpl: providerFetchForEndpoint(runtimeConfig, endpoint, endpointShape, context.admission),
            modelTransport: providerModelTransport(runtimeConfig, endpoint, context.admission),
          },
          messages: [
            { role: "system", content: SIDE_QUESTION_SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
          maxOutputTokens: configuredOutputLimit(runtimeConfig, endpoint)
            ?? (endpointShape(endpoint).outputControl === 'provider' ? undefined : shape.maxOutputCeiling),
          supportsTemperature: shape.supportsTemperature,
          signal: controller.signal,
          onFailure: (classification) => { failure = classification; },
        })) ?? "";
    } catch (error) {
      if (error instanceof ModelAdmissionError) return { kind: 'local', output: error.message };
      failure ??= classifyProviderFailure({
        errorName: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const delivered = Boolean(answer);
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
    report: createReport({ title: 'Side question', facts: { question, delivered, providerRequest: attempted },
      lines: [{ kind: 'text', spans: [span(answer, 'text')] },
        { kind: 'text', spans: [span('Out-of-band: this exchange is excluded from the main session history.', 'muted')] }] }),
  };
}
