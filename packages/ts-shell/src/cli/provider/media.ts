import type { RuntimeConfig, RuntimeProvider } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { availablePoolConnections } from '../../core/auth/account/pool.js';
import { catalogProvider, type CatalogModel, type CatalogProvider } from '../../core/models/catalog.js';
import { captureInputLimits, modelSupportsVision, withDefaultImageLimits } from '../../core/models/modalities.js';
import type { Admission } from '../../core/network/admission.js';
import { resolveProviderCredential, type ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
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

type MediaRoute = { readonly provider: RuntimeProvider; readonly ownerId: string; readonly baseUrl: string };
const IMAGE_ROUTE: MediaRoute = { provider: IMAGE_ENDPOINT, ownerId: 'openrouter', baseUrl: IMAGE_BASE };
const DECISIONS_ROUTE: MediaRoute = { provider: 'openai', ownerId: 'openai', baseUrl: DECISIONS_BASE };

function matchesMediaRoute(resolution: ProviderCredentialResolution, catalog: readonly CatalogProvider[], route: MediaRoute): boolean {
  if (resolution.provider !== route.provider || resolution.blocked || resolution.credential?.authMode !== 'api-key'
    || !resolution.credential.apiKey?.trim() || resolution.credential.accountAuth) return false;
  const address = providerCredentialBaseUrl(catalog, resolution)?.replace(/\/+$/, '');
  return address === route.baseUrl;
}

function mediaResolution(host: MediaHost, route: MediaRoute): ProviderCredentialResolution | undefined {
  const { runtimeConfig: config, providerCredentialResolution: main, providerCatalog: catalog = [] } = host;
  if (host.providerMode !== 'real' || config?.offline || config?.configValidation.valid === false) return undefined;
  // The session's closed pool also bounds auxiliary provider calls.
  if (config?.accountPool?.[main.provider] && main.provider !== route.provider) return undefined;
  const pool = config?.accountPool?.[route.provider];
  const eligible = (resolution: ProviderCredentialResolution) => matchesMediaRoute(resolution, catalog, route);
  const poolMembers = pool && config ? availablePoolConnections({ config, provider: route.provider }) : undefined;
  if (eligible(main) && (!pool || poolMembers?.some(member => member.id === main.credential?.connectionId))) return main;
  if (!config) return undefined;

  const candidates = poolMembers ?? config.providerConnections.filter(connection => connection.autoSelect !== false);
  const bindings = candidates.flatMap(connection => {
    if (connection.provider !== route.provider || config.providerConnections.filter(item => item.id === connection.id).length !== 1) return [];
    // A generic API-key connection must name its endpoint itself. A bare native
    // connection uses its built-in endpoint, never a different profile's relay.
    const ownerAddress = connection.baseUrl?.replace(/\/+$/, '') ?? (route.provider === 'openai' ? DECISIONS_BASE : undefined);
    if (ownerAddress !== route.baseUrl) return [];
    const resolution = resolveProviderCredential({ runtimeConfig: { ...config,
      provider: route.provider, activeProviderConnectionId: connection.id,
      sessionConnection: { id: connection.id, provider: route.provider } }, env: {} });
    return resolution.credential?.connectionId === connection.id && eligible(resolution) ? [resolution] : [];
  });
  if (bindings.length === 1) return bindings[0];
  if (pool) {
    // Preserve the normal session affinity when the pool chooses this endpoint.
    const selected = resolveProviderCredential({ runtimeConfig: { ...config, provider: route.provider,
      activeProviderConnectionId: undefined, sessionConnection: undefined }, env: {}, pool: { sessionId: host.sessionId } });
    return bindings.find(binding => binding.credential?.connectionId === selected.credential?.connectionId);
  }
  if (bindings.length > 1) return undefined;

  const profile = resolveProviderCredential({ runtimeConfig: { ...config, provider: route.provider,
    activeProviderConnectionId: undefined, sessionConnection: { scope: 'provider', provider: route.provider } }, env: {} });
  return eligible(profile) ? profile : undefined;
}

function mediaModels(host: MediaHost, route: MediaRoute) {
  const catalog = host.providerCatalog ?? [];
  const { ambiguous, entry } = catalogProvider(catalog, route.provider, route.baseUrl);
  if (ambiguous || entry?.id !== route.ownerId || entry.runtime !== route.provider
    || entry.baseUrl?.replace(/\/+$/, '') !== route.baseUrl) return undefined;
  const resolution = mediaResolution(host, route);
  if (!resolution) return undefined;
  const counts = new Map<string, number>();
  for (const model of entry.models) counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
  const models = new Map(entry.models.filter(model => counts.get(model.id) === 1 && model.input?.includes('text')
    && (host.runtimeConfig?.allowedModels === undefined || host.runtimeConfig.allowedModels.includes(`${resolution.provider}/${model.id}`)))
    .map(model => [model.id, model]));
  return { resolution, models };
}

function boundModel(host: MediaHost, credential: ProviderCredentialResolution, model: CatalogModel, baseUrl: string, endpoint: string) {
  const modelId = model.id;
  const resolution = { ...credential, model: modelId };
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
  const target = mediaModels(host, IMAGE_ROUTE);
  if (!target) return undefined;
  const { resolution, models } = target;
  for (const [id, model] of models) {
    const endpoint = providerCredentialEndpoint(host.providerCatalog ?? [], { ...resolution, model: id }, IMAGE_BASE);
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
    const request = boundModel(host, resolution, model, IMAGE_BASE, IMAGE_ENDPOINT);
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
    description: 'Generate an image with a configured image model. Include verified inline references for models that accept images.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['model', 'prompt'],
      properties: { model: { type: 'string', enum: [...models.keys()] }, prompt: { type: 'string' }, references: mediaImagesSchema } },
    prepare, async execute(args, context) { return prepare(args).execute(context); },
  };
}

export function classificationTool(host: MediaHost): ModelDispatchTool | undefined {
  const target = mediaModels(host, DECISIONS_ROUTE);
  if (!target) return undefined;
  const { resolution, models } = target;
  for (const [id, model] of models) {
    if (model.modelType !== 'classifier' || model.compat?.endpoint !== DECISIONS_ENDPOINT) models.delete(id);
  }
  if (!models.size) return undefined;
  const prepare = (args: Record<string, unknown>) => {
    const model = typeof args.model === 'string' ? models.get(args.model) : undefined;
    if (!model) throw new Error('Choose an available classification model.');
    const { state, questions } = captureQuestions(args.state, args.questions);
    const images = captureMediaImages(args.images, modelSupportsVision(model));
    const request = boundModel(host, resolution, model, DECISIONS_BASE, DECISIONS_ENDPOINT);
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
    description: 'Classify state and optional inline images with a configured classification model.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['model', 'state', 'questions'],
      properties: { model: { type: 'string', enum: [...models.keys()] }, state: { type: 'object' }, questions: questionsSchema, images: mediaImagesSchema } },
    prepare, async execute(args, context) { return prepare(args).execute(context); },
  };
}

export function mediaTools(host: MediaHost): ModelDispatchTool[] {
  return [imageGenerationTool(host), classificationTool(host)].filter(tool => tool !== undefined);
}
