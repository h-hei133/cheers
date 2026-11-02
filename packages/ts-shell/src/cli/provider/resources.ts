import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { ConfigPublication } from '../../config/state.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { catalogModel, type CatalogProvider } from '../../core/models/catalog.js';
import { resolveCacheWarmingMode } from '../../core/models/cacheEconomics.js';
import type { Admission } from '../../core/network/admission.js';
import { allowsSelfInitiatedRequests } from '../../core/network/policy.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { getSessionUsage, markContextUnknown } from '../../observability/usageTelemetry.js';
import { recordCount } from '../../observability/metrics.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { createCacheWarmingRunner, type CacheWarmingRunner } from '../../turn/cacheWarm.js';
import type { CompactionSetup } from '../../turn/session.js';
import { cacheRefreshFor } from '../runtime/cache.js';
import { buildCompactionWiring, nativeCompactionAuthority, type CompactionProvider } from '../runtime/compaction.js';
import type { createCompactionProviders } from './compaction.js';
import { createCompactionMeasurement } from './measurement.js';

interface Resources {
  readonly compaction?: CompactionSetup;
  readonly cacheWarming?: CacheWarmingRunner;
}

/** Own one session's cache lifetime and prepare resources from each renewed target. */
export function createProviderResources(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly providerRuntimeBridge: { readonly resolveCredentialSnapshot: () => ProviderCredentialResolution };
}, providers: ReturnType<typeof createCompactionProviders>) {
  let previousCacheWarming: CacheWarmingRunner | undefined;
  let releaseCacheListener: (() => void) | undefined;
  let cacheWarmingSessionId: string | undefined;
  const measurement = createCompactionMeasurement(() => {
    const usage = getSessionUsage(input.runtimeContext.session.id);
    return [usage.lastPromptIdentity, usage.lastPromptTokens, usage.lastPromptMessageCount,
      usage.recentRequests.at(-1), input.runtimeContext.promptIdentity];
  });
  let measurementScope: { readonly publication: ConfigPublication; readonly sessionId: string;
    readonly projectRoot: string; readonly provider: CompactionProvider } | undefined;

  input.runtimeContext.compactionMeasurement = () => {
    const scope = measurementScope;
    if (!scope) return undefined;
    try {
      const current = input.runtimeContext.configuration.current;
      const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
      const provider = providers.provider(resolved, current.catalog);
      if (scope.publication !== current || scope.sessionId !== input.runtimeContext.session.id
        || scope.projectRoot !== input.runtimeContext.projectRoot || !provider
        || provider.model !== scope.provider.model || provider.providerId !== scope.provider.providerId
        || provider.endpoint !== scope.provider.endpoint || provider.baseUrl !== scope.provider.baseUrl
        || provider.replayBinding !== scope.provider.replayBinding) {
        measurementScope = undefined;
        return undefined;
      }
      return measurement.read(scope.provider);
    } catch {
      measurementScope = undefined;
      return undefined;
    }
  };

  input.runtimeContext.compactionUnavailable = () => {
    const publication = input.runtimeContext.configuration.current;
    if (publication.admissionBlocked) return 'Configuration must be admitted before provider requests can be sent.';
    try {
      const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
      const availability = providers.availability(resolved, publication.catalog, publication.config);
      return availability.available ? undefined : availability.reason;
    } catch {
      return 'The provider configuration could not be resolved.';
    }
  };

  const installFreshState = (sessionRuntime: ShellSessionRuntime) => {
    input.runtimeContext.freshState = {
      admission: () => sessionRuntime.getCurrentRunController() !== null ? 'Wait for the current provider turn before resetting local state.' : undefined,
      clearCache: async () => {
        const sessionId = input.runtimeContext.session.id;
        const owner = previousCacheWarming;
        if (!owner || cacheWarmingSessionId !== sessionId) return 'unchanged';
        const result = await owner.reset();
        if (input.runtimeContext.session.id !== sessionId || owner !== previousCacheWarming) return 'unknown';
        previousCacheWarming = undefined; cacheWarmingSessionId = undefined;
        releaseCacheListener?.(); releaseCacheListener = undefined;
        return result;
      },
    };
  };

  const startRun = (run: {
    readonly config: RuntimeConfig;
    readonly catalog: readonly CatalogProvider[];
    readonly publication: ConfigPublication;
    readonly backgroundSignal: AbortSignal;
    readonly sessionId: string;
    readonly admission: Admission;
    readonly requestPolicy?: RequestPolicy;
    readonly getSourceEntryId: () => string | undefined;
    readonly resources?: (resources: Resources) => Resources;
  }) => {
    const { config, catalog, publication, backgroundSignal, sessionId, admission, requestPolicy } = run;
    measurementScope = undefined;
    // Retire the previous run before building another runner for the same prefix.
    releaseCacheListener?.();
    previousCacheWarming?.stop();
    previousCacheWarming = undefined;

    const prepareProviderResources = (resolved: ProviderCredentialResolution) => {
      const activeProvider = providers.provider(resolved, catalog);
      measurementScope = undefined;
      if (activeProvider) {
        measurement.reset(activeProvider);
        measurementScope = { publication, sessionId, projectRoot: input.runtimeContext.projectRoot, provider: activeProvider };
      }
      const warmingTarget = providers.target(resolved, catalog);
      const warmingModel = warmingTarget
        ? catalogModel(catalog, warmingTarget.provider, warmingTarget.model, warmingTarget.baseUrl)
        : undefined;
      const mayRefreshOnItsOwn = allowsSelfInitiatedRequests({ configuredOffline: config.offline === true });
      const cacheWarming = createCacheWarmingRunner({
        mode: mayRefreshOnItsOwn ? resolveCacheWarmingMode(config.cacheWarming) : 'off',
        ...(warmingModel ? { cost: warmingModel.cost, promptCache: warmingModel.promptCache } : {}),
        // Replay the captured request: rebuilding a prefix would buy a cache miss.
        ...cacheRefreshFor({ sessionId, runtimeConfig: config, admission, requestPolicy,
          ...(warmingTarget ? { baseUrl: warmingTarget.baseUrl, rates: warmingModel?.cost } : {}),
          ...(activeProvider ? { provider: activeProvider } : {}),
          ...(credentialIdentityFor(resolved.provider, resolved.credential) ? { credential: credentialIdentityFor(resolved.provider, resolved.credential)! } : {}),
          renewHeaders: async () => (await providers.renew(resolved, config, admission, catalog)).provider?.headers,
          isCurrent: () => !admission() && input.runtimeContext.configuration.current === publication &&
            input.runtimeContext.session.id === sessionId &&
            input.sessionManager.getSession(sessionId)?.turns.at(-1)?.id === run.getSourceEntryId(),
        }),
        onDecision: (_decision, stopReason) => { if (stopReason) input.renderer.renderLine(`Cache refresh stopped: ${stopReason}`); },
      });
      previousCacheWarming = cacheWarming;
      cacheWarmingSessionId = sessionId;
      const stopBackground = () => cacheWarming.stop();
      backgroundSignal.addEventListener('abort', stopBackground, { once: true });
      releaseCacheListener = () => backgroundSignal.removeEventListener('abort', stopBackground);
      if (backgroundSignal.aborted) cacheWarming.stop();

      const compaction: CompactionSetup | undefined = activeProvider
        ? {
            ...buildCompactionWiring({ provider: activeProvider, resolution: resolved, runtimeConfig: config, admission, sessionId, catalog, requestPolicy,
              workspaceRoot: input.runtimeContext.projectRoot, onCredentialPersisted: providers.publication }),
            authority: nativeCompactionAuthority({ sessionId, workspaceRoot: input.runtimeContext.projectRoot,
              admission, publication, configuration: input.runtimeContext.configuration, store: input.sessionManager }),
            onCompact: () => {
              measurement.reset(activeProvider);
              markContextUnknown(sessionId);
              recordCount('compaction.runs', 1, {});
            },
            // Said before the request goes out, so the refusal that follows is
            // not the first thing the user hears about it.
            onDeclined: message => { input.renderer.renderLine(message); },
            onDeadEnd: message => { input.renderer.renderLine(message); },
          }
        : undefined;
      const resources = { compaction, cacheWarming };
      const prepared = run.resources ? run.resources(resources) : resources;
      if (prepared.compaction && activeProvider) {
        const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(prepared.compaction);
        descriptors.policy = { configurable: true, enumerable: true, writable: true,
          value: measurement.wrap(prepared.compaction.policy, activeProvider) };
        return { ...prepared, compaction: Object.create(Object.getPrototypeOf(prepared.compaction), descriptors) as CompactionSetup };
      }
      return prepared;
    };
    return prepareProviderResources;
  };
  return { installFreshState, startRun };
}
