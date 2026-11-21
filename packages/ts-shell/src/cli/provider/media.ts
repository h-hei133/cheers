import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { catalogProvider, type CatalogModel, type CatalogProvider } from '../../core/models/catalog.js';
import { captureInputLimits, modelSupportsVision, withDefaultImageLimits } from '../../core/models/modalities.js';
import type { Admission } from '../../core/network/admission.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { MODEL_DISPATCH_TOOL, type ModelDispatchTool } from '../../core/tools/codemode/models.js';
import { approvedResult, deniedResult } from '../../core/tools/toolResultLifecycle.js';
import { DECISIONS_ENDPOINT } from '../../provider/endpoints/decisions.js';
import { InputLimitError } from '../../provider/request/input.js';
import { ClassificationRequestError, ImageRequestError, requestClassification, requestGeneratedImages } from '../../provider/request/media.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import type { ToolExecutionContext } from '../../tools/types.js';
import { captureMediaImages, captureQuestions, mediaImageProof, mediaImagesSchema, questionsSchema } from './mediaInput.js';
import { providerRequestTarget } from './requestTarget.js';

const IMAGE_BASE = 'https://openrouter.ai/api/v1';
const IMAGE_ENDPOINT = 'openai-compatible';
const DECISIONS_BASE = 'https://api.openai.com/v1';
const PROMPT_BYTES = 8 * 1024;

interface MediaHost {
  readonly providerMode: 'real' | 'synthetic';
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly runtimeConfig?: RuntimeConfig;
  readonly providerCatalog?: readonly CatalogProvider[];
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly requestPolicy?: RequestPolicy;
  readonly admission?: Admission;
}

function activeModels(host: MediaHost, ownerId: string, baseUrl: string): Map<string, CatalogModel> {
  const { providerCredentialResolution: resolution, providerCatalog: catalog = [] } = host;
  if (host.providerMode !== 'real' || host.runtimeConfig?.offline || resolution.blocked
    || resolution.credential?.authMode !== 'api-key' || !resolution.credential.apiKey?.trim()
    || resolution.credential.accountAuth) return new Map();
  const address = providerCredentialBaseUrl(catalog, resolution)?.replace(/\/+$/, '');
  if (address !== baseUrl) return new Map();
  const { ambiguous, entry } = catalogProvider(catalog, resolution.provider, address);
  if (ambiguous || entry?.id !== ownerId || entry.runtime !== resolution.provider
    || entry.baseUrl?.replace(/\/+$/, '') !== baseUrl) return new Map();
  const counts = new Map<string, number>();
  for (const model of entry.models) counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
  return new Map(entry.models.filter(model => counts.get(model.id) === 1 && model.input?.includes('text')
    && (host.runtimeConfig?.allowedModels === undefined || host.runtimeConfig.allowedModels.includes(`${resolution.provider}/${model.id}`)))
    .map(model => [model.id, model]));
}

function boundModel(host: MediaHost, model: CatalogModel, baseUrl: string, endpoint: string) {
  const modelId = model.id;
  const resolution = { ...host.providerCredentialResolution, model: modelId };
  assertScopedModel(host.runtimeConfig, resolution);
  const target = providerRequestTarget({ resolution, baseUrl, endpoint,
    workspaceRoot: host.workspaceRoot, sessionId: host.sessionId });
  const inputLimits = captureInputLimits(withDefaultImageLimits(model).inputLimits);
  const transportOptions = host.runtimeConfig;
  return (context: ToolExecutionContext) => {
    const admission = () => host.admission?.() ?? context.admission?.();
    return { baseUrl, model: modelId, provider: resolution.provider, headers: target.headers, cwd: host.workspaceRoot,
      transport: providerModelTransport(transportOptions, endpoint, admission), admission, signal: context.abortSignal,
      policy: host.requestPolicy, inputLimits,
      ...(target.credentialId && target.credentialGeneration
        ? { credential: { credentialId: target.credentialId, generation: target.credentialGeneration } } : {}) };
  };
}

function refused(error: unknown, fallback: string) {
  if (error instanceof InputLimitError) return deniedResult(error.message);
  if (error instanceof ImageRequestError || error instanceof ClassificationRequestError) {
    return deniedResult(error.message, { failureClass: error.failure });
  }
  return deniedResult(fallback);
}

