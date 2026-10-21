export interface ExtensionAction {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly input?: 'release';
}
export interface ExtensionItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly status: string;
  readonly detail: readonly string[];
  readonly actions: readonly ExtensionAction[];
}
export interface ExtensionSnapshot {
  readonly version: string;
  readonly items: readonly ExtensionItem[];
  readonly notices: readonly string[];
  readonly install: ExtensionAction;
  readonly mutationBlocked: boolean;
}
export type ExtensionInspection = { readonly state: 'ready'; readonly snapshot: ExtensionSnapshot }
  | { readonly state: 'stale' | 'unavailable' };
export interface ExtensionSelection { readonly item?: string; readonly action: string; readonly input?: string }
export interface ExtensionPreparation {
  readonly title: string;
  readonly preview: readonly string[];
  /** Consumed once, including refusal, cancellation and unknown publication. */
  apply(): Promise<string>;
}
export interface ExtensionManager {
  read(): ExtensionInspection;
  subscribe(listener: (inspection: ExtensionInspection) => void): () => void;
  prepare(version: string, selection: ExtensionSelection): Promise<ExtensionPreparation>;
}
