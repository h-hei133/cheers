import { loadCatalogSnapshot } from '../../../../core/models/catalogStore.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import { sameValue } from '../../../../config/values.js';

/** Reopening reads through the accepted publication without adopting ordinary file edits. */
export function refreshModelCatalog(context: CommandContext): void {
  if (!context.readConfiguration || !context.refreshRuntimeConfig) return;
  if (context.signal?.aborted) throw new Error('Model inspection cancelled. Reopen the model picker.');
  const refusal = context.admission?.();
  if (refusal) throw new Error('Model selection expired. Reopen the model picker.');
  if (context.signal?.aborted) throw new Error('Model inspection cancelled. Reopen the model picker.');
  const matches = (): boolean => {
    const publication = context.readConfiguration!(), snapshot = loadCatalogSnapshot();
    return sameValue(publication.catalog, snapshot.providers) && sameValue(publication.catalogDiagnostics ?? [], snapshot.diagnostics);
  };
  if (matches()) return;
  const result = context.refreshRuntimeConfig('catalog');
  if (result.status !== 'applied') throw new Error('Model catalogue could not be applied. Reload a valid configuration before reopening the model picker.');
  if (context.signal?.aborted) throw new Error('Model inspection cancelled. Reopen the model picker.');
  if (!matches()) throw new Error('Model catalogue changed while loading. Reopen the model picker.');
}
