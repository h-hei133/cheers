import path from 'node:path';
import type { CommandContext } from '../types.js';
import type { SessionModelSelection } from '../../../session/model/contract.js';
import type { CatalogProvider } from '../../models/catalog.js';
import { catalogProvider } from '../../models/catalog.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { sameValue } from '../../../config/values.js';
import { connectionIdentity } from './identity.js';
import { configurationApplicationNotice, readFreshConfiguration } from '../configuration.js';
import { selectedModelMatches, selectionRequest } from './target.js';
import { providerCredentialBaseUrl } from '../../auth/account/target.js';

/** Publish a small session preference through the same active identity and CAS fences. */
export function publishModelPreference(context: CommandContext, update: (selection: SessionModelSelection, catalog: readonly CatalogProvider[], baseUrl?: string) => SessionModelSelection): string | undefined {
  if (!context.sessionId) return 'An active selected session model is required.';
  try {
    const baseline = readSessionModelEdit(context.sessionId);
    const selection = baseline.selection;
    const root = context.projectRoot ?? context.cwd;
    const publication = context.readConfiguration?.();
    const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(readFreshConfiguration(context), context.sessionId);
    const catalog = publication?.catalog ?? loadCatalog();
    if (!selection || !baseline.projectRoot || path.resolve(baseline.projectRoot) !== path.resolve(root)
      || !selectedModelMatches(config, selection) || context.admission?.()) {
      return 'Session, workspace or active model identity changed. Select the current connection and model again.';
    }
    const request = selectionRequest(context, config, selection);
    if (request.provider !== selection.provider || request.model !== selection.model
      || request.blocked || !request.credential) {
      return 'The selected model differs from the current request or its credential is unavailable. Reload before changing preferences.';
    }
    const baseUrl = providerCredentialBaseUrl(catalog, request);
    if (catalogProvider(catalog, selection.provider, baseUrl).ambiguous) return 'Model preference refused: multiple catalogue entries claim this endpoint.';
    const next = update(selection, catalog, baseUrl);
    writeSessionModel(context.sessionId, next, baseline, () => {
      const actual = projectSessionModel(readFreshConfiguration(context), context.sessionId);
      const currentCatalog = loadCatalog();
      return !context.admission?.() && actual.configValidation.valid && selectedModelMatches(actual, selection)
        && sameValue(selectionRequest(context, actual, selection), request)
        && sameValue(connectionIdentity(actual.providerConnections.find(item => item.id === selection.connectionId)), connectionIdentity(config.providerConnections?.find(item => item.id === selection.connectionId)))
        && providerCredentialBaseUrl(currentCatalog, request) === baseUrl
        && sameValue(catalogProvider(currentCatalog, selection.provider, baseUrl), catalogProvider(catalog, selection.provider, baseUrl))
        && sameValue(update(selection, currentCatalog, baseUrl), next);
    });
    if (!sameValue(readSessionModel(context.sessionId), next)) return 'Preference publication is unverified; inspect the session before retrying.';
    return configurationApplicationNotice(context);
  } catch (error) {
    return error instanceof PreferenceCapabilityError ? error.message : 'Preference write outcome is unverified; inspect the session before retrying.';
  }
}

export class PreferenceCapabilityError extends Error {}
