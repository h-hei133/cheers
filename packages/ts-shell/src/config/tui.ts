import type { ConfigSource } from './fields.js';
import { type ConfigOrigin, origin, replaceOrigin, sourcesOf } from './provenance/model.js';
import { contributeFiles } from './provenance/files.js';

interface TuiSource { readonly values: Record<string, unknown>; readonly trace: ConfigOrigin }
export type TuiLayers = Partial<Record<ConfigSource, TuiSource>>;

/** Keep each source's leaves so clearing a project preference reveals the latest user input. */
export function mergeTui(layers: TuiLayers, value: Record<string, unknown>, next: ConfigOrigin, source: ConfigSource,
  previous?: ConfigOrigin): { values: Record<string, unknown>; trace: ConfigOrigin } {
  const prior = layers[source];
  const children = { ...prior?.trace.children };
  for (const [key, node] of Object.entries(next.children ?? {})) children[key] = replaceOrigin(children[key], node);
  layers[source] = { values: { ...prior?.values, ...value }, trace: { ...next, children } };
  const project = layers.project; const user = layers.user;
  const keys = new Set([...Object.keys(project?.values ?? {}), ...Object.keys(user?.values ?? {}), ...Object.keys(previous?.children ?? {})]);
  const values: Record<string, unknown> = {}; const traces: Record<string, ConfigOrigin> = {};
  for (const key of keys) {
    const p = project?.values[key]; const u = user?.values[key];
    const projectWins = p !== undefined && !(key === 'statusItems' && Array.isArray(p) && p.length === 0 && u !== undefined);
    const chosen = projectWins ? project : user;
    if (chosen && Object.hasOwn(chosen.values, key)) {
      values[key] = chosen.values[key];
      traces[key] = replaceOrigin((projectWins ? user : project)?.trace.children?.[key], chosen.trace.children?.[key] ?? origin('default'));
    } else if (previous?.children?.[key]) traces[key] = previous.children[key];
    const rejected = previous?.children?.[key];
    if (rejected?.rejected.length && traces[key]) traces[key] = { ...traces[key], rejected: rejected.rejected,
      ...(rejected.rejectedFiles ? { rejectedFiles: rejected.rejectedFiles } : {}) };
  }
  const nodes = Object.values(traces);
  return { values, trace: { ...origin('default'), sources: nodes.length ? sourcesOf(nodes) : sourcesOf([previous ?? origin('default'), next]),
    shadowed: [...new Set([...(previous?.shadowed ?? []), ...next.shadowed])], rejected: previous?.rejected ?? [],
    children: traces, ...contributeFiles(...nodes) } };
}
