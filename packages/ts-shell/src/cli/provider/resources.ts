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
import { markContextUnknown } from '../../observability/usageTelemetry.js';
import { recordCount } from '../../observability/metrics.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { createCacheWarmingRunner, type CacheWarmingRunner } from '../../turn/cacheWarm.js';
import type { CompactionSetup } from '../../turn/session.js';
import { cacheRefreshFor } from '../runtime/cache.js';
import { buildCompactionWiring, nativeCompactionAuthority } from '../runtime/compaction.js';
import type { createCompactionProviders } from './compaction.js';

interface Resources {
  readonly compaction?: CompactionSetup;
  readonly cacheWarming?: CacheWarmingRunner;
}

/** Own one session's cache lifetime and prepare resources from each renewed target. */
export function createProviderResources(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
}, providers: ReturnType<typeof createCompactionProviders>) {
  let previousCacheWarming: CacheWarmingRunner | undefined;
  let releaseCacheListener: (() => void) | undefined;
  let cacheWarmingSessionId: string | undefined;

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
    // Retire the previous run before building another runner for the same prefix.
    releaseCacheListener?.();
    previousCacheWarming?.stop();
    previousCacheWarming = undefined;

    const prepareProviderResources = (resolved: ProviderCredentialResolution) => {
      const activeProvider = providers.provider(resolved, catalog);
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
            ...buildCompactionWiring({ provider: activeProvider, runtimeConfig: config, admission, sessionId, catalog, requestPolicy,
              workspaceRoot: input.runtimeContext.projectRoot, onCredentialPersisted: providers.publication }),
            authority: nativeCompactionAuthority({ sessionId, workspaceRoot: input.runtimeContext.projectRoot,
              admission, publication, configuration: input.runtimeContext.configuration, store: input.sessionManager }),
            onCompact: () => {
              markContextUnknown(sessionId);
              recordCount('compaction.runs', 1, {});
            },
          }
        : undefined;
      const resources = { compaction, cacheWarming };
      return run.resources ? run.resources(resources) : resources;
    };
    return prepareProviderResources;
  };
  return { installFreshState, startRun };
}
