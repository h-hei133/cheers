import type { ExtensionSource, ExtensionState } from '../model.js';
import { canonical, digest } from '../registry/validation.js';
import { sourceIdentity } from '../registry/sources.js';
import type { ExtensionAction, ExtensionSnapshot } from './model.js';
import { installTarget, packageActions } from './actions.js';
import { safeText } from './text.js';

const NOTICE_LINES = 64;
const DETAIL_LINES = 32;
const PROJECTION_BYTES = 512 * 1024;

export function packageKey(name: string): string { return digest(name); }
export function projectExtensions(state: ExtensionState, sources: readonly ExtensionSource[] | undefined, root: string,
  workspaceIdentity: string, version: string, errors: readonly string[], outcomes: readonly string[], offline: boolean): ExtensionSnapshot {
  let omittedDetailLines = 0;
  let omittedActions = 0;
  const bases = state.packages.map(record => {
    const active = record.active; const activation = record.activation[root];
    const current = activation?.workspaceIdentity === workspaceIdentity;
    const status = activation && !current ? 'stale workspace activation' : current && activation.enabled ? 'enabled in this workspace' : 'disabled in this workspace';
    const id = packageKey(record.name), label = safeText(record.name), description = safeText(active.manifest.description ?? '');
    const targets = packageActions(record, root, workspaceIdentity).map(target => target.view);
    return { record, active, status, id, label, description, targets,
      bytes: textBytes(id, label, description, status) };
  });
  let projectedBytes = actionBytes(installTarget.view) + bases.reduce((sum, base) => sum + base.bytes, 0);
  const notices = boundedLines([
    'Installation, enablement and capability grants are separate. Execution requires Linux bubblewrap, current policy and ordinary approval.',
    ...(offline ? ['Offline: registry requests are unavailable.'] : []),
    ...(sources ? [] : ['Source registry unavailable; source trust is unknown.']),
    ...errors.map(safeText), ...outcomes.map(detail => safeText(`${detail}; durability unknown`)),
    ...state.imports.map(entry => safeText(`${entry.name}: unresolved legacy registration; grants no runtime authority.`)),
  ], NOTICE_LINES, Math.max(0, PROJECTION_BYTES - projectedBytes));
  const omittedNotices = notices.omitted;
  projectedBytes += notices.bytes;
  const actionPages = bases.map(base => {
    const actions = boundedActions(base.targets, Math.max(0, PROJECTION_BYTES - projectedBytes));
    projectedBytes += actions.bytes;
    omittedActions += actions.omitted;
    return actions.actions;
  });
  const items = bases.map((base, index) => {
    const detail = boundedLines([
      safeText(`${base.record.name}@${base.active.manifest.version}`), safeText(base.active.manifest.description ?? ''),
      safeText(`Source ${base.active.source}; trust ${trustOf(base.active, sources)}`), `SHA256 ${base.active.digest}`, `Trust fingerprint ${base.active.trustFingerprint}`,
      base.status, safeText(`Workspace permissions: ${base.active.manifest.permissions.workspace}; network: ${base.active.manifest.permissions.network}`),
      safeText(`Grants: ${currentGrants(base.record, root, workspaceIdentity)}`),
      ...base.record.history.map(entry => safeText(`Retained ${entry.manifest.version}; source ${entry.source}; SHA256 ${entry.digest}`)),
      ...base.active.manifest.commands.map(entry => safeText(`Command ${entry.name}: ${entry.description}`)),
      ...base.active.manifest.tools.map(entry => safeText(`Tool ${entry.name}: ${entry.description}`)),
    ], DETAIL_LINES, Math.max(0, PROJECTION_BYTES - projectedBytes));
    projectedBytes += detail.bytes;
    omittedDetailLines += detail.omitted;
    return { id: base.id, label: base.label, description: base.description, status: base.status,
      detail: detail.lines, actions: actionPages[index]! };
  });
  const partial = omittedDetailLines > 0 || omittedNotices > 0 || omittedActions > 0;
  return {
    version, mutationBlocked: outcomes.length > 0, install: installTarget.view,
    notices: notices.lines,
    items,
    partial,
    omitted: { notices: omittedNotices, detailLines: omittedDetailLines, actions: omittedActions },
  };
}

export function inspectionVersion(value: unknown): string { return digest(canonical(value)); }

function boundedLines(values: readonly string[], limit: number,
  byteLimit = PROJECTION_BYTES): { lines: string[]; bytes: number; omitted: number } {
  const lines: string[] = [];
  let bytes = 0;
  let shown = 0;
  for (const value of values) {
    const size = Buffer.byteLength(value, 'utf8');
    if (shown >= limit || bytes + size > byteLimit) break;
    lines.push(value);
    bytes += size;
    shown += 1;
  }
  if (shown < values.length) {
    const marker = '[additional detail omitted]';
    const markerBytes = Buffer.byteLength(marker, 'utf8');
    if (bytes + markerBytes <= byteLimit) {
      lines.push(marker);
      bytes += markerBytes;
    }
  }
  return { lines, bytes, omitted: values.length - shown };
}

function boundedActions(actions: readonly ExtensionAction[], byteLimit: number):
{ actions: ExtensionAction[]; bytes: number; omitted: number } {
  const shown: ExtensionAction[] = [];
  let bytes = 0;
  let omitted = 0;
  for (const action of actions) {
    const size = actionBytes(action);
    if (bytes + size > byteLimit) { omitted += 1; continue; }
    shown.push(action);
    bytes += size;
  }
  return { actions: shown, bytes, omitted };
}

function actionBytes(action: ExtensionAction): number {
  return textBytes(action.id, action.label, action.detail, action.input ?? '');
}

function textBytes(...values: readonly string[]): number {
  return values.reduce((sum, value) => sum + Buffer.byteLength(value, 'utf8'), 0);
}

function trustOf(active: ExtensionState['packages'][number]['active'], sources: readonly ExtensionSource[] | undefined): string {
  const source = sources?.find(entry => entry.name === active.source);
  return !sources ? 'unknown' : !source ? 'missing' : !source.trust ? 'untrusted'
    : sourceIdentity(source) === active.sourceIdentity && source.trust.fingerprint === active.trustFingerprint ? 'current' : 'changed';
}

function currentGrants(record: ExtensionState['packages'][number], root: string, workspaceIdentity: string): string {
  const activation = record.activation[root];
  return activation?.workspaceIdentity === workspaceIdentity ? activation.grants.join(', ') || 'none' : 'none current';
}
