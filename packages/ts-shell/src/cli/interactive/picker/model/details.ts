import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { Picker, PickerOutcome } from '../../overlay.js';

export interface ModelDetailAction {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly run: (back: (notice?: string) => Picker, inspect: () => Picker,
    origin?: ModelDetailOrigin) => PickerOutcome | undefined;
}

export interface ModelDetailView {
  readonly label: string;
  readonly lines: readonly string[];
  readonly actions: readonly ModelDetailAction[];
  readonly available: boolean;
  readonly revision?: number;
  readonly admission?: () => string | undefined;
}

export interface ModelDetailRecord {
  readonly identity: string;
  readonly view: ModelDetailView;
}

export interface ModelDetailOrigin {
  readonly rows: readonly Option[];
  readonly crossCategory: boolean;
}

export interface ModelDetailSource {
  readonly label: string;
  read(): ModelDetailView;
  initialize?(): Promise<ModelDetailView>;
  refresh(): Promise<ModelDetailView>;
  admit(view: ModelDetailView): string | undefined;
  back(notice?: string): Picker;
  origin?(): ModelDetailOrigin;
  subscribe?(publish: (view: ModelDetailView) => void): () => void;
}

interface CatalogueDetailSourceOptions {
  readonly label: string;
  readonly identity: string;
  readonly revision?: () => number | undefined;
  readonly read: () => ModelDetailRecord | undefined;
  readonly reload: () => Promise<void>;
  readonly currentRows: () => ModelDetailOrigin;
  readonly back: (origin: ModelDetailOrigin, notice?: string) => Picker;
  readonly watch?: (load: () => Promise<ModelDetailView>, publish: (view: ModelDetailView) => void,
    observedRevision?: number, onFailure?: () => void) => () => void;
}

/** A detail view survives only while its parent catalogue still owns the same identity. */
export function catalogueDetailSource(options: CatalogueDetailSourceOptions): ModelDetailSource {
  let previous = options.currentRows();
  const read = (): ModelDetailView => {
    const current = options.read();
    return current?.identity === options.identity ? current.view
      : modelDetailUnavailable(options.label, options.revision?.());
  };
  const reload = async (): Promise<ModelDetailView> => {
    const origin = options.currentRows();
    await options.reload();
    previous = origin;
    return read();
  };
  return {
    label: options.label,
    read,
    async initialize() {
      const current = read();
      const revision = options.revision?.();
      if (current.revision === revision) return current;
      return reload();
    },
    async refresh() {
      const current = read();
      const revision = options.revision?.();
      if (current.available && current.revision !== undefined && revision !== undefined && current.revision === revision) {
        return current;
      }
      return reload();
    },
    admit(view) {
      const current = read();
      if (current !== view) return 'Model details changed. Review the refreshed model before continuing.';
      if (!current.available) return 'This model is no longer available in the accepted catalogue.';
      const revision = options.revision?.();
      if (current.revision !== undefined && revision !== undefined && current.revision !== revision) {
        return 'Model catalogue changed. Review the refreshed model before continuing.';
      }
      const refusal = current.admission?.();
      if (refusal) return refusal;
      const after = read();
      const afterRevision = options.revision?.();
      return after !== current || (current.revision !== undefined && afterRevision !== undefined && afterRevision !== current.revision)
        ? 'Model details changed. Review the refreshed model before continuing.' : undefined;
    },
    back: (notice?: string) => options.back(previous, notice),
    origin: () => previous,
    ...(options.watch ? {
      subscribe: (publish: (view: ModelDetailView) => void) => {
        let observedRevision = read().revision;
        return options.watch!(async () => {
          const view = await reload();
          observedRevision = view.revision;
          return view;
        }, publish, observedRevision,
        () => publish(modelDetailRefreshFailed(options.label, observedRevision)));
      },
    } : {}),
  };
}

export function modelDetailUnavailable(label: string, revision?: number): ModelDetailView {
  return {
    label, available: false, revision,
    lines: [`Model: ${label}`, 'Status: no longer available in the accepted catalogue.',
      'Return to models to choose a current target.'],
    actions: [],
  };
}

export function modelDetailRefreshFailed(label: string, revision?: number): ModelDetailView {
  return {
    label, available: false, revision,
    lines: [`Model: ${label}`, 'Status: model details could not be refreshed.',
      'Return to models and reopen the inspector to retry.'],
    actions: [],
  };
}

/** The inspector refreshes through its catalogue owner; it never writes model state. */
export function modelDetailsPicker(source: ModelDetailSource): Picker {
  let current = source.read(), offered = false, retired = false;
  const ownsAction = (stillOwned?: () => boolean): boolean => {
    if (!offered || retired) return false;
    if (stillOwned && !stillOwned()) { offered = false; retired = true; }
    return offered && !retired;
  };
  const options = (view: ModelDetailView): readonly Option[] => [
    { id: 'back', label: 'Back to models' },
    ...(view.available ? view.actions : []),
  ];
  return {
    title: source.label, form: 'panel', empty: '', filterable: false,
    acceptsOwnership: true,
    back: () => source.back(),
    previewEnd: () => { offered = false; retired = true; },
    detail: () => current.lines,
    footer: 'Enter reviews the next step · Esc returns',
    subscribe(publish) {
      if (!source.subscribe) return () => {};
      return source.subscribe(view => {
        if (retired) return;
        current = view;
        publish(options(view));
      });
    },
    async load() {
      if (retired) return [];
      current = source.initialize ? await source.initialize() : await source.refresh();
      if (retired) return [];
      offered = true;
      return options(current);
    },
    async apply(ids, stillOwned) {
      if (ids.length !== 1 || !ownsAction(stillOwned)) return undefined;
      const id = ids[0]!;
      if (id === 'back') {
        offered = false; retired = true;
        return { next: source.back() };
      }
      if (!current.actions.some(action => action.id === id)) return undefined;
      let refreshed: ModelDetailView;
      try { refreshed = await source.refresh(); }
      catch {
        if (!ownsAction(stillOwned)) return undefined;
        offered = false; retired = true;
        const note = 'Model catalogue could not be refreshed. Reopen the model picker.';
        return { note, next: source.back(note) };
      }
      if (!ownsAction(stillOwned)) return undefined;
      current = refreshed;
      const action = current.actions.find(candidate => candidate.id === id);
      if (!current.available || !action) {
        offered = false; retired = true;
        return { next: modelDetailsPicker(source) };
      }
      let refusal: string | undefined;
      try { refusal = source.admit(current); }
      catch {
        if (!ownsAction(stillOwned)) return undefined;
        offered = false; retired = true;
        const note = 'Model details could not be verified. Reopen the model picker.';
        return { note, next: source.back(note) };
      }
      if (!ownsAction(stillOwned)) return undefined;
      if (refusal) return { note: refusal };
      offered = false; retired = true;
      return action.run(source.back, () => modelDetailsPicker(source), source.origin?.());
    },
  };
}
