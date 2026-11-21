import type {RuntimeConfigOverrides} from '../../config/runtimeConfig.js';
import {configurationAdmission} from '../../core/shell/configuration.js';
import type {ShellRuntimeContext} from '../../core/shell/runtimeContext.js';
import type {ShellSessionRuntime} from '../../core/shell/sessionRuntime.js';
import {captureExtensionRuntimeFor} from '../../cli/runtime/extensions.js';
import {closeExtensionHost, extensionHostFor} from '../../cli/runtime/extensions/host.js';
import {createExtensionReload, type ExtensionReloadResult} from '../../cli/runtime/extensions/reload.js';
import type {ResourceDiagnostic, ResourceLoader, ResourceReloadLease, ResourceReloadReceipt} from '../resourceLoader.js';
import type {SessionUi} from '../ui.js';
import type {SdkToolPolicy} from './policy.js';
import {registerSdkExtensions} from './catalog.js';
import {applySdkResources} from './projection.js';
import {captureSessionTransition} from '../../session/store/transition.js';
import {createSessionStoreLayout, locateExistingSessionLayout} from '../../session/store/sessionFileLayout.js';
import {readSessionMetadataRecord} from '../../session/store/sessionStore.js';
import {SessionStoreAccess} from '../../session/store/sessionStoreAccess.js';
import {sameValue} from '../../config/values.js';
import {captureDiagnostics, resourceReport} from './snapshot.js';

export type AgentSessionReloadResult = ExtensionReloadResult<ResourceDiagnostic>;

interface ResourceOwnerInput {
  readonly context: ShellRuntimeContext;
  readonly runtime: ShellSessionRuntime;
  readonly loader: ResourceLoader;
  readonly cleanups: Array<() => void>;
  readonly retirement?: () => void;
  readonly lease?: ResourceReloadLease;
  readonly ui: SessionUi;
  readonly policy: SdkToolPolicy;
  readonly callerOverrides: RuntimeConfigOverrides;
  readonly contextBudget: {readonly value?: number; readonly override?: number; disabled: boolean};
}

/** Retain SDK resource ownership while reusing the runtime's guarded reload sequence. */
export class SessionResources {
  private closed = false;
  private active = false;
  private lease?: ResourceReloadLease;
  private retirement?: () => void;
  private cleanups: Array<() => void>;
  private readonly reloadOperation: (signal?: AbortSignal) => Promise<AgentSessionReloadResult>;
  private pending?: Promise<AgentSessionReloadResult>;

  constructor(private readonly input: ResourceOwnerInput) {
    this.lease = input.lease;
    this.retirement = input.retirement;
    this.cleanups = input.cleanups;
    this.reloadOperation = createExtensionReload(input.context, input.runtime, () => this.captureReload());
  }

  reload(signal?: AbortSignal): Promise<AgentSessionReloadResult> {
    if (this.pending) return this.pending;
    if (this.closed) return Promise.resolve({status:'refused', reason:'Agent session is disposed.'});
    const pending = this.reloadOperation(signal);
    this.pending = pending.then(result => {
      if (result.status === 'unknown') this.input.ui.abandonReload();
      return result;
    }).finally(() => {this.active = false; this.pending = undefined;});
    return this.pending;
  }

  close(): Promise<unknown> | undefined {
    this.closed = true;
    if (this.active) this.input.runtime.commands.current?.controller.abort();
    return this.pending;
  }

  retire(): void {
    const retirement = this.retirement, cleanups = this.cleanups.splice(0);
    this.retirement = undefined;
    const errors: unknown[] = [];
    try {retirement?.();} catch (error) {errors.push(error);}
    for (const unregister of cleanups) try {unregister();} catch (error) {errors.push(error);}
    if (errors.length) throw errors[0];
  }

