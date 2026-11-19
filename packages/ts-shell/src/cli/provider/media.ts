import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { catalogProvider, type CatalogProvider } from '../../core/models/catalog.js';
import { captureInputLimits } from '../../core/models/modalities.js';
import type { Admission } from '../../core/network/admission.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { approvedResult, deniedResult } from '../../core/tools/toolResultLifecycle.js';
import { ImageRequestError, requestGeneratedImages } from '../../provider/request/media.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js';
import { providerRequestTarget } from './requestTarget.js';

const BASE_URL = 'https://openrouter.ai/api/v1';
const ENDPOINT = 'openai-compatible';
const PROMPT_BYTES = 8 * 1024;

interface ImageHost {
  readonly providerMode: 'real' | 'synthetic';
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly runtimeConfig?: RuntimeConfig;
  readonly providerCatalog?: readonly CatalogProvider[];
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly requestPolicy?: RequestPolicy;
  readonly admission?: Admission;
}

/** Offer the declared image models under the run's exact active provider binding. */
export function imageGenerationTool(host: ImageHost): ToolDefinition | undefined {
  const { providerCredentialResolution: resolution, providerCatalog: catalog = [] } = host;
  if (host.providerMode !== 'real' || host.runtimeConfig?.offline || resolution.blocked
    || resolution.provider !== ENDPOINT || resolution.credential?.authMode !== 'api-key'
    || !resolution.credential.apiKey?.trim() || resolution.credential.accountAuth) return undefined;
  const baseUrl = providerCredentialBaseUrl(catalog, resolution);
  if (baseUrl?.replace(/\/+$/, '') !== BASE_URL) return undefined;
  const owner = catalogProvider(catalog, resolution.provider, baseUrl);
  if (owner.ambiguous || owner.entry?.id !== 'openrouter'
    || owner.entry.endpoint !== undefined && owner.entry.endpoint !== ENDPOINT) return undefined;
  const catalogModels = owner.entry.models;
  const ids = new Map<string, number>();
  for (const model of catalogModels) ids.set(model.id, (ids.get(model.id) ?? 0) + 1);
  const models = new Map(catalogModels.filter(model => model.modelType === 'image'
    && model.input?.includes('text') && model.output?.includes('image')
    && (model.compat?.endpoint === undefined || model.compat.endpoint === ENDPOINT)
    && ids.get(model.id) === 1
    && (host.runtimeConfig?.allowedModels === undefined || host.runtimeConfig.allowedModels.includes(`${resolution.provider}/${model.id}`)))
    .map(model => [model.id, model]));
  if (!models.size) return undefined;
  const prepare = (args: Record<string, unknown>) => {
    const model = typeof args.model === 'string' ? models.get(args.model) : undefined;
    const prompt = typeof args.prompt === 'string' ? args.prompt : '';
    if (!model || !prompt.trim() || Buffer.byteLength(prompt, 'utf8') > PROMPT_BYTES) {
      throw new Error('Choose an available image model and provide a text prompt within 8 KiB.');
    }
    const selected = { ...resolution, model: model.id };
    assertScopedModel(host.runtimeConfig, selected);
    const endpoint = providerCredentialEndpoint(catalog, selected, BASE_URL);
    if (endpoint !== undefined && endpoint !== ENDPOINT) throw new Error('The selected image protocol is unavailable.');
    const target = providerRequestTarget({ resolution: selected, baseUrl: BASE_URL, endpoint: ENDPOINT,
      workspaceRoot: host.workspaceRoot, sessionId: host.sessionId });
    const modelId = model.id;
    const outputText = model.output?.includes('text') === true;
    const inputLimits = captureInputLimits(model.inputLimits);
    return {
      targets: [],
      permissionArgs: Object.freeze({ model: modelId, prompt, endpoint: BASE_URL }),
      previewKind: 'execution' as const,
      preview: `Generate an image with ${modelId} at ${BASE_URL}\n\n${prompt}`,
      async execute(context: ToolExecutionContext) {
        const admission = () => host.admission?.() ?? context.admission?.();
        try {
          const images = await requestGeneratedImages({ baseUrl: BASE_URL, model: modelId, provider: resolution.provider,
            prompt, outputText, headers: target.headers,
            transport: providerModelTransport(host.runtimeConfig, ENDPOINT, admission),
            admission, signal: context.abortSignal, policy: host.requestPolicy, inputLimits,
            ...(target.credentialId && target.credentialGeneration ? { credential: { credentialId: target.credentialId, generation: target.credentialGeneration } } : {}) });
          return { ...approvedResult(`Generated ${images.length} image${images.length === 1 ? '' : 's'}.`), images };
        } catch (error) {
          return error instanceof ImageRequestError
            ? deniedResult(error.message, { failureClass: error.failure })
            : deniedResult('Image generation could not be verified.');
        }
      },
    };
  };
  return {
    name: 'generate_image',
    description: 'Generate an image from a text prompt with a model declared for image generation on the active connection.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['model', 'prompt'],
      properties: { model: { type: 'string', enum: [...models.keys()] }, prompt: { type: 'string' } } },
    prepare,
    async execute(args, context) { return prepare(args).execute(context); },
  };
}
