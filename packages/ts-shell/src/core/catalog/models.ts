import type { CatalogProvider } from '../models/catalog.js';
import { virtualModelMetadata } from '../models/virtual/capture.js';
import { catalogContributions } from './contributions.js';

/** Executable registrations stay outside the accepted physical configuration publication. */
export function sessionVirtualModels(root: string, sessionId: string) {
  return catalogContributions(root, sessionId).flatMap(entry => entry.virtualModels ?? []);
}

/** Present inert logical metadata alongside, without manufacturing physical auth or runtime entries. */
export function sessionModelCatalog(root: string, sessionId: string, physical: readonly CatalogProvider[]) {
  const virtual = sessionVirtualModels(root, sessionId);
  if (virtual.some(model => physical.some(provider => provider.id === model.provider && provider.models.some(value => value.id === model.id)))) {
    throw new Error('Virtual model registration collides with a physical model.');
  }
  return Object.freeze({ physical, virtual: Object.freeze(virtual.map(virtualModelMetadata)) });
}
