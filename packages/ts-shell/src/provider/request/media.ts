import { createToolMediaBudget } from '../../core/agent/media.js';
import type { ModelTransport, RequestPolicy } from '../../core/agent/request/model.js';
import type { ModelInputLimits } from '../../core/models/modalities.js';
import { assertAdmission, type Admission } from '../../core/network/admission.js';
import { NetworkError } from '../../core/network/error.js';
import { requestScope } from '../../core/network/request.js';
import { discardResponse, parseResponseJson, readResponseText } from '../../core/network/response.js';
import { isRecord } from '../../core/values/record.js';
import { canonicalImageMime, inspectImage } from '../../model-adapters/image/input.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';
import type { ProviderUsage } from '../../turn/completion.js';
import { endpointBody, endpointShape, endpointUrl } from '../endpoints/index.js';
import { classifyProviderFailure, type ProviderFailureClass } from '../registry/provider.js';
import { prepareRequestAttempt } from './attempt.js';
import { providerRequestError } from './error.js';
import type { CredentialKey } from './backoff.js';

const ENDPOINT = 'openai-compatible';
const RESPONSE_OVERHEAD_BYTES = 64 * 1024;
const DECODED_BYTES = 64 * 1024 * 1024;

export class ImageRequestError extends Error {
  constructor(readonly failure: ProviderFailureClass) {
    super(`Image generation failed (${failure}).`);
  }
}

interface ImageRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly provider: string;
  readonly prompt: string;
  readonly outputText: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly transport: ModelTransport;
  readonly admission: Admission;
  readonly signal?: AbortSignal;
  readonly policy?: RequestPolicy;
  readonly credential?: CredentialKey;
  readonly inputLimits?: ModelInputLimits;
}

function generatedImages(value: unknown): readonly ImageContent[] {
  if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0])) {
    throw new ImageRequestError('provider_response_malformed');
  }
  const choice = value.choices[0];
  if (!isRecord(choice.message)) throw new ImageRequestError('provider_response_malformed');
  if (choice.finish_reason === 'content_filter' || choice.finish_reason === 'refusal'
    || typeof choice.message.refusal === 'string' && choice.message.refusal.trim()) throw new ImageRequestError('provider_safety_block');
  if (choice.finish_reason === 'error' || choice.finish_reason === 'length' || choice.finish_reason === 'tool_calls') {
    throw new ImageRequestError('provider_output_invalid');
  }
  const entries = choice.message.images;
  if (!Array.isArray(entries) || !entries.length) throw new ImageRequestError('provider_output_insufficient');
  const budget = createToolMediaBudget();
  if (entries.length > budget.images) throw new ImageRequestError('provider_output_invalid');
  return Object.freeze(entries.map(entry => {
    const source = isRecord(entry) ? entry.image_url : undefined;
    const url = isRecord(source) ? source.url : source;
    const parts = typeof url === 'string' ? /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(url) : undefined;
    if (!parts || parts[2]!.length > budget.encodedBytes) throw new ImageRequestError('provider_output_invalid');
    const image: ImageContent = Object.freeze({ type: 'image', mimeType: canonicalImageMime(parts[1]!.toLowerCase()), data: parts[2]! });
    try {
      const { widthPx, heightPx } = inspectImage(image);
      if (widthPx * heightPx > DECODED_BYTES / 4) throw new Error();
    } catch { throw new ImageRequestError('provider_output_invalid'); }
    budget.encodedBytes -= image.data.length;
    return image;
  }));
}

/** The selected image service uses native nonstreaming chat completion media. */
export async function requestGeneratedImages(input: ImageRequest): Promise<readonly ImageContent[]> {
  const scope = requestScope(90_000, input.signal);
  try {
    assertAdmission(input.admission);
    scope.check();
    const body = JSON.stringify({
      ...endpointBody(ENDPOINT, { baseUrl: input.baseUrl, model: input.model, messages: [{ role: 'user', content: input.prompt }] }),
      modalities: input.outputText ? ['image', 'text'] : ['image'], stream: false,
    });
    const attempt = await prepareRequestAttempt({ body, provider: input.provider, model: input.model, endpoint: ENDPOINT,
      purpose: 'image-generation', policy: input.policy, credential: input.credential, inputLimits: input.inputLimits });
    const response = await attempt.send(endpointUrl(input.baseUrl, ENDPOINT, input.model, false), {
      method: 'POST', redirect: 'error', headers: { ...input.headers, accept: 'application/json' }, body, signal: scope.signal,
    }, fetch, input.transport);
    let usage: ProviderUsage | undefined;
    try {
      if (!response.ok) {
        discardResponse(response);
        throw new ImageRequestError(classifyProviderFailure({ status: response.status }));
      }
      const value = parseResponseJson(await readResponseText(response, scope, createToolMediaBudget().encodedBytes + RESPONSE_OVERHEAD_BYTES));
      usage = endpointShape(ENDPOINT).readBody(value).usage;
      const images = generatedImages(value);
      scope.check();
      assertAdmission(input.admission);
      return images;
    } finally { attempt.settle(usage); }
  } catch (error) {
    if (error instanceof ImageRequestError) throw error;
    if (input.signal?.aborted) throw new ImageRequestError('provider_cancelled');
    if (scope.signal.aborted) throw new ImageRequestError('provider_timeout');
    if (error instanceof NetworkError) throw new ImageRequestError('provider_response_malformed');
    throw new ImageRequestError(providerRequestError(error).failureClass ?? 'provider_unknown');
  } finally { scope.dispose(); }
}
