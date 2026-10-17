import type { ToolDefinition } from '../../../tools/types.js';
import { DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL, type ToolDiscovery } from './state.js';

/**
 * The two entry points that make a smaller initial tool set usable.
 *
 * Search returns identities and one-line summaries, not schemas: the point is to
 * choose without paying for every declaration. Load names the tools; their
 * schemas travel in the next request, and execution still goes through the
 * ordinary gate.
 */
export function discoveryTools(discovery: ToolDiscovery): readonly ToolDefinition[] {
  return [
    {
      name: DISCOVERY_SEARCH_TOOL,
      description: 'Search the tools this run may use. Returns stable names and one-line summaries; call tool_load to make matching tools available.',
      argsSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] },
      async execute(args) {
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = typeof args.limit === 'number' ? args.limit : undefined;
        const matches = discovery.search(query, limit);
        return { success: true, output: JSON.stringify({ query, matches, generation: discovery.generation,
          ...(matches.length === 0 ? { note: 'No visible tool matches. Try a broader name or a capability word from the tool description.' } : {}) }) };
      },
    },
    {
      name: DISCOVERY_LOAD_TOOL,
      description: 'Load named tools so their full schemas are available for the next request. Loading grants no permission; the ordinary gate still decides each call.',
      argsSchema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 32 } }, required: ['names'] },
      async execute(args) {
        const names = Array.isArray(args.names) ? args.names.filter((name): name is string => typeof name === 'string') : [];
        const result = discovery.load(names);
        return { success: result.loaded.length > 0, output: JSON.stringify({ ...result, generation: discovery.generation,
          ...(result.loaded.length ? { note: 'Schemas are available on the next request; loading does not authorize a call.' } : {}) }) };
      },
    },
  ];
}
