import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { SecurityInspection, SecurityInspectionSnapshot, SecurityInspector } from '../../../security/view/inspection.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { quoteCompletion } from '../completion.js';
import type { Picker } from '../overlay.js';

const help = 'Enter to draft diagnosis; Esc closes the view. Repair, apply and verify require explicit commands.';

/** Read-only retained security evidence; repair and approval remain commands. */
export function cleansePicker(inspector: SecurityInspector | undefined): Picker {
  let inspection: SecurityInspection = { state: 'unavailable' };
  let offered: SecurityInspectionSnapshot | undefined;
  let openedIdentity: string | undefined;
  const refresh = (next: SecurityInspection): readonly Option[] => {
    inspection = next;
    offered = next.state === 'ready' ? next.snapshot : undefined;
    if (!offered) return [];
    openedIdentity ??= JSON.stringify(offered.identity);
    return offered.items.map(item => ({
      id: item.identity,
      label: `${item.kind} ${neutraliseForDisplay(redactReportText(item.id, 40))}`,
      detail: item.summary,
      searchText: `${item.id} ${item.summary} ${item.detail.join(' ')}`,
      note: `${item.status}${item.owner === 'live' ? ' · live' : ''}${item.durability === 'unknown' ? ' · durability unknown' : ''}`,
    }));
  };
  return {
    title: 'Cleanse — retained diagnostics',
    form: 'panel',
    empty: 'No retained diagnostics to show.',
    loadError: 'Cleanse diagnostics could not be read. Reopen /cleanse to retry.',
    footer: help,
    status(visible, query) {
      if (inspection.state === 'unavailable') return 'Cleanse unavailable: retained diagnostic storage or owner could not be read. Reopen /cleanse to retry.';
      if (inspection.state === 'stale') return 'Session or workspace changed. Reopen /cleanse for the current binding.';
      return `${!offered?.items.length ? 'No retained security scans or remediation records.'
        : !visible.length && query?.trim() ? 'No retained diagnostics match this search.' : `${visible.length} retained records.`} ${help}`;
    },
    async load(signal) {
      signal?.throwIfAborted();
      return refresh(inspector?.read() ?? { state: 'unavailable' });
    },
    subscribe: publish => inspector?.subscribe(next => publish(refresh(next))) ?? (() => undefined),
    detail: id => offered?.items.find(item => item.identity === id)?.detail ?? [],
    async apply(ids) {
      if (ids.length !== 1 || !offered?.items.some(item => item.identity === ids[0])) return undefined;
      const current = inspector?.read();
      if (current?.state !== 'ready') return { note: 'Retained diagnostics are unavailable or the binding changed. Reopen /cleanse.' };
      if (openedIdentity !== JSON.stringify(current.snapshot.identity) || offered.version !== current.snapshot.version) {
        return { note: 'Retained evidence or its session or workspace changed. Reopen /cleanse before selecting it.' };
      }
      const item = current.snapshot.items.find(candidate => candidate.identity === ids[0]);
      if (!item || /[\x00-\x1f\x7f-\x9f]/.test(item.targetId)
        || neutraliseForDisplay(redactReportText(item.targetId, 256)) !== item.targetId) return undefined;
      return { draft: `/cleanse diagnose ${quoteCompletion(item.targetId, '"')}` };
    },
  };
}
