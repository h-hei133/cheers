import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { ExtensionAction, ExtensionInspection, ExtensionItem, ExtensionManager, ExtensionPreparation, ExtensionSnapshot } from '../../../extensions/view/model.js';
import { parseSpec } from '../../../extensions/lifecycle/install.js';
import type { Picker, PickerOutcome } from '../overlay.js';

const stale = 'Extension state, source trust or binding changed. Reopen /plugin.';
const failure = 'Extension operation could not be confirmed. Inspect /plugin list before retrying.';

/** Installed state comes only from the bound extension service, never the legacy registry. */
export function pluginPicker(manager: ExtensionManager | undefined): Picker {
  let inspection: ExtensionInspection = { state: 'unavailable' };
  let offered: ExtensionSnapshot | undefined;
  const refresh = (next: ExtensionInspection): readonly Option[] => {
    inspection = next; offered = next.state === 'ready' ? next.snapshot : undefined;
    if (!offered) return [];
    return [{ id: offered.install.id, label: 'Install an exact release', detail: offered.install.detail, disabled: offered.mutationBlocked },
      ...offered.items.map(item => ({ id: item.id, label: item.label, detail: item.description, note: item.status,
        searchText: [...item.detail, item.description].join(' ') }))];
  };
  return {
    title: 'Extensions — installed packages', form: 'panel', empty: 'No matching extensions.',
    loadError: 'Extension state unavailable. Reopen /plugin to retry.',
    footer: 'Enter to inspect one package or review installation · Esc closes without changes',
    isCurrent: () => manager?.read().state !== 'stale',
    status(visible, query) {
      if (inspection.state === 'stale') return stale;
      if (inspection.state === 'unavailable') return 'Extensions unavailable: a bound runtime and readable installation state are required.';
      return [...(!visible.length && query?.trim() ? ['No extensions match this search.'] : []),
        ...(!offered?.items.length ? ['No extensions installed.'] : []), ...offered?.notices ?? [],
        ...(offered ? [projectionStatus(offered)].filter((value): value is string => value !== undefined) : [])].join(' ');
    },
    async load(signal) { signal?.throwIfAborted(); return refresh(manager?.read() ?? { state: 'unavailable' }); },
    subscribe: publish => manager?.subscribe(next => publish(refresh(next))) ?? (() => undefined),
    detail: id => offered?.items.find(item => item.id === id)?.detail ?? offered?.notices ?? [],
    previewEnd: () => { offered = undefined; },
    async apply(ids) {
      if (!manager || !offered || ids.length !== 1) return undefined;
      const snapshot = offered; offered = undefined;
      const current = manager.read();
      if (current.state !== 'ready' || current.snapshot.version !== snapshot.version) return { note: stale };
      if (ids[0] === snapshot.install.id && !snapshot.mutationBlocked) return { next: releaseInput(manager, snapshot, snapshot.install) };
      const item = snapshot.items.find(item => item.id === ids[0]);
      return item ? { next: packagePicker(manager, snapshot, item) } : undefined;
    },
  };
}

function packagePicker(manager: ExtensionManager, snapshot: ExtensionSnapshot, item: ExtensionItem): Picker {
  let offered = false;
  return {
    title: `Extension — ${item.label}`, form: 'panel', empty: 'No extension actions.', exclusive: true,
    footer: 'Choose one action. Every change needs confirmation and ordinary approval.',
    status: () => [snapshot.mutationBlocked ? 'Publication durability unknown. Inspect retained state before another mutation.' : undefined,
      projectionStatus(snapshot)].filter((value): value is string => value !== undefined).join(' ') || undefined,
    isCurrent: () => manager.read().state !== 'stale',
    async load() {
      offered = true;
      const omittedActions = snapshot.omitted?.actions ?? 0;
      return [...item.actions.map(action => ({ ...action, disabled: snapshot.mutationBlocked })),
        ...(omittedActions > 0 ? [{
          id: 'omitted-actions',
          label: `${omittedActions} extension actions omitted from this bounded view`,
          detail: 'Reduce package detail or installed packages, then reopen /plugin.',
          disabled: true,
        }] : [])];
    },
    detail: id => [...item.detail, id === 'omitted-actions'
      ? `${snapshot.omitted?.actions ?? 0} actions were omitted by the projection budget.`
      : item.actions.find(action => action.id === id)?.detail ?? ''],
    previewEnd: () => { offered = false; },
    async apply(ids) {
      if (!offered || snapshot.mutationBlocked || ids.length !== 1) return undefined;
      const action = item.actions.find(action => action.id === ids[0]);
      if (!action) return undefined;
      offered = false;
      return action.input ? { next: releaseInput(manager, snapshot, action, item) } : prepareChoice(manager, snapshot, action, item);
    },
  };
}

