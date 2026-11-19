import type { DenyRule } from '../../core/shell/approval/deny.js';
import type { Skill } from '../../core/skills/skillLoader.js';
import type {
  ExtensionFactory,
  ExtensionHostBridge,
  LoadedInProcessExtension,
} from '../../extensions/runtime/inProcessLoader.js';
import type { ThemeConfig } from '../../presentation/themes/index.js';

export interface ResourceDiagnostic {
  readonly kind: 'warning' | 'error';
  readonly path?: string;
  readonly message: string;
}

export interface LoadedSdkExtension {
  readonly source: string;
  readonly extension: LoadedInProcessExtension;
}

export interface LoadExtensionsResult {
  readonly extensions: readonly LoadedSdkExtension[];
  readonly errors: readonly { readonly path: string; readonly error: string }[];
}

/** One complete resource generation, including values that clear previous resources. */
export interface ResourceSnapshot {
  readonly extensions: LoadExtensionsResult;
  readonly skills: { readonly skills: readonly Skill[]; readonly diagnostics: readonly ResourceDiagnostic[] };
  readonly themes: { readonly themes: readonly ThemeConfig[]; readonly diagnostics: readonly ResourceDiagnostic[] };
  readonly systemPrompt: string | undefined;
  readonly appendSystemPrompt: readonly string[];
  readonly skillPaths: readonly string[];
  readonly themePaths: readonly string[];
  readonly noSkills: boolean;
  readonly noContextFiles: boolean;
}

/** Loader-owned lifetime; kept separate from the caller-facing captured receipt. */
export interface ResourceGeneration {
  readonly controller: AbortController;
  readonly controlled: boolean;
  host: ExtensionHostBridge | undefined;
  state: 'loading' | 'active' | 'reload' | 'disposed' | 'superseded';
  snapshot?: ResourceSnapshot;
}

export interface ResourceReloadOptions {
  readonly signal?: AbortSignal;
  /** Synchronous source admission, rechecked by the loader before publication. */
  readonly admission?: () => void;
}

/** Authority over one consumed generation; intentional retirement permits one successor. */
export interface ResourceReloadLease {
  /** With no argument, also checks an intentionally retired reload reservation. */
  assertCurrent(expectedHost?: ExtensionHostBridge): void;
  retireForReload(expectedHost: ExtensionHostBridge): void;
  reload(options?: ResourceReloadOptions): Promise<ResourceReloadReceipt>;
}

export interface ResourceReloadReceipt {
  readonly snapshot: ResourceSnapshot;
  /** Bind the captured, fully loaded successor; returns its exact retirement. */
  bind(host: ExtensionHostBridge): () => void;
  /** Passing undefined explicitly checks that the successor is still unbound. */
  assertCurrent(expectedHost?: ExtensionHostBridge): void;
  retire(): void;
  captureReload(): ResourceReloadLease;
}

export interface ResourceLoader {
  reload(host?: ExtensionHostBridge): Promise<void>;
  setHost?(host: ExtensionHostBridge): void | (() => void);
  setDenyRules?(denyRules: () => readonly DenyRule[]): void;
  /** Retire only the loaded generation consumed by this session, preserving later reloads. */
  captureRetirement?(): () => void;
  /** Bind the exact resource snapshot captured before session initialization awaits. */
  captureBinding?(): (host: ExtensionHostBridge) => () => void;
  /** Optional guarded reload capability; legacy/custom loaders need not implement it. */
  captureReload?(): ResourceReloadLease;
  getExtensions(): LoadExtensionsResult;
  getSkills(): ResourceSnapshot['skills'];
  getThemes(): ResourceSnapshot['themes'];
  getSystemPrompt(): string | undefined;
  getAppendSystemPrompt(): readonly string[];
  getSkillPaths(): readonly string[];
  getThemePaths(): readonly string[];
  getNoSkills(): boolean;
  getNoContextFiles(): boolean;
}

export interface DefaultResourceLoaderOptions {
  readonly cwd?: string;
  readonly additionalExtensionPaths?: readonly string[];
  readonly additionalSkillPaths?: readonly string[];
  readonly additionalThemePaths?: readonly string[];
  readonly extensionFactories?: readonly ExtensionFactory[];
  readonly noExtensions?: boolean;
  readonly noSkills?: boolean;
  readonly noThemes?: boolean;
  readonly noContextFiles?: boolean;
  readonly systemPrompt?: string;
  readonly appendSystemPrompt?: readonly string[];
  readonly systemPromptOverride?: (base: string | undefined) => string | undefined;
  readonly appendSystemPromptOverride?: (base: readonly string[]) => readonly string[];
  readonly skillsOverride?: (base: ResourceSnapshot['skills']) => ResourceSnapshot['skills'];
  readonly extensionsOverride?: (base: LoadExtensionsResult) => LoadExtensionsResult;
  readonly denyRules?: () => readonly DenyRule[];
  readonly assertSourceAccess?: (absolutePath: string) => void;
  readonly host?: ExtensionHostBridge;
}
