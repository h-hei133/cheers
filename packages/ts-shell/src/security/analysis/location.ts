import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRecord } from '../../core/values/record.js';
import { exactFile, snapshotFile } from './source.js';
import type { ScanPlan } from './model.js';

export function reportPath(uri: unknown, plan: ScanPlan, base?: string): string {
  if (typeof uri !== 'string' || !uri || uri.length > 4096 || /[\0-\x1f\\?#]/.test(uri)) throw new Error('Security report location is malformed.');
  let resolved: string;
  try {
    if (/^file:/i.test(uri)) { const url = new URL(uri); if (url.hostname || url.search || url.hash) throw new Error('uri'); resolved = fileURLToPath(url); }
    else if (/^[A-Za-z][\w+.-]*:/.test(uri)) throw new Error('scheme');
    else { const decoded = decodeURIComponent(uri); if (/[\0-\x1f\\?#]/.test(decoded)) throw new Error('encoding'); resolved = path.resolve(base ?? plan.root, decoded); }
    resolved = exactFile(plan.root, resolved);
  } catch { throw new Error('Security report location is unsupported or outside the exact scope.'); }
  if (!plan.sources.some(source => source.path === resolved)) throw new Error('Security report location is outside the selected file scope.');
  return resolved;
}
export function locationOf(value: unknown, run: Record<string, unknown>, plan: ScanPlan) {
  if (!isRecord(value) || !isRecord(value.physicalLocation)) throw new Error('Security finding requires a physical location.');
  const physical = value.physicalLocation;
  if (!isRecord(physical.artifactLocation) || !isRecord(physical.region)) throw new Error('Security finding requires an explicit file and region.');
  const artifact = physical.artifactLocation; let base: string | undefined;
  if (artifact.uriBaseId !== undefined) {
    if (typeof artifact.uriBaseId !== 'string') throw new Error('Security URI base is malformed.');
    const bases = run.originalUriBaseIds;
    if (isRecord(bases) && Object.hasOwn(bases, artifact.uriBaseId)) {
      const entry = bases[artifact.uriBaseId];
      if (!isRecord(entry) || typeof entry.uri !== 'string' || entry.uriBaseId !== undefined) throw new Error('Security URI base is unsupported.');
      try { const url = new URL(entry.uri); if (url.protocol !== 'file:' || url.hostname || url.search || url.hash) throw new Error('base'); base = fileURLToPath(url); }
      catch { throw new Error('Security URI base is unsupported.'); }
      if (path.resolve(base) !== plan.root) throw new Error('Security URI base does not match the selected workspace.');
    } else if (artifact.uriBaseId !== '%SRCROOT%' || !(typeof artifact.uri === 'string' && path.isAbsolute(artifact.uri))) throw new Error('Security URI base is undeclared.');
  }
  const region = physical.region;
  for (const key of ['startLine', 'startColumn', 'endLine', 'endColumn']) if (region[key] !== undefined && (!Number.isSafeInteger(region[key]) || (region[key] as number) < 1)) throw new Error('Security finding region is malformed.');
  if (region.startLine === undefined || (region.endLine !== undefined && (region.endLine as number) < (region.startLine as number))) throw new Error('Security finding requires a valid source line.');
  const target = reportPath(artifact.uri, plan, base); const lines = snapshotFile(target, 512 * 1024).text.split('\n');
  if ((region.startLine as number) > lines.length || (region.endLine !== undefined && (region.endLine as number) > lines.length)) throw new Error('Security finding line is outside the actual source.');
  return { path: target, line: region.startLine as number,
    ...(region.startColumn !== undefined ? { column: region.startColumn as number } : {}), ...(region.endLine !== undefined ? { endLine: region.endLine as number } : {}) };
}
