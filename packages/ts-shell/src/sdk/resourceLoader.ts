import path from 'node:path';
import type { DenyRule } from '../core/shell/approval/deny.js';
import type { ExtensionHostBridge } from '../extensions/runtime/inProcessLoader.js';
import { collectResources, emptyResourceSnapshot } from './resources/collection.js';
import type { DefaultResourceLoaderOptions, LoadExtensionsResult, ResourceLoader, ResourceReloadLease, ResourceSnapshot } from './resources/contract.js';
import { ResourceGenerations } from './resources/generation.js';

export type {
  DefaultResourceLoaderOptions,
  LoadedSdkExtension,
  LoadExtensionsResult,
  ResourceDiagnostic,
  ResourceLoader,
  ResourceReloadLease,
  ResourceReloadOptions,
  ResourceReloadReceipt,
  ResourceSnapshot,
} from './resources/contract.js';

/** Compose SDK discovery with generation-bound host and reload ownership. */
export class DefaultResourceLoader implements ResourceLoader {
  readonly cwd: string;
  private readonly resources: ResourceGenerations;
  private dynamicDenyRules: (() => readonly DenyRule[]) | undefined;

  constructor(private readonly options: DefaultResourceLoaderOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.dynamicDenyRules = options.denyRules;
    this.resources = new ResourceGenerations(options.host, emptyResourceSnapshot(options), generation =>
      collectResources(this.options, this.cwd, generation, () => this.dynamicDenyRules?.() ?? []));
  }

  setHost(host: ExtensionHostBridge): void | (() => void) {
    return this.resources.bind(host, () => this.captureRetirement());
  }

  setDenyRules(denyRules: () => readonly DenyRule[]): void { this.dynamicDenyRules = denyRules; }

  captureRetirement(): () => void { return this.resources.captureRetirement(); }

  captureBinding(): (host: ExtensionHostBridge) => () => void {
    return this.resources.captureBinding(host => this.setHost(host), () => this.captureRetirement());
  }

  captureReload(): ResourceReloadLease { return this.resources.captureReload(); }

  reload(host?: ExtensionHostBridge): Promise<void> { return this.resources.reload(host); }

  getExtensions(): LoadExtensionsResult { return this.resources.snapshot.extensions; }

  getSkills(): ResourceSnapshot['skills'] { return this.resources.snapshot.skills; }

  getThemes(): ResourceSnapshot['themes'] { return this.resources.snapshot.themes; }

  getSystemPrompt(): string | undefined { return this.resources.snapshot.systemPrompt; }

  getAppendSystemPrompt(): readonly string[] { return this.resources.snapshot.appendSystemPrompt; }

  getSkillPaths(): readonly string[] { return this.options.additionalSkillPaths ?? []; }

  getThemePaths(): readonly string[] { return this.options.additionalThemePaths ?? []; }

  getNoSkills(): boolean { return this.options.noSkills === true; }

  getNoContextFiles(): boolean { return this.options.noContextFiles === true; }
}
