import type { CatalogModel, CatalogProvider } from '../../core/models/catalog.js';
import type { RuntimeProvider } from '../../config/runtimeConfig.js';
import { isRuntimeProvider } from '../../config/runtimeConfig.js';
import { snapshotData } from '../../core/values/data.js';
import { isRecord } from '../../core/values/record.js';

export type ExtensionProviderModel = Pick<CatalogModel, 'id' | 'contextWindow' | 'inputLimit' | 'maxTokens' | 'reasoning' | 'toolCalling' | 'vision'>;

export interface ExtensionProvider {
  readonly label?: string;
  readonly runtime: RuntimeProvider;
  readonly baseUrl: string;
  readonly models: readonly ExtensionProviderModel[];
}

export const MAX_EXTENSION_PROVIDERS = 16;
export const EXTENSION_MODEL_PREFIX = 'extension:';
const modelFields = new Set(['id', 'contextWindow', 'inputLimit', 'maxTokens', 'reasoning', 'toolCalling', 'vision']);

export interface InstalledProvider {
  readonly name: string;
  readonly script: string;
  readonly runtime: RuntimeProvider;
  readonly baseUrl: string;
}

export function captureProviderEndpoint(id: unknown, runtime: unknown, baseUrl: unknown): Pick<InstalledProvider, 'name' | 'runtime' | 'baseUrl'> {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(id) || isRuntimeProvider(id)) throw new Error('Invalid extension provider name.');
  if (!isRuntimeProvider(runtime) || typeof baseUrl !== 'string' || baseUrl.length > 2048) throw new Error('Invalid extension provider definition.');
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)
    || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Invalid extension provider endpoint.');
  return { name: id, runtime, baseUrl: url.href.replace(/\/+$/, '') };
}

function captureModel(value: unknown): ExtensionProviderModel {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[^\s\x00-\x1f\x7f-\x9f]{1,512}$/.test(value.id)
    || Object.keys(value).some(key => !modelFields.has(key))) throw new Error('Invalid extension provider model.');
  for (const field of ['contextWindow', 'inputLimit', 'maxTokens']) {
    const number = value[field];
    if (number !== undefined && (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1)) throw new Error('Invalid extension provider model limit.');
  }
  for (const field of ['reasoning', 'toolCalling', 'vision']) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') throw new Error('Invalid extension provider model capability.');
  }
  return value as unknown as ExtensionProviderModel;
}

export function captureExtensionProvider(id: unknown, input: unknown): CatalogProvider {
  const value = snapshotData(input, { bytes: 128 * 1024, nodes: 8_192, depth: 4, allowCrossRealm: true });
  if (!isRecord(value) || Object.keys(value).some(field => !['label', 'runtime', 'baseUrl', 'models'].includes(field))
    || (value.label !== undefined && (typeof value.label !== 'string' || !/^[^\x00-\x1f\x7f-\x9f]{1,128}$/.test(value.label)))
    || !Array.isArray(value.models) || value.models.length < 1 || value.models.length > 256) throw new Error('Invalid extension provider definition.');
  const endpoint = captureProviderEndpoint(id, value.runtime, value.baseUrl);
  const models = Object.freeze(value.models.map(captureModel));
  if (new Set(models.map(model => model.id)).size !== models.length) throw new Error('Extension provider model registration collision.');
  return Object.freeze({ id: endpoint.name, label: (value.label as string | undefined) ?? endpoint.name,
    runtime: endpoint.runtime, baseUrl: endpoint.baseUrl, models, auth: 'api-key' });
}
