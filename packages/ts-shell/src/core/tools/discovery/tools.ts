import type { ToolDefinition, ToolExecutionContext } from '../../../tools/types.js';
import { DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL, type ToolDiscovery } from './state.js';

type DiscoverTools = (names: readonly string[] | undefined, context: ToolExecutionContext) => Promise<boolean>;

/**
 * The two entry points that make a smaller initial tool set usable.
 *
 * Search returns identities and one-line summaries, not schemas: the point is to
 * choose without paying for every declaration. Load names the tools; their
 * schemas travel in the next request, and execution still goes through the
 * ordinary gate.
 */
export function discoveryTools(discovery: ToolDiscovery, discover?: DiscoverTools): readonly ToolDefinition[] {
  return [
    {
      name: DISCOVERY_SEARCH_TOOL,
      description: 'Search the tools this run may use using BM25 over names, descriptions, and parameter schemas. Pass load: true to activate matched tools in one step, or call tool_load separately.',
      argsSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 }, load: { type: 'boolean' } }, required: ['query'] },
      async execute(args, context) {
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = typeof args.limit === 'number' ? args.limit : undefined;
        const complete = query.trim() && discover ? await discover(undefined, context) : true;
        const matches = discovery.search(query, limit);
        const loadResult = args.load === true && matches.length > 0
          ? discovery.load(matches.map(match => match.name))
          : undefined;
        return { success: true, output: JSON.stringify({ query, matches,
          ...(loadResult ? { loaded: loadResult.loaded, rejected: loadResult.rejected } : {}),
          generation: discovery.generation, ...(complete ? {} : { mcpCatalog: 'incomplete' }),
          ...(matches.length === 0 ? { note: complete
            ? 'No visible tool matches. Try a broader name or a capability word from the tool description.'
            : 'MCP discovery is incomplete. Search again later or load a known tool by its exact name.' } : {}) }) };
      },
    },
    {
      name: DISCOVERY_LOAD_TOOL,
      description: 'Load named tools so their full schemas are available for the next request. Loading grants no permission; the ordinary gate still decides each call.',
      argsSchema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 32 } }, required: ['names'] },
      async execute(args, context) {
        const names = Array.isArray(args.names) ? args.names.filter((name): name is string => typeof name === 'string') : [];
        const complete = names.length && discover ? await discover(names, context) : true;
        const result = discovery.load(names);
        return { success: result.loaded.length > 0, output: JSON.stringify({ ...result, generation: discovery.generation, ...(complete ? {} : { mcpCatalog: 'incomplete' }),
          ...(result.loaded.length ? { note: 'Schemas are available on the next request; loading does not authorize a call.' } : {}) }) };
      },
    },
  ];
}
