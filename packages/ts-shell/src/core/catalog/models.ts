import type { CatalogProvider } from '../models/catalog.js';
import { virtualModelMetadata } from '../models/virtual/capture.js';
import { catalogContributions } from './contributions.js';
import { VirtualModelRegistry } from '../models/virtualModels.js';
import { sessionProviders } from './providers.js';

/** Executable registrations stay outside the accepted physical configuration publication. */
export function sessionVirtualModels(root: string, sessionId: string) {
  return catalogContributions(root, sessionId).flatMap(entry => entry.virtualModels ?? []);
}

/** Present inert logical metadata alongside, without manufacturing physical auth or runtime entries. */
export function sessionModelCatalog(root: string, sessionId: string, physical: readonly CatalogProvider[]) {
  const virtual = sessionVirtualModels(root, sessionId);
  const extensions = sessionProviders(root, sessionId).filter(provider => !physical.some(existing => existing.id === provider.id));
  if (extensions.length) physical = Object.freeze([...physical, ...extensions]);
  if (virtual.some(model => physical.some(provider => provider.id === model.provider && provider.models.some(value => value.id === model.id)))) {
    throw new Error('Virtual model registration collides with a physical model.');
  }
  return Object.freeze({ physical, virtual: Object.freeze(virtual.map(virtualModelMetadata)) });
}

/** Keep executable lookups on the current contribution generation, without another registration owner. */
export function sessionVirtualRegistry(root: string, sessionId: string) {
  return new VirtualModelRegistry(() => sessionVirtualModels(root, sessionId));
}
