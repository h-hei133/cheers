import { freezeDeep } from '../core/values/freeze.js';
import type { RuntimeConfig, RuntimeConfigOverrides } from './runtimeConfig.js';
import { sameValue } from './values.js';
import { configRestartRequired } from './application.js';

export interface ConfigBinding {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly trustRevision: string;
  readonly overrides: RuntimeConfigOverrides;
}

export interface ConfigPublication {
  readonly revision: number;
  readonly config: RuntimeConfig;
  readonly requested: RuntimeConfig;
  readonly binding: ConfigBinding;
  readonly admissionBlocked: boolean;
  readonly diagnostics: readonly string[];
}

class ConfigTicket {
  constructor(readonly owner: ConfigState, readonly generation: number, readonly binding: ConfigBinding) {}
}

export interface ConfigReloadResult {
  readonly restartRequired: readonly string[];
  readonly status: 'applied' | 'rejected' | 'superseded' | 'application-unverified';
  readonly before: RuntimeConfig;
  readonly after: RuntimeConfig;
  readonly revision: number;
  readonly admissionBlocked: boolean;
  readonly diagnostics: readonly string[];
}

/** One owner for accepted settings, candidate ordering and live security admission. */
export class ConfigState {
  private background = new AbortController();
  private substrateGeneration = 0;
  private generation = 0;
  private publication: ConfigPublication;

  constructor(config: RuntimeConfig, binding: ConfigBinding) {
    this.publication = freezeDeep({ revision: 0, config, requested: config, binding: structuredClone(binding),
      admissionBlocked: config.configValidation.securityBlocked, diagnostics: config.configDiagnostics });
  }

  get current(): ConfigPublication { return this.publication; }
  get substrateRevision(): number { return this.substrateGeneration; }
  get backgroundSignal(): AbortSignal { return this.background.signal; }

  /** Called only after the owning surface installs an explicit display change. */
  recordDisplay(applied: Pick<RuntimeConfig, 'tui' | 'tuiMode' | 'theme'>): void {
    this.retireBackground();
    this.generation++;
    this.publication = freezeDeep({ ...this.publication, revision: this.publication.revision + 1, config: { ...this.publication.config, ...applied } });
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

  publish(ticket: ConfigTicket, candidate: RuntimeConfig, actual: ConfigBinding, applyPrepared?: () => void): ConfigReloadResult {
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
    const config = { ...candidate, tui: this.publication.config.tui, tuiMode: this.publication.config.tuiMode };
    this.publication = freezeDeep({ revision: this.publication.revision + 1, config, requested: candidate,
      binding: structuredClone(actual), admissionBlocked: false, diagnostics: candidate.configDiagnostics });
    return this.result('applied', before);
  }

  rejectCandidate(ticket: ConfigTicket, actual: ConfigBinding, diagnostics: readonly string[]): ConfigReloadResult {
    const before = this.publication.requested;
    if (!this.consume(ticket, actual)) return this.result('superseded', before);
    this.retireBackground();
    this.reject(diagnostics, false);
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
