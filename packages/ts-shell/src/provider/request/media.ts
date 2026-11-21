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
import type { ChatMessage } from '../../turn/prompt.js';
import type { ProviderUsage } from '../../turn/completion.js';
import { endpointBody, endpointShape, endpointUrl } from '../endpoints/index.js';
import { DECISIONS_ENDPOINT, DecisionResponseError, decisionAnswers, decisionsBody, type ClassificationAnswer, type ClassificationQuestion } from '../endpoints/decisions.js';
import { classifyProviderFailure, type ProviderFailureClass } from '../registry/provider.js';
import { prepareRequestAttempt } from './attempt.js';
import { providerRequestError } from './error.js';
import type { CredentialKey } from './backoff.js';
import { InputLimitError, normalizeRequestImages, requestInputLimits } from './input.js';

const ENDPOINT = 'openai-compatible';
const RESPONSE_OVERHEAD_BYTES = 64 * 1024;
const DECODED_BYTES = 64 * 1024 * 1024;

export class ImageRequestError extends Error {
  constructor(readonly failure: ProviderFailureClass) {
    super(`Image generation failed (${failure}).`);
  }
}

export class ClassificationRequestError extends Error {
  constructor(readonly failure: ProviderFailureClass) {
    super(`Model classification failed (${failure}).`);
  }
}

interface MediaRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly provider: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly transport: ModelTransport;
  readonly admission: Admission;
  readonly signal?: AbortSignal;
  readonly policy?: RequestPolicy;
  readonly credential?: CredentialKey;
  readonly inputLimits?: ModelInputLimits;
  readonly cwd?: string;
}

interface ImageRequest extends MediaRequest {
  readonly prompt: string;
  readonly references?: readonly ImageContent[];
  readonly outputText: boolean;
}

interface ClassificationRequest extends MediaRequest {
  readonly state: Readonly<Record<string, unknown>>;
  readonly questions: Readonly<Record<string, ClassificationQuestion>>;
  readonly images?: readonly ImageContent[];
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

async function requestMedia<T>(input: MediaRequest, options: {
  readonly endpoint: string;
  readonly purpose: string;
  readonly images: readonly ImageContent[];
  readonly maxResponseBytes: number;
  readonly build: (images: readonly ImageContent[]) => Record<string, unknown>;
  readonly read: (value: unknown) => T;
  readonly failure: new (failure: ProviderFailureClass) => Error;
}): Promise<T> {
  const scope = requestScope(90_000, input.signal);
  try {
    assertAdmission(input.admission);
    scope.check();
    const inputLimits = requestInputLimits(input.inputLimits);
    const images = await normalizedImages(options.images, inputLimits, input.cwd, scope.signal);
    assertAdmission(input.admission);
    scope.check();
    const body = JSON.stringify(options.build(images));
    const endpoint = options.endpoint;
    const attempt = await prepareRequestAttempt({ body, provider: input.provider, model: input.model, endpoint,
      purpose: options.purpose, policy: input.policy, credential: input.credential,
      inputLimits: images.length ? inputLimits : inputLimits && { maxRequestBytes: inputLimits.maxRequestBytes } });
    const response = await attempt.send(endpointUrl(input.baseUrl, endpoint, input.model, false), {
      method: 'POST', redirect: 'error', headers: { ...input.headers, accept: 'application/json' }, body, signal: scope.signal,
    }, fetch, (url, init, beforeDispatch) => input.transport(url, init, () => {
      assertAdmission(input.admission);
      scope.check();
      beforeDispatch();
    }));
    let usage: ProviderUsage | undefined;
    try {
      if (!response.ok) {
        discardResponse(response);
        throw new options.failure(classifyProviderFailure({ status: response.status }));
      }
      const value = parseResponseJson(await readResponseText(response, scope, options.maxResponseBytes));
      usage = endpointShape(endpoint).readBody(value).usage;
      const result = options.read(value);
      scope.check();
      assertAdmission(input.admission);
      return result;
    } finally { attempt.settle(usage); }
  } catch (error) {
    if (error instanceof options.failure || error instanceof InputLimitError) throw error;
    if (input.signal?.aborted) throw new options.failure('provider_cancelled');
    if (scope.signal.aborted) throw new options.failure('provider_timeout');
    if (error instanceof DecisionResponseError) throw new options.failure(error.failure);
    if (error instanceof NetworkError) throw new options.failure('provider_response_malformed');
    throw new options.failure(providerRequestError(error).failureClass ?? 'provider_unknown');
  } finally { scope.dispose(); }
}

async function normalizedImages(images: readonly ImageContent[], limits: ModelInputLimits | undefined,
  cwd: string | undefined, signal: AbortSignal): Promise<readonly ImageContent[]> {
  if (!images.length) return images;
  const budget = createToolMediaBudget();
  if (images.length > Math.min(budget.images, limits?.images?.maxPerMessage ?? Infinity, limits?.images?.maxPerRequest ?? Infinity)) {
    throw new InputLimitError('The selected model does not accept this number of input images.');
  }
  const captured = images.map(image => {
    const copy = { type: 'image' as const, mimeType: canonicalImageMime(image.mimeType), data: image.data };
    budget.encodedBytes -= copy.data.length;
    if (budget.encodedBytes < 0) throw new InputLimitError('The input exceeds the 4MiB encoded media limit.');
    try { inspectImage(copy); } catch { throw new InputLimitError('Input image data could not be verified.'); }
    return Object.freeze(copy);
  });
  const [message] = await normalizeRequestImages<ChatMessage>([{ role: 'user', content: captured }], true, limits,
    cwd ?? process.cwd(), signal);
  const content = message?.content;
  if (!Array.isArray(content) || content.some(block => block.type !== 'image')) {
    throw new InputLimitError('Input image normalization could not be verified.');
  }
  const normalized: readonly ImageContent[] = content;
  if (normalized.reduce((bytes, image) => bytes + image.data.length, 0) > createToolMediaBudget().encodedBytes) {
    throw new InputLimitError('Normalized input exceeds the 4MiB encoded media limit.');
  }
  return normalized;
}

export function requestGeneratedImages(input: ImageRequest): Promise<readonly ImageContent[]> {
  return requestMedia(input, { endpoint: ENDPOINT, purpose: 'image-generation', images: input.references ?? [],
    maxResponseBytes: createToolMediaBudget().encodedBytes + RESPONSE_OVERHEAD_BYTES,
    failure: ImageRequestError, read: generatedImages,
    build: images => ({
      ...endpointBody(ENDPOINT, { baseUrl: input.baseUrl, model: input.model, vision: images.length > 0,
        messages: [{ role: 'user', content: images.length ? [{ type: 'text', text: input.prompt }, ...images] : input.prompt }] }),
      modalities: input.outputText ? ['image', 'text'] : ['image'], stream: false,
    }) });
}

export function requestClassification(input: ClassificationRequest): Promise<Readonly<Record<string, ClassificationAnswer>>> {
  return requestMedia(input, { endpoint: DECISIONS_ENDPOINT, purpose: 'classification', images: input.images ?? [],
    maxResponseBytes: 256 * 1024, failure: ClassificationRequestError,
    build: images => decisionsBody(input.model, input.state, input.questions, images),
    read: value => decisionAnswers(value, input.questions) });
}
