import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { SecurityInspection, SecurityInspectionSnapshot, SecurityInspector } from '../../../security/view/inspection.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { quoteCompletion } from '../completion.js';
import type { Picker } from '../overlay.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { captureCleanseSource } from './cleanse/source.js';
import { pickerSelection } from './selection/state.js';
import type { SessionSelectionContext } from '../../../session/navigation/selection.js';

const help = 'Enter to draft diagnosis; Esc closes the view. Repair, apply and verify require explicit commands.';
const unavailable = 'Retained diagnostics are unavailable or the opening owner changed. Reopen /cleanse.';

/** Read-only retained security evidence; repair and approval remain commands. */
export function cleansePicker(inspector: SecurityInspector | undefined, context?: Pick<CommandContext, 'cwd' | 'projectRoot' | 'sessionId' | 'admission' | 'signal'>,
  current?: () => SessionSelectionContext): Picker {
  const selection = pickerSelection(context, current, 'Retained diagnostics owner changed. Reopen /cleanse.');
  current = undefined;
  let source = inspector;
  inspector = undefined;
  context = undefined;
  let closed = false;
  let accepting = false;
  let browserSignal: AbortSignal | undefined;
  let generation = 0;
  let unsubscribe: (() => void) | undefined;
  let inspection: SecurityInspection = { state: 'unavailable' };
  let offered: SecurityInspectionSnapshot | undefined;
  let openedIdentity: string | undefined;
  const invalidate = (): void => { offered = undefined; inspection = { state: 'unavailable' }; };
  const release = (accepted = false): void => {
    closed = true;
    generation++;
    invalidate();
    openedIdentity = undefined;
    browserSignal = undefined;
    source = undefined;
    const stop = unsubscribe;
    unsubscribe = undefined;
    try { stop?.(); }
    catch { /* The closed view must release its own references even if the source cannot stop. */ }
    finally { if (!accepted) selection.release(); }
  };
  const check = (browsing = true): void => {
    if (closed) throw new Error('Cleanse picker is closed.');
    if (browsing) browserSignal?.throwIfAborted();
    try { selection.check(); }
    catch (error) { if (closed) throw new Error('Cleanse picker is closed.'); throw error; }
    if (closed) throw new Error('Cleanse picker is closed.');
    if (browsing) browserSignal?.throwIfAborted();
  };
  const acquire = async (signal?: AbortSignal): Promise<SecurityInspection> => {
    check();
    const next = source?.readAsync ? await source.readAsync(signal) : source?.read();
    signal?.throwIfAborted();
    check();
    return next ?? { state: 'unavailable' };
  };
  const refresh = (next: SecurityInspection): readonly Option[] => {
    check();
    const snapshot = next.state === 'ready' ? captureCleanseSource(next.snapshot, check) : undefined;
    if (snapshot && (selection.sessionId && selection.sessionId !== snapshot.identity.sessionId
      || selection.root && selection.root !== snapshot.identity.workspaceRoot)) throw new Error('Retained diagnostics owner changed. Reopen /cleanse.');
    if (snapshot && openedIdentity && openedIdentity !== JSON.stringify(snapshot.identity)) throw new Error('Retained diagnostics owner changed. Reopen /cleanse.');
    const rows = snapshot?.items.map(item => ({
      id: item.identity,
      label: `${item.kind} ${neutraliseForDisplay(redactReportText(item.id, 40))}`,
      detail: item.summary,
      searchText: `${item.id} ${item.summary} ${item.detail.join(' ')}`,
      note: `${item.status}${item.owner === 'live' ? ' · live' : ''}${item.durability === 'unknown' ? ' · durability unknown' : ''}`,
    })) ?? [];
    check();
    inspection = snapshot ? { state: 'ready', snapshot } : next;
    offered = snapshot;
    if (snapshot) openedIdentity ??= JSON.stringify(snapshot.identity);
    return rows;
  };
  return {
    isCurrent: selection.isCurrent,
    title: 'Cleanse — retained diagnostics',
    form: 'panel',
    empty: 'No retained diagnostics to show.',
    loadError: 'Cleanse diagnostics could not be read. Reopen /cleanse to retry.',
    footer: help,
    status(visible, query) {
      try { check(); } catch { invalidate(); }
      if (inspection.state === 'unavailable') return 'Cleanse unavailable: retained diagnostic storage or owner could not be read. Reopen /cleanse to retry.';
      if (inspection.state === 'stale') return 'Session or workspace changed. Reopen /cleanse for the current binding.';
      return `${!offered?.items.length ? 'No retained security scans or remediation records.'
        : !visible.length && query?.trim() ? 'No retained diagnostics match this search.' : `${visible.length} retained records.`} ${help}`;
    },
    async load(signal) {
      const epoch = ++generation;
      unsubscribe?.();
      invalidate();
      browserSignal = signal;
      try {
        const next = await acquire(signal);
        if (epoch !== generation) throw new Error('Cleanse load was replaced.');
        const rows = refresh(next);
        signal?.throwIfAborted();
        return rows;
      } catch (error) { if (epoch === generation) invalidate(); throw error; }
    },
    subscribe: publish => {
      try { check(); } catch { invalidate(); return () => undefined; }
      unsubscribe?.();
      let released = false;
      let originalStop: (() => void) | undefined;
      const stop = (): void => {
        if (released) return;
        released = true;
        const dispose = originalStop;
        originalStop = undefined;
        if (unsubscribe === stop) unsubscribe = undefined;
        dispose?.();
      };
      unsubscribe = stop;
      try {
        check();
        const acquired = source?.subscribe(next => {
          if (closed || released) return;
          try {
            const rows = refresh(next);
            if (!closed && !released) publish(rows);
          } catch {
            invalidate();
            if (!closed && !released && !browserSignal?.aborted) publish([]);
          }
        }, browserSignal) ?? (() => undefined);
        if (released) acquired();
        else originalStop = acquired;
        check();
      } catch { invalidate(); stop(); }
      return stop;
    },
    detail: id => {
      try {
        check();
        const detail = offered?.items.find(item => item.identity === id)?.detail ?? [];
        check();
        return detail;
      } catch { invalidate(); return []; }
    },
    async apply(ids) {
      if (closed || ids.length !== 1) return undefined;
      const selected = offered, identity = openedIdentity;
      const selectedItem = selected?.items.find(item => item.identity === ids[0]);
      if (!selectedItem) return undefined;
      try { check(!accepting); }
      catch { release(); return { note: unavailable }; }
      const acceptedSource = source;
      release(true);
      try {
        selection.check();
        const current = acceptedSource?.readAsync ? await acceptedSource.readAsync() : acceptedSource?.read();
        selection.check();
        if (current?.state !== 'ready') return { note: 'Retained diagnostics are unavailable or the binding changed. Reopen /cleanse.' };
        const fresh = captureCleanseSource(current.snapshot, selection.check);
        const item = fresh.items.find(candidate => candidate.identity === selectedItem.identity);
        if (identity !== JSON.stringify(fresh.identity) || selected?.version !== fresh.version || item?.targetId !== selectedItem.targetId) {
          return { note: 'Retained evidence or its session or workspace changed. Reopen /cleanse before selecting it.' };
        }
        if (!item || /[\x00-\x1f\x7f-\x9f]/.test(item.targetId)
          || neutraliseForDisplay(redactReportText(item.targetId, 256)) !== item.targetId) return undefined;
        const draft = `/cleanse diagnose ${quoteCompletion(item.targetId, '"')}`;
        selection.check();
        return { draft };
      } catch { return { note: unavailable }; }
      finally { selection.release(true); }
    },
    previewAccept: () => {
      try { check(); accepting = true; }
      catch { release(); }
    },
    previewEnd: () => release(),
  };
}