  private captureReload() {
    const {context, runtime, loader, ui, policy, callerOverrides, contextBudget} = this.input;
    const session = context.session, id = session.id, createdAt = session.createdAt, sessionRoot = session.projectRoot;
    const configuration = context.configuration, revision = configuration.current;
    const root = context.projectRoot, cwd = context.cwd;
    const lease = this.lease, owner = captureExtensionRuntimeFor(context), host = extensionHostFor(context);
    if (this.closed || typeof loader.captureReload !== 'function' || !lease || !owner || !host) throw new Error('Resource reload is unavailable for this loader.');
    const configured = configurationAdmission(context);
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
    const transition = captureSessionTransition(layout);
    // A prompt can publish a title and activity time without replacing the SDK's session object.
    const metadata = readSessionMetadataRecord(layout.metadataPath);
    if (!metadata) throw new Error('SDK saved session metadata is unavailable.');
    const saved = transition({...session, title:metadata.title, updatedAt:metadata.updatedAt});
    const store = new SessionStoreAccess(), selection = store.readCurrentSessionSelection(root);
    let receipt: ResourceReloadReceipt | undefined, successorHost: typeof host | undefined;
    let expectedRevision = revision, intentionallyRetired = false, retired = false;
    const sourceCheck = () => {
      const refused = configured();
      if (this.closed || refused || context.session !== session || session.id !== id || session.createdAt !== createdAt || session.projectRoot !== sessionRoot
        || context.configuration !== configuration
        || configuration.current !== expectedRevision || context.projectRoot !== root || context.cwd !== cwd
        || extensionHostFor(context) !== (successorHost ?? host) || !owner.current()) throw new Error('SDK resource reload owner changed.');
      saved(() => {
        if (!sameValue(store.readCurrentSessionSelection(root), selection)) throw new Error('SDK saved session selection changed.');
      });
    };
    sourceCheck(); lease.assertCurrent(host); sourceCheck();
    const checkLease = () => {
      if (receipt) receipt.assertCurrent(successorHost);
      else if (intentionallyRetired) lease.assertCurrent();
      else lease.assertCurrent(host);
    };
    const retire = async () => {
      const errors: unknown[] = [];
      const previouslyRetired = retired;
      if (!retired) {
        retired = true;
        const retiring = this.cleanups.splice(0);
        for (const unregister of retiring) try {unregister();} catch (error) {errors.push(error);}
        if (intentionallyRetired) {
          try {lease.retireForReload(host);} catch (error) {errors.push(error);}
        } else {
          try {this.retire();} catch (error) {errors.push(error);}
        }
        try {await owner.retire();} catch (error) {errors.push(error);}
      } else {
        try {this.retire();} catch (error) {errors.push(error);}
        try {await owner.retire();} catch (error) {errors.push(error);}
      }
      if (previouslyRetired || !intentionallyRetired || receipt || this.closed || configured()) {
        try {ui.abandonReload();} catch (error) {errors.push(error);}
        try {closeExtensionHost(context, successorHost ?? host);} catch (error) {errors.push(error);}
      }
      if (errors.length) throw errors[0];
    };
    return {
      current:() => owner.current(), admission:() => {sourceCheck(); checkLease();}, ready:owner.ready,
      shutdown:async (signal: AbortSignal) => {
        this.active = true;
        ui.beginReload();
        await owner.shutdown('reload', async () => {}, signal);
        intentionallyRetired = true;
      },
      retire,
      replace:async (signal: AbortSignal) => {
        const next = await lease.reload({signal, admission:sourceCheck});
        receipt = next;
        this.retirement = () => next.retire();
        signal.throwIfAborted(); sourceCheck(); next.assertCurrent();
        expectedRevision = applySdkResources(context, next.snapshot, policy, callerOverrides, contextBudget, () => {sourceCheck(); next.assertCurrent();});
        sourceCheck(); next.assertCurrent();
        this.cleanups = registerSdkExtensions(cwd, session.id, next.snapshot.extensions, () => extensionHostFor(context)?.ui, expectedRevision.catalog);
        successorHost = await owner.replace(signal);
        signal.throwIfAborted(); sourceCheck(); next.assertCurrent();
        next.bind(successorHost);
        next.assertCurrent(successorHost); sourceCheck();
        ui.rebind(successorHost);
        next.assertCurrent(successorHost); sourceCheck();
        this.lease = next.captureReload();
        return {host:successorHost, publication:expectedRevision};
      },
      start:async (signal: AbortSignal) => {await owner.start('reload', signal); sourceCheck(); checkLease();},
      diagnostics:() => [...(receipt?.snapshot.extensions.errors ?? []).map(error => ({kind:'error' as const, path:resourceReport(error.path), message:resourceReport(error.error)})),
        ...captureDiagnostics(receipt?.snapshot.skills.diagnostics ?? []), ...captureDiagnostics(receipt?.snapshot.themes.diagnostics ?? []),
        ...owner.diagnostics().map(message => ({kind:'warning' as const, message:resourceReport(message)}))],
    };
  }
}
