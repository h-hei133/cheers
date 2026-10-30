import { freezeDeep } from '../core/values/freeze.js';
import type { RuntimeConfig, RuntimeConfigOverrides } from './runtimeConfig.js';
import { sameValue } from './values.js';
import { configRestartRequired, type ConfigReloadResult } from './application.js';
import { CONFIG_FIELDS } from './runtimeConfig.js';
import { displayOrigins } from './provenance/projection.js';
import { composeOrigin, origin } from './provenance/model.js';
import type { CatalogProvider } from '../core/models/catalog.js';
import type { ConfigInputs } from './inputs/model.js';

export type { ConfigReloadResult } from './application.js';

export interface ConfigBinding {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly trustRevision: string;
  readonly overrides: RuntimeConfigOverrides;
  readonly inputs?: ConfigInputs;
}

export interface ConfigPublication {
  readonly revision: number;
  readonly catalog: readonly CatalogProvider[];
  readonly catalogDiagnostics: readonly string[];
  readonly config: RuntimeConfig;
  readonly requested: RuntimeConfig;
  readonly binding: ConfigBinding;
  readonly admissionBlocked: boolean;
  readonly diagnostics: readonly string[];
}

class ConfigTicket {
  constructor(readonly owner: ConfigState, readonly generation: number, readonly binding: ConfigBinding) {}
}

/** Keep restart-only display values installed while publishing the live input preference. */
export function projectAccepted(installed: RuntimeConfig, candidate: RuntimeConfig): RuntimeConfig {
  const { composerShape } = candidate.tui ?? {};
  const tui = { ...installed.tui };
  if (composerShape === undefined) delete tui.composerShape;
  else tui.composerShape = composerShape;
  const installedOrigin = installed.configProvenance.tui ?? origin('default');
  const children = { ...installedOrigin.children };
  delete children.composerShape;
  if (composerShape !== undefined) children.composerShape = candidate.configProvenance.tui?.children?.composerShape ?? origin('default');
  const tuiOrigin = composeOrigin(installedOrigin, children);
  return { ...candidate, tui, tuiMode: installed.tuiMode,
    configProvenance: { ...candidate.configProvenance, tui: tuiOrigin, tuiMode: installed.configProvenance.tuiMode } };
}

/** One owner for accepted settings, candidate ordering and live security admission. */
export class ConfigState {
  private background = new AbortController();
  private substrateGeneration = 0;
  private generation = 0;
  private publication: ConfigPublication;

  constructor(config: RuntimeConfig, binding: ConfigBinding, catalog: readonly CatalogProvider[] = [], catalogDiagnostics: readonly string[] = []) {
    this.publication = freezeDeep({ revision: 0, config, requested: config, catalog: structuredClone(catalog), binding: structuredClone(binding),
      catalogDiagnostics: [...catalogDiagnostics],
      admissionBlocked: config.configValidation.securityBlocked || config.configValidation.constraintsBlocked === true, diagnostics: config.configDiagnostics });
  }

  get current(): ConfigPublication { return this.publication; }
  get substrateRevision(): number { return this.substrateGeneration; }
  get backgroundSignal(): AbortSignal { return this.background.signal; }

  /** Called only after the owning surface installs an explicit display change. */
  recordDisplay(applied: Pick<RuntimeConfig, 'tui' | 'tuiMode' | 'theme'>): void {
    this.retireBackground();
    this.generation++;
    const config = this.publication.config;
    this.publication = freezeDeep({ ...this.publication, revision: this.publication.revision + 1,
      config: { ...config, ...applied, configProvenance: displayOrigins(config, applied, config.configProvenance, CONFIG_FIELDS) } });
  }

  begin(binding: ConfigBinding): ConfigTicket {
    return Object.freeze(new ConfigTicket(this, ++this.generation, freezeDeep(structuredClone(binding))));
  }

  /** Every substrate transition invalidates tickets, including A -> B -> A. */
  transition(binding: ConfigBinding): void {
    this.retireBackground();
    this.generation++;
    this.substrateGeneration++;
    this.publication = freezeDeep({ ...this.publication, revision: this.publication.revision + 1, binding: structuredClone(binding),
      admissionBlocked: true, diagnostics: ['Configuration must be validated for the new session binding.'] });
  }

  publish(ticket: ConfigTicket, candidate: RuntimeConfig, actual: ConfigBinding, applyPrepared?: () => void,
    catalog: readonly CatalogProvider[] = this.publication.catalog, catalogDiagnostics: readonly string[] = this.publication.catalogDiagnostics): ConfigReloadResult {
    const before = this.publication.requested;
    if (!this.consume(ticket, actual)) {
      return this.result('superseded', before);
    }
    this.retireBackground();
    if (!candidate.configValidation.valid) {
      this.reject(candidate.configDiagnostics, candidate.configValidation.securityBlocked);
      return this.result('rejected', before);
    }
    try { applyPrepared?.(); }
    catch {
      // An unexpected commit exception may follow a resource side effect. Keep
      // accepted settings, but never claim those resources were restored.
      this.reject(['Configuration resource application outcome is unverified.'], true);
      return this.result('application-unverified', before);
    }
    const config = projectAccepted(this.publication.config, candidate);
    if (this.publication.config.configScopes?.revision !== config.configScopes?.revision) this.transition(actual);
    this.publication = freezeDeep({ revision: this.publication.revision + 1, config, requested: candidate, catalog: structuredClone(catalog),
      catalogDiagnostics: [...catalogDiagnostics],
      binding: structuredClone(actual), admissionBlocked: false, diagnostics: candidate.configDiagnostics });
    return this.result('applied', before);
  }

  rejectCandidate(ticket: ConfigTicket, actual: ConfigBinding, diagnostics: readonly string[], admissionBlocked = false): ConfigReloadResult {
    const before = this.publication.requested;
    if (!this.consume(ticket, actual)) return this.result('superseded', before);
    this.retireBackground();
    this.reject(diagnostics, admissionBlocked);
    return this.result('rejected', before);
  }

  private consume(ticket: ConfigTicket, actual: ConfigBinding): boolean {
    if (!(ticket instanceof ConfigTicket) || ticket.owner !== this || ticket.generation !== this.generation || !sameValue(ticket.binding, actual)) return false;
    this.generation++;
    return true;
  }

  private retireBackground(): void {
    this.background.abort();
    this.background = new AbortController();
  }

  private reject(diagnostics: readonly string[], block: boolean): void {
    this.publication = freezeDeep({ ...this.publication, revision: this.publication.revision + 1,
      admissionBlocked: this.publication.admissionBlocked || block, diagnostics: [...diagnostics] });
  }

  private result(status: ConfigReloadResult['status'], before: RuntimeConfig): ConfigReloadResult {
    return { status, before, after: this.publication.requested, revision: this.publication.revision,
      restartRequired: configRestartRequired(this.publication.config, this.publication.requested),
      admissionBlocked: this.publication.admissionBlocked, diagnostics: this.publication.diagnostics };
  }
}