function projectionStatus(snapshot: ExtensionSnapshot): string | undefined {
  const notices = snapshot.omitted?.notices ?? 0;
  const detailLines = snapshot.omitted?.detailLines ?? 0;
  const actions = snapshot.omitted?.actions ?? 0;
  const parts = [
    ...(notices > 0 ? [`${notices} notices`] : []),
    ...(detailLines > 0 ? [`${detailLines} detail lines`] : []),
    ...(actions > 0 ? [`${actions} actions`] : []),
  ];
  return parts.length > 0 ? `Extension view is partial; ${parts.join(', ')} omitted by the display budget.` : undefined;
}

function releaseInput(manager: ExtensionManager, snapshot: ExtensionSnapshot, action: ExtensionAction, item?: ExtensionItem): Picker {
  let used = false;
  const validate = (text: string) => {
    try { if (text.length > 256) throw new Error(); parseSpec(text); return undefined; }
    catch { return 'Use source:name@exact-version, for example source:package@1.0.0.'; }
  };
  return {
    title: item ? `Update ${item.label}` : 'Install extension', form: 'panel', empty: '', exclusive: true,
    isCurrent: () => manager.read().state !== 'stale',
    async load() { return []; }, apply: async () => undefined,
    previewEnd: () => { used = true; },
    input: { initial: '', label: 'Exact signed release (source:name@version)', validate,
      apply: async text => {
        if (used || validate(text)) return undefined;
        used = true;
        return prepareChoice(manager, snapshot, action, item, text);
      } },
  };
}

async function prepareChoice(manager: ExtensionManager, snapshot: ExtensionSnapshot, action: ExtensionAction, item?: ExtensionItem, input?: string): Promise<PickerOutcome> {
  try {
    const preparation = await manager.prepare(snapshot.version, { action: action.id, ...(item ? { item: item.id } : {}), ...(input !== undefined ? { input } : {}) });
    return { next: confirmation(manager, preparation) };
  } catch { return { note: failure }; }
}

function confirmation(manager: ExtensionManager, preparation: ExtensionPreparation): Picker {
  let offered = false, used = false;
  return {
    title: `Confirm ${preparation.title}`, form: 'panel', empty: '', filterable: false,
    exclusive: true, initialSelection: 'cancel',
    footer: 'Continue requests ordinary approval for this exact operation. Cancel changes nothing.',
    async load() { offered = true; return [{ id: 'cancel', label: 'Cancel' }, { id: 'continue', label: 'Continue to approval' }]; },
    detail: () => preparation.preview,
    previewEnd: () => { used = true; },
    async apply(ids) {
      if (!offered || used || ids.length !== 1 || !['cancel', 'continue'].includes(ids[0]!)) return undefined;
      used = true;
      if (ids[0] === 'cancel') return undefined;
      // Ordinary approval replaces the overlay. Its settled result still belongs
      // in this binding's transcript, even though the view revision has changed.
      try {
        const note = await preparation.apply();
        return manager.read().state === 'stale' ? undefined : { note };
      } catch { return manager.read().state === 'stale' ? undefined : { note: failure }; }
    },
  };
}