export function imageGenerationTool(host: MediaHost): ModelDispatchTool | undefined {
  if (host.providerCredentialResolution.provider !== IMAGE_ENDPOINT) return undefined;
  const models = activeModels(host, 'openrouter', IMAGE_BASE);
  for (const [id, model] of models) {
    const endpoint = providerCredentialEndpoint(host.providerCatalog ?? [], { ...host.providerCredentialResolution, model: id }, IMAGE_BASE);
    if (model.modelType !== 'image' || !model.output?.includes('image')
      || endpoint !== undefined && endpoint !== IMAGE_ENDPOINT
      || model.compat?.endpoint !== undefined && model.compat.endpoint !== IMAGE_ENDPOINT) models.delete(id);
  }
  if (!models.size) return undefined;
  const prepare = (args: Record<string, unknown>) => {
    const model = typeof args.model === 'string' ? models.get(args.model) : undefined;
    const prompt = typeof args.prompt === 'string' ? args.prompt : '';
    if (!model || !prompt.trim() || Buffer.byteLength(prompt, 'utf8') > PROMPT_BYTES) {
      throw new Error('Choose an available image model and provide a text prompt within 8 KiB.');
    }
    const references = captureMediaImages(args.references, modelSupportsVision(model));
    const request = boundModel(host, model, IMAGE_BASE, IMAGE_ENDPOINT);
    const outputText = model.output?.includes('text') === true;
    return {
      targets: [], permissionArgs: Object.freeze({ model: model.id, prompt, endpoint: IMAGE_BASE, references: mediaImageProof(references) }),
      previewKind: 'execution' as const,
      preview: `Generate an image with ${model.id} at ${IMAGE_BASE}\n\n${prompt}${references.length ? `\n\nReference images: ${references.length}` : ''}`,
      async execute(context: ToolExecutionContext) {
        try {
          const images = await requestGeneratedImages({ ...request(context), prompt, outputText, references });
          return { ...approvedResult(`Generated ${images.length} image${images.length === 1 ? '' : 's'}.`), images };
        } catch (error) { return refused(error, 'Image generation could not be verified.'); }
      },
    };
  };
  return {
    [MODEL_DISPATCH_TOOL]: true,
    name: 'generate_image',
    resultAdmission: host.admission,
    description: 'Generate an image with an admitted model on the active connection. Include verified inline references for models that accept images.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['model', 'prompt'],
      properties: { model: { type: 'string', enum: [...models.keys()] }, prompt: { type: 'string' }, references: mediaImagesSchema } },
    prepare, async execute(args, context) { return prepare(args).execute(context); },
  };
}

export function classificationTool(host: MediaHost): ModelDispatchTool | undefined {
  if (host.providerCredentialResolution.provider !== 'openai') return undefined;
  const models = activeModels(host, 'openai', DECISIONS_BASE);
  for (const [id, model] of models) {
    if (model.modelType !== 'classifier' || model.compat?.endpoint !== DECISIONS_ENDPOINT) models.delete(id);
  }
  if (!models.size) return undefined;
  const prepare = (args: Record<string, unknown>) => {
    const model = typeof args.model === 'string' ? models.get(args.model) : undefined;
    if (!model) throw new Error('Choose an available classification model.');
    const { state, questions } = captureQuestions(args.state, args.questions);
    const images = captureMediaImages(args.images, modelSupportsVision(model));
    const request = boundModel(host, model, DECISIONS_BASE, DECISIONS_ENDPOINT);
    return {
      targets: [], previewKind: 'execution' as const,
      permissionArgs: Object.freeze({ model: model.id, endpoint: DECISIONS_BASE, state, questions, images: mediaImageProof(images) }),
      preview: `Classify state with ${model.id} at ${DECISIONS_BASE}\n\n${JSON.stringify({ state, questions })}${images.length ? `\n\nInput images: ${images.length}` : ''}`,
      async execute(context: ToolExecutionContext) {
        try {
          const answers = await requestClassification({ ...request(context), state, questions, images });
          return approvedResult(JSON.stringify(answers));
        } catch (error) { return refused(error, 'Classification could not be verified.'); }
      },
    };
  };
  return {
    [MODEL_DISPATCH_TOOL]: true,
    name: 'classify',
    resultAdmission: host.admission,
    description: 'Classify state and optional inline images with an admitted classification model on the active connection.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['model', 'state', 'questions'],
      properties: { model: { type: 'string', enum: [...models.keys()] }, state: { type: 'object' }, questions: questionsSchema, images: mediaImagesSchema } },
    prepare, async execute(args, context) { return prepare(args).execute(context); },
  };
}
