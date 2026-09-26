import type { CommandContext, LocalCommandResult } from "./types.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { accountAuthFor, providerAuthorization } from "../../provider/request/authorization.js";
import { requestSimpleCompletion } from "../../provider/request/completion.js";
import { loadCatalog } from "../models/catalogStore.js";
import { providerEndpoint } from "../models/catalog.js";
import { providerFetchFor } from "../../provider/request/fetch.js";

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
export async function runBtwCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const question = args.join(" ").trim();
  if (!question) {
    return {
      kind: "local",
      output: "Usage: `/btw <question>`\nExample: `/btw what is the difference between Array.slice and splice in JS?`\n\nSide questions provide instant answers without adding clutter to your active conversation history.",
    };
  }

  const runtimeConfig = getRuntimeConfig(context.cwd);
  const resolution = resolveProviderCredential({ runtimeConfig });
  const credential = resolution.credential;

  let answer = "";
  const accountAuth = credential ? accountAuthFor(resolution.provider, credential) : undefined;
  if (credential && (credential.apiKey || accountAuth)) {
    const catalog = loadCatalog();
    const endpoint = providerEndpoint(catalog, resolution.provider);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIDE_QUESTION_TIMEOUT_MS);
    try {
      answer =
        (await requestSimpleCompletion({
          provider: {
            headers: providerAuthorization({
              apiKey: credential.apiKey,
              ...(accountAuth ? { accountAuth } : {}),
              ...(endpoint ? { endpoint } : {}),
            }).headers,
            baseUrl: resolution.baseUrl ?? credential.baseUrl ?? "",
            model: resolution.model ?? credential.model ?? "",
            providerId: resolution.provider,
            ...(endpoint ? { endpoint } : {}),
            fetchImpl: providerFetchFor(runtimeConfig),
          },
          messages: [
            { role: "system", content: SIDE_QUESTION_SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
          supportsTemperature: false,
          signal: controller.signal,
        })) ?? "";
    } catch {
      // A side question that fails is a side question with no answer; the
      // fallback below says so rather than reporting a transport error.
    } finally {
      clearTimeout(timer);
    }
  }

  if (!answer) {
    answer = `Side question noted: "${question}".\n(No provider credential is configured, so nothing was sent.)`;
  }

  const lines: string[] = [
    `# 💬 Side Question (/btw): "${question}"`,
    "",
    "---",
    answer,
    "",
    "---",
    "*✨ Note: This exchange was answered out-of-band and is 100% excluded from your main session history.*",
  ];

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
