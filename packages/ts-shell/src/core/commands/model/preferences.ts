import path from 'node:path';
import type { CommandContext } from '../types.js';
import type { SessionModelSelection } from '../../../session/model/contract.js';
import type { CatalogProvider } from '../../models/catalog.js';
import { catalogModel } from '../../models/catalog.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { sameValue } from '../../../config/values.js';
import { connectionIdentity } from './identity.js';
import { configurationApplicationNotice, readFreshConfiguration } from '../configuration.js';

/** Publish a small session preference through the same active identity and CAS fences. */
export function publishModelPreference(context: CommandContext, update: (selection: SessionModelSelection, catalog: readonly CatalogProvider[]) => SessionModelSelection): string | undefined {
  if (!context.sessionId) return 'An active selected session model is required.';
  try {
    const baseline = readSessionModelEdit(context.sessionId);
    const selection = baseline.selection;
    const root = context.projectRoot ?? context.cwd;
    const publication = context.readConfiguration?.();
    const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(readFreshConfiguration(context), context.sessionId);
    const catalog = publication?.catalog ?? loadCatalog();
    if (!selection || !baseline.projectRoot || path.resolve(baseline.projectRoot) !== path.resolve(root)
      || config.activeProviderConnectionId !== selection.connectionId
      || config.providerConnections?.find(item => item.id === selection.connectionId)?.provider !== selection.provider || context.admission?.()) {
      return 'Session, workspace or active model identity changed. Select the current connection and model again.';
    }
    const next = update(selection, catalog);
    writeSessionModel(context.sessionId, next, baseline, () => {
      const actual = readFreshConfiguration(context);
      const currentCatalog = loadCatalog();
      return !context.admission?.() && actual.configValidation.valid && actual.activeProviderConnectionId === selection.connectionId
        && sameValue(connectionIdentity(actual.providerConnections.find(item => item.id === selection.connectionId)), connectionIdentity(config.providerConnections?.find(item => item.id === selection.connectionId)))
        && sameValue(catalogModel(currentCatalog, selection.provider, selection.model), catalogModel(catalog, selection.provider, selection.model))
        && sameValue(update(selection, currentCatalog), next);
    });
    if (!sameValue(readSessionModel(context.sessionId), next)) return 'Preference publication is unverified; inspect the session before retrying.';
    return configurationApplicationNotice(context);
  } catch (error) {
    return error instanceof PreferenceCapabilityError ? error.message : 'Preference write outcome is unverified; inspect the session before retrying.';
  }
}

export class PreferenceCapabilityError extends Error {}
