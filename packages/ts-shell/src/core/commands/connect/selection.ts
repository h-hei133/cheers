import { createHash } from 'node:crypto';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt } from '../../../config/runtimeConfig.js';
import { captureProfileIdentity } from '../../paths/profile/context.js';
import { availabilityLabel, availabilitySnapshot } from '../../models/availability.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { neutraliseForDisplay } from '../../text/safety.js';
import { redactReportText } from '../../security/redaction.js';
import { runConnectCommand } from '../connectCommandRuntime.js';
import type { CommandContext } from '../types.js';
import { normalizeConnections } from './preset.js';

const expired = 'Connection selection expired. Reopen /login or /logout.';
const safe = (text: string): string => neutraliseForDisplay(redactReportText(text, 512));

/** Keep credentials and the genuine persistence baseline inside the connection owner. */
export function captureConnectionSelection(context: CommandContext) {
  const baseline = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const identity = (revision = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).revision) => {
    const publication = context.readConfiguration?.();
    return createHash('sha256').update(JSON.stringify({
      path: getUserRuntimeConfigPath(), profile: captureProfileIdentity(),
      session: context.sessionId, root: context.projectRoot ?? context.cwd, cwd: context.cwd,
      revision,
      accepted: publication?.config ?? context.runtimeConfig, binding: publication?.binding, publication: publication?.revision,
    })).digest('hex');
  };
  const version = identity(baseline.revision);
  const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
  const stored = baseline.values.providerConnections ?? [];
  const counts = new Map<string, number>();
  for (const item of stored) counts.set(item.id.trim(), (counts.get(item.id.trim()) ?? 0) + 1);
  const projected = new Map(availabilitySnapshot({ config: baseline.values, catalog }).providers
    .flatMap(provider => provider.connections).map(connection => [JSON.stringify([connection.provider, connection.connectionId]), connection]));
  const targets = normalizeConnections(baseline.values);
  const connections = targets.map((connection, index) => ({
      key: `connection:${index}`, label: safe(connection.label ?? connection.provider),
      detail: safe([connection.id, connection.provider, connection.authType,
        projected.get(JSON.stringify([connection.provider, connection.id]))?.endpoint, connection.model].filter(Boolean).join(' · ')),
      status: availabilityLabel(projected.get(JSON.stringify([connection.provider, connection.id]))?.state ?? 'unknown'),
      disabled: counts.get(connection.id) !== 1
        || /[\x00-\x1f\x7f-\x9f]/.test(connection.id) || safe(connection.id) !== connection.id,
    }));
  const admission = (): string | undefined => {
    try { return context.admission?.() || version !== identity() ? expired : undefined; }
    catch { return expired; }
  };
  return {
    connections,
    admission,
    async logout(key: string): Promise<string> {
      const blocked = admission();
      if (blocked) return blocked;
      const index = connections.findIndex(item => item.key === key && !item.disabled);
      if (index < 0) return 'Connection was not offered for removal.';
      const result = await runConnectCommand(['logout', '--', targets[index]!.id], context, baseline);
      return neutraliseForDisplay(redactReportText(result.output, 4096, { preserveLines: true }));
    },
  };
}

export type ConnectionSelection = ReturnType<typeof captureConnectionSelection>;
