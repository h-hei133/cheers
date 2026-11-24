import { projectModelSelection } from "../../../session/model/projection.js";
import { getRuntimeConfig, type RuntimeConfig } from "../../../config/runtimeConfig.js";
import { loadCatalogSnapshot } from "../../../core/models/catalogStore.js";
import { availabilityLabel, availabilitySnapshot, endpointLabel, matchesCatalog, type ConnectionAvailability } from "../../../core/models/availability.js";
import { catalogProvider, isUserConfiguredModel, type CatalogProvider } from "../../../core/models/catalog.js";
import { providerCredentialBaseUrl } from '../../../core/auth/account/target.js';
import { effortCapability } from "../../../core/models/capability.js";
import { resolveProviderCredential } from "../../../core/shell/providerCredentials.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import { isFocusable } from "../../../presentation/tui/chrome/option.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { applyModelPreset, resolveModelPreset, wholePresetFailure } from "../../../core/commands/model/preset.js";
import { readProfilePresets } from "../../../core/commands/model/presetStore.js";
import { decodeSessionModel } from "../../../session/model/state.js";
import type { SessionModelRole, SessionModelTarget } from "../../../session/model/contract.js";
import { exactTargetMatches, scopedModelTarget, targetResolutionIdentity } from "../../../core/commands/model/target.js";
import { captureModelChoice } from "../../../core/commands/model/choice.js";
import { setModel, setReviewedModelTarget } from "../../../core/commands/model/selection.js";
import { captureThinkingPreference } from "../../../core/models/preference.js";
import { sameValue } from "../../../config/values.js";
import { connectionDraft, connectionEndpoint } from './connections.js';
import { catalogueDetailSource, modelDetailsPicker, type ModelDetailAction, type ModelDetailRecord,
  type ModelDetailOrigin, type ModelDetailSource } from './model/details.js';
import { CatalogNavigation, type NavigationGroup } from './navigation.js';
import { watchModels } from './model/watch.js';
import { refreshModelCatalog } from './model/publication.js';
import { orderModelCatalog } from './model/order.js';
import { modelEffortPicker } from './model/recovery.js';
import { prepareModelRole, type AutomaticModelRole, type RoleResult } from '../../../core/commands/model/role.js';
import { modelRoleEditor } from './model/role.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';
import { modelAccountSignIn, modelSignInPicker, modelSignInStatus, type ModelSignIn } from './model/auth.js';
import { modelKeyPicker } from './model/key.js';
import { listedModelMetadata, modelMetadataDetails } from './model/metadata.js';
import { ModelFocus } from './model/focus.js';
import { ModelActionOwner, modelActionAdmission, modelBrowserOwned } from './model/owner.js';
import { providerBindingAvailable, providerScopeSelected } from '../../../core/auth/binding.js';
import { sessionVirtualModels, sessionModelCatalog } from '../../../core/catalog/models.js';
import { EXTENSION_MODEL_PREFIX, sessionProviderScope } from '../../../core/catalog/providers.js';
import { setVirtualModel } from '../../../core/commands/model/virtual.js';
import { virtualModelEffortPicker } from './model/virtual.js';

interface RoleSelection {
  readonly role: AutomaticModelRole;
  readonly assign: (target: SessionModelRole) => RoleResult;
  readonly back: (notice?: string, context?: CommandContext) => Picker;
  readonly thinkingEffort: ThinkingPreference;
}

/** Every actionable row retains its exact target and the inputs used to display it. */
export function modelPicker(context: CommandContext, focus?: string, navigation = new CatalogNavigation('ready', false, true), assigning?: RoleSelection,
  notice?: string, signIn?: ModelSignIn, parent?: (notice?: string) => Picker,
  focusOrigin?: ModelDetailOrigin): Picker {
  const details = new Map<string, readonly string[]>();
  const detailRecords = new Map<string, ModelDetailRecord>();
  const actions = new Map<string, (stillOwned: () => boolean) => Promise<string>>();
  const inspections = new Map<string, () => Picker>();
  const assignments = new Map<string, () => RoleResult>();
  const focusState = new ModelFocus();
  let filtering = false;
  let refreshFailed = false;
  let catalogDiagnostics: readonly string[] = [];
  const refreshFailure = 'Model catalogue could not be refreshed; cached models are read-only.';
  let observedRevision: number | undefined;
  let activeFocus = focus;
  let returnFocus = focus;
  let focusFallback = focusOrigin;
  let inspectionAdmission: (() => string | undefined) | undefined;
  const actionOwner = new ModelActionOwner();
  const picker: Picker = {
    title: assigning ? `${assigning.role} model` : "Model",
    form: "panel",
    acceptsOwnership: true,
    get empty() { return refreshFailed ? refreshFailure : filtering ? 'No matching models.'
      : navigation.active === 'ready' ? 'No ready or configured models. Choose Registry to browse the full catalogue.' : 'No models in this view.'; },
    navigation, fullScreen: true,
    ...(assigning ? { back: assigning.back } : parent ? { back: () => parent(notice) } : {}),
    onOpen() { actionOwner.open(); returnFocus = focus; focusState.reset(); },
    previewEnd() { actionOwner.close(); },
    get initialSelection() { return activeFocus; },
    replacementSelection: (options, previous, focused) => {
      if (navigation.all.some(row => row.id === focused)) return undefined;
      const replacement = focusState.select(options, previous, focused, observedRevision);
      if (replacement) navigation.focus(replacement);
      return replacement;
    },
    status: () => [refreshFailed ? refreshFailure : undefined, ...catalogDiagnostics, focusState.notice, notice].filter(Boolean).join(' ') || undefined,
    filterOptions: query => {
      filtering = Boolean(query);
      const rows = navigation.project(query);
      return refreshFailed ? rows.map(row => ({ ...row, disabled: true,
        focusable: isFocusable(row), note: 'unverified' })) : rows;
    },
    footer: '↑↓ browse · Tab: navigation/content · ←→: parent/content · Enter: activate · Ctrl+Enter: details / effort · Esc: back',
    async load(): Promise<readonly Option[]> {
      refreshFailed = true;
      inspectionAdmission = undefined;
      details.clear(); detailRecords.clear(); actions.clear(); inspections.clear(); assignments.clear();
      refreshModelCatalog(context);
      let choice: ReturnType<typeof captureModelChoice> | undefined;
      let virtualChoice: ReturnType<typeof captureModelChoice> | undefined;
      try { choice = captureModelChoice(context); } catch { /* Read-only discovery still works without a saved session. */ }
      try { virtualChoice = context.logicalModelAdmission ? captureModelChoice({ ...context, admission: context.logicalModelAdmission }) : choice; }
      catch { /* Logical discovery remains read-only when session capture fails. */ }
      const admitInspection = () => {
        if (context.signal?.aborted) return 'Model inspection cancelled. Reopen the model picker.';
        const refusal = choice?.admission() ?? context.admission?.();
        return context.signal?.aborted ? 'Model inspection cancelled. Reopen the model picker.' : refusal;
      };
      inspectionAdmission = admitInspection;
      const publication = context.readConfiguration?.();
      observedRevision = publication?.revision;
      const config = choice?.config ?? publication?.config ?? context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd);
      const local = choice || publication ? undefined : loadCatalogSnapshot();
      const catalog = choice?.catalog ?? publication?.catalog ?? local!.providers;
      // A failed capture cannot make accepted physical defaults into current session facts.
      const selection = decodeSessionModel(choice?.baseline?.selection);
      const logical = selection?.virtualModel;
      const selectionAvailable = !context.sessionId || Boolean(choice?.baseline);
      catalogDiagnostics = choice?.catalogDiagnostics ?? publication?.catalogDiagnostics ?? local?.diagnostics ?? [];
      const active = context.resolveConfigTarget?.(config, selectionAvailable ? context.sessionId : undefined)
        ?? resolveProviderCredential({ runtimeConfig: config, ...(selectionAvailable && context.sessionId ? { pool: { sessionId: context.sessionId } } : {}) });
      // Inspecting prospective targets must not remember them as the session's next pool account.
      // Keep the host's request overrides, while actual activation retains the original context.
      const inspectionContext = { ...context, sessionId: undefined };
      const activeAddress = providerCredentialBaseUrl(catalog, active);
      const currentProviderSlot = providerScopeSelected(config, active);
      const activeReady = Boolean(selectionAvailable && !active.blocked && (active.credential
        || (currentProviderSlot && providerBindingAvailable(catalog, active))));
      const availability = availabilitySnapshot({ config, catalog });
      const thinkingEffort = assigning ? assigning.thinkingEffort
        : captureThinkingPreference(context.projectRoot ?? context.cwd, active.thinkingEffort).thinkingEffort;
      const rows: Option[] = [];
      const groups = new Map<string, NavigationGroup>();
      const seen = new Set<string>();
      for (const provider of catalog) {
        const entry = availability.providers.find(item => item.provider === provider.runtime);
        const connections = (entry?.connections ?? []).filter(connection => matchesCatalog(provider, connection, config.providerConnections, catalog));
        const providerSlot = active.provider === provider.runtime && !active.credential?.connectionId
          && Boolean(active.credential || currentProviderSlot)
          && (provider.id === provider.runtime || Boolean(activeAddress && provider.baseUrl
            && activeAddress.replace(/\/+$/, '') === provider.baseUrl.replace(/\/+$/, '')));
        for (const connection of providerSlot ? [...connections, undefined] : connections.length ? connections : [undefined]) {
          if (!provider.models.length) {
            const id = rowId(connection?.connectionId, provider.id, '');
            groups.set(id, { category: provider.id, section: connection
              ? `${connection.label ?? connection.connectionId} · ${provider.label || provider.id}` : provider.label || provider.id });
            rows.push({ id, label: provider.label, detail: connection?.label ?? connection?.connectionId,
              note: 'no models listed', disabled: true });
            details.set(id, modelDetails(provider, connection));
          }
          for (const model of provider.models) {
            const id = rowId(connection?.connectionId, provider.id, model.id);
            if (seen.has(id)) continue;
            seen.add(id);
            const target: SessionModelTarget = connection ? { connectionId: connection.connectionId, provider: connection.provider, model: model.id, thinkingEffort }
              : { connectionScope: 'provider', provider: provider.runtime, model: model.id, thinkingEffort };
            const targetContext = modelTargetContext(inspectionContext, target);
            const candidate = connection || providerSlot ? projectModelSelection(config, scopedModelTarget(target)) : undefined;
            const resolution = candidate ? targetContext.resolveConfigTarget?.(candidate)
              ?? resolveProviderCredential({ runtimeConfig: candidate }) : undefined;
            const ambientCandidate = !connection && !providerSlot && provider.id === provider.runtime
              ? projectModelSelection(config, scopedModelTarget(target)) : undefined;
            const ambientResolution = ambientCandidate
              ? targetContext.resolveConfigTarget?.(ambientCandidate)
                ?? resolveProviderCredential({ runtimeConfig: ambientCandidate }) : undefined;
            const namedConnectionRequired = Boolean(ambientResolution && !ambientResolution.blocked
              && ambientResolution.provider === provider.runtime && ambientResolution.credential
              && ambientResolution.credential.connectionId === undefined);
            const effectiveResolution = resolution ?? (namedConnectionRequired ? ambientResolution : undefined);
            const exact = candidate ? exactTargetMatches(targetContext, candidate, target, catalog) : false;
            const resolutionReady = Boolean(resolution && providerBindingAvailable(catalog, resolution));
            const modelAddress = effectiveResolution && providerBindingAvailable(catalog, effectiveResolution) ? providerCredentialBaseUrl(catalog, effectiveResolution)
              : effectiveResolution?.baseUrl ?? config.providerConnections.find(item => item.id === connection?.connectionId)?.baseUrl ?? provider.baseUrl;
            const ambiguous = catalogProvider(catalog, provider.runtime, modelAddress).ambiguous;
            const capability = effortCapability(catalog, provider.runtime, model.id, thinkingEffort, modelAddress);
            const assignedEffort = assigning && capability !== 'supported' ? null : thinkingEffort;
            const unsupported = !assigning && capability === 'unsupported';
            const selectedEffort = unsupported ? null : thinkingEffort;
            const selectedTarget = selectedEffort === thinkingEffort ? target : { ...target, thinkingEffort: selectedEffort };
            const selectedTargetContext = modelTargetContext(inspectionContext, selectedTarget);
            const configuredModel = connection?.model?.trim()
              || config.providerCredentials?.[provider.runtime]?.model?.trim()
              || (providerSlot ? active.model?.trim() : undefined);
            const alias = provider.id === provider.runtime ? catalog.find(candidate => candidate.runtime === provider.runtime
              && candidate.id !== provider.runtime && candidate.baseUrl !== undefined && modelAddress !== undefined
              && candidate.baseUrl.replace(/\/+$/, '') === modelAddress.replace(/\/+$/, '')) : undefined;
            const selected = Boolean(!logical && !selection?.extensionProvider && exact && !ambiguous && !alias && activeReady
              && connection?.connectionId === active.credential?.connectionId && provider.runtime === active.provider && model.id === active.model
              && resolution?.baseUrl === active.baseUrl && sameValue(resolution?.credential, active.credential));
            const configured = selected || isUserConfiguredModel(provider, model.id) || model.id === configuredModel;
            const reason = namedConnectionRequired ? 'named connection required'
              : assigning && !connection ? 'role assignment requires a configured connection'
              : !connection && !providerSlot ? 'configure a connection' : connection && connection.state !== 'ready' ? availabilityLabel(connection.state)
              : !resolutionReady ? resolution?.blocked === 'connection-overridden' ? 'request target mismatch'
                : resolution?.credential ? 'request unavailable' : 'credential unavailable'
              : !exact ? 'request target mismatch'
              : ambiguous ? 'model catalogue endpoint is ambiguous'
              : !selectionAvailable ? 'saved session unavailable'
              : !choice?.baseline ? 'active session required' : undefined;
            groups.set(id, { category: provider.id, section: connection
              ? `${connection.label ?? connection.connectionId} · ${provider.label || provider.id}` : provider.label || provider.id,
              configured });
            const metadata = listedModelMetadata(catalog, provider, model.id, modelAddress);
            rows.push({ id, label: model.id,
              detail: [connection?.connectionId ?? (effectiveResolution?.credential ? `${effectiveResolution.credential.source} credential` : undefined), connection?.label, provider.label, connection?.endpoint ?? endpointLabel(modelAddress),
                metadata?.contextWindow ? `${Math.round(metadata.contextWindow / 1000)}k` : undefined].filter(Boolean).join(' · '),
              note: selected ? 'active' : unsupported ? 'effort will use auto' : reason ?? (alias ? `alias: ${alias.label}` : connection ? availabilityLabel(connection.state) : 'ready'),
              ...(reason ? { disabled: true, focusable: true } : {}) });
            const displayed = connection?.state === 'ready' && (resolution?.blocked || !resolution?.credential)
              ? { ...connection, state: 'credential-missing' as const, reason: 'This explicit connection needs its own credential.' } : connection;
            const lines = [...modelDetails(provider, displayed, !connection ? effectiveResolution?.credential?.source : undefined),
              ...(!connection && modelAddress ? [`Endpoint: ${endpointLabel(modelAddress)}`] : []),
              `Reasoning effort: ${assigning ? assignedEffort ?? 'auto' : selectedEffort ?? 'auto'}`,
              ...modelMetadataDetails(catalog, provider, model.id, modelAddress), ...(reason ? [reason] : [])];
            details.set(id, lines);
            const inspection = () => modelDetailsPicker(detailSourceFor(id, model.id, id));
            const detailActions: ModelDetailAction[] = [];
            const captured = choice;
            if (!reason && captured) {
              const resolution = targetResolutionIdentity(selectedTargetContext, config, selectedTarget);
              detailActions.push({ id: 'effort', label: 'Choose effort', run: (returnTo, inspect) => ({ next: modelEffortPicker({
                target: selectedTarget, current: assigning ? assignedEffort : thinkingEffort, catalog, baseUrl: modelAddress, lines, admission: admitInspection,
                back: note => note === undefined ? inspect() : returnTo(note), canReturn: () => modelBrowserOwned(context),
                save: async (effort, stillOwned = () => true) => assigning && connection
                  ? (modelActionAdmission(admitInspection, stillOwned) ?? assigning.assign({ connectionId: connection.connectionId,
                    provider: connection.provider, model: model.id, thinkingEffort: effort }).output)
                  : setReviewedModelTarget({ ...selectedTarget, thinkingEffort: effort }, { ...context, admission: () => {
                    const refusal = admitInspection();
                    return stillOwned && !stillOwned() ? 'Model selection cancelled. Reopen the model picker.' : refusal;
                  } }, { baseline: captured.baseline, resolution: targetResolutionIdentity(
                    modelTargetContext(inspectionContext, { ...selectedTarget, thinkingEffort: effort }), config,
                    { ...selectedTarget, thinkingEffort: effort }) }),
                done: result => assigning ? assigning.back(result) : parent ? parent(result) : returnTo(result),
              }) }) });
            }
            if (reason) {
              const endpoint = config.providerConnections.find(item => item.id === connection?.connectionId)?.baseUrl
                ?? effectiveResolution?.baseUrl ?? provider.baseUrl;
              const safeEndpoint = connectionEndpoint(endpoint);
              const canConfigure = !connection && !providerSlot || reason === 'credential unavailable'
                || Boolean(connection && ['credential-missing', 'pending', 'error'].includes(connection.state));
              const draft = canConfigure && (!endpoint || safeEndpoint) && (provider.id === provider.runtime || safeEndpoint)
                ? connectionDraft(provider, model.id, endpoint, connection?.label ?? provider.id) : undefined;
              const account = signIn && canConfigure && modelAccountSignIn(provider, model.id, endpoint);
              const back = (fresh: CommandContext, result?: string, connectionId?: string, origin?: ModelDetailOrigin) => {
                const status = result ? modelSignInStatus(result) : undefined;
                let refreshed: RoleSelection | undefined;
                if (assigning) {
                  try { refreshed = refreshRoleSelection(fresh, assigning); }
                  catch { return assigning.back(status ?? 'Role settings could not be read. Reopen the model panel.', fresh); }
                }
                return modelPicker(fresh, connectionId ? rowId(connectionId, provider.id, model.id) : id, navigation, refreshed,
                  status, signIn, parent, origin);
              };
              const childBack = (returnTo: (notice?: string) => Picker, origin?: ModelDetailOrigin) =>
                (fresh: CommandContext, result?: string, connectionId?: string) =>
                  result === undefined && connectionId === undefined ? returnTo() : back(fresh, result, connectionId, origin);
              if (account && signIn) detailActions.push({ id: 'account', label: 'Account sign-in',
                run: (returnTo, _inspect, origin) => ({ next: modelSignInPicker(context, provider.runtime, signIn, childBack(returnTo, origin)) }) });
              if (draft && signIn) detailActions.push({ id: 'configure', label: 'Configure connection',
                run: (returnTo, _inspect, origin) => ({ next: modelKeyPicker(context, provider.runtime,
                  { model: model.id, label: connection?.label ?? provider.id, baseUrl: safeEndpoint }, signIn,
                  childBack(returnTo, origin)) }) });
              else if (draft) detailActions.push({ id: 'configure', label: 'Configure connection',
                detail: 'Prepare a login command for this exact model.', run: () => ({ draft }) });
            }
            inspections.set(id, inspection);
            detailRecords.set(id, { identity: id, view: {
              label: model.id, lines, actions: detailActions, available: true, revision: observedRevision, admission: admitInspection,
            } });
            if (!reason && assigning && connection) {
              assignments.set(id, () => assigning.assign({ connectionId: connection.connectionId, provider: connection.provider, model: model.id, thinkingEffort: assignedEffort }));
            } else if (!reason && choice) {
              const captured = choice;
              const resolution = targetResolutionIdentity(selectedTargetContext, config, selectedTarget);
              actions.set(id, async stillOwned => modelActionAdmission(captured.admission, stillOwned) ?? setReviewedModelTarget(selectedTarget,
                { ...context, admission: () => modelActionAdmission(captured.admission, stillOwned) }, { baseline: captured.baseline, resolution }));
            }
          }
        }
      }
      // A protocol's credential cannot make a different relay category usable.
      // Derive category readiness from its exact, admitted model rows.
      const readyCategories = new Set(rows.filter(row => !row.disabled).map(row => groups.get(row.id)?.category));
      const categories = [...orderModelCatalog(catalog, rows, groups, readyCategories)];
      if (!assigning && context.sessionId) {
        const scope = sessionProviderScope(context.cwd, context.sessionId, catalog, active);
        const registration = scope.registration;
        if (registration && choice?.baseline) {
          const captured = choice;
          if (!categories.some(category => category.id === registration.id)) {
            categories.push({ id: registration.id, label: registration.label });
          }
          for (const model of registration.models) {
            const id = `${EXTENSION_MODEL_PREFIX}${registration.id}/${model.id}`;
            const selected = selection?.extensionProvider?.id === registration.id && selection.extensionProvider.baseUrl === registration.baseUrl
              && selection.model === model.id && active.model === model.id;
            const unsupported = effortCapability(scope.catalog, active.provider, model.id, thinkingEffort, activeAddress) === 'unsupported';
            groups.set(id, { category: registration.id, section: registration.label, configured: true });
            rows.push({ id, label: model.id, detail: registration.label, note: selected ? 'active' : unsupported ? 'reasoning effort unsupported' : 'ready' });
            const admission = (stillOwned: () => boolean) => modelActionAdmission(captured.admission, stillOwned) ?? scope.admission?.();
            actions.set(id, async stillOwned => admission(stillOwned) ?? setModel([id], { ...context, admission: () => admission(stillOwned) }, false,
              unsupported ? null : thinkingEffort));
            details.set(id, [...modelDetails(registration), ...modelMetadataDetails(scope.catalog, registration, model.id, activeAddress)]);
          }
        }
        if (selection?.extensionProvider && !rows.some(row => row.id.startsWith(EXTENSION_MODEL_PREFIX) && row.note === 'active')) {
          const { id: provider } = selection.extensionProvider;
          const id = `${EXTENSION_MODEL_PREFIX}${provider}/${selection.model}`;
          if (!categories.some(category => category.id === provider)) {
            categories.push({ id: provider, label: provider });
          }
          groups.set(id, { category: provider, section: provider, configured: true });
          rows.unshift({ id, label: selection.model ?? provider, detail: provider, note: 'active · unavailable', disabled: true, focusable: true });
          details.set(id, ['The selected extension model is unavailable. Reload its extension or choose another model.']);
        }
        const virtualCatalog = sessionModelCatalog(context.cwd, context.sessionId, catalog).virtual;
        const definitions = sessionVirtualModels(context.cwd, context.sessionId);
        for (const model of virtualCatalog) {
          const id = `virtual:${JSON.stringify([model.provider, model.id])}`;
          const definition = definitions.find(value => value.provider === model.provider && value.id === model.id)!;
          const selected = logical?.provider === model.provider && logical.model === model.id;
          if (!categories.some(category => category.id === model.provider)) {
            categories.push({ id: model.provider, label: model.provider });
          }
          groups.set(id, { category: model.provider, section: model.name, configured: Boolean(virtualChoice?.baseline) || selected });
          rows.push({ id, label: model.id, detail: model.name, note: selected ? 'active' : 'virtual',
            ...(!virtualChoice?.baseline ? { disabled: true, focusable: true } : {}) });
          details.set(id, [`Model: ${model.provider}/${model.id}`, `Name: ${model.name}`, 'Physical destination is resolved per request.']);
          if (virtualChoice?.baseline) {
            const captured = virtualChoice;
            const target = { provider: model.provider, model: model.id,
              ...(selected && logical.thinkingEffort !== undefined ? { thinkingEffort: logical.thinkingEffort } : {}) };
            actions.set(id, async stillOwned => {
              const admission = () => modelActionAdmission(captured.admission, stillOwned)
                ?? (sessionVirtualModels(context.cwd, context.sessionId!).includes(definition) ? undefined : 'Virtual model registration changed. Reopen the picker.');
              return admission() ?? setVirtualModel(target, { ...context, admission, logicalModelAdmission: admission }, { baseline: captured.baseline, definition });
            });
            inspections.set(id, () => virtualModelEffortPicker(model, target.thinkingEffort ?? null,
              (thinkingEffort, stillOwned) => {
                const admission = () => modelActionAdmission(captured.admission, stillOwned)
                  ?? (sessionVirtualModels(context.cwd, context.sessionId!).includes(definition) ? undefined : 'Virtual model registration changed. Reopen the picker.');
                return setVirtualModel({ ...target, thinkingEffort }, { ...context, admission, logicalModelAdmission: admission }, { baseline: captured.baseline, definition });
              }, note => modelPicker(context, id, navigation, undefined, note, signIn, parent),
              captured.admission, () => modelBrowserOwned({ ...context, admission: context.logicalModelAdmission ?? context.admission })));
          }
        }
        if (logical && !virtualCatalog.some(model => model.provider === logical.provider && model.id === logical.model)) {
          const id = `virtual:${JSON.stringify([logical.provider, logical.model])}`;
          groups.set(id, { category: logical.provider, section: logical.provider, configured: true });
          rows.unshift({ id, label: logical.model, detail: `${logical.provider}/${logical.model}`, note: 'active · unavailable', disabled: true, focusable: true });
          details.set(id, ['The selected virtual model is unavailable. Reload its extension or choose another model.']);
          if (!categories.some(category => category.id === logical.provider)) categories.push({ id: logical.provider, label: logical.provider });
        }
      }
      // Overrides and legacy credentials can supply a current request without a
      // matching named connection. Keep that fact visible without inventing one.
      const savedTarget = choice?.baseline?.selection;
      const currentModel = active.model ?? (active.blocked && savedTarget?.connectionScope === 'session' ? savedTarget.model : undefined);
      const currentProvider = !active.model && active.blocked && savedTarget?.connectionScope === 'session' ? savedTarget.provider : active.provider;
      const currentConnection = active.credential && !active.blocked ? active.credential.connectionId
        : active.selection?.connectionId ?? (active.selection?.credentialScope !== 'provider'
          ? config.sessionConnection?.id ?? config.activeProviderConnectionId : undefined);
      if (selectionAvailable && !logical && !selection?.extensionProvider && currentModel && !rows.some(row => row.note === 'active')) {
        const id = 'model:current';
        if (!categories.some(category => category.id === currentProvider)) {
          categories.push({ id: currentProvider, label: currentProvider });
        }
        groups.set(id, { category: currentProvider, section: currentProvider, configured: true });
        const reportAddress = activeReady ? activeAddress : active.baseUrl;
        const endpoint = endpointLabel(reportAddress);
        const note = active.blocked ? 'request blocked' : activeReady ? 'active' : 'credential missing';
        const connection = config.providerConnections.find(item => item.id === currentConnection && item.provider === currentProvider);
        const metadataAddress = activeReady ? activeAddress : connection?.baseUrl;
        const exactCatalog = connection ? catalogProvider(catalog, currentProvider, metadataAddress) : undefined;
        const exactFacts = exactCatalog?.entry && !exactCatalog.ambiguous
          ? modelMetadataDetails(catalog, exactCatalog.entry, currentModel, metadataAddress) : undefined;
        const targetId = exactCatalog?.entry && !exactCatalog.ambiguous ? rowId(connection!.id, exactCatalog.entry.id, currentModel) : undefined;
        // A report offers the existing exact-record inspection; labels and runtime
        // aliases cannot choose another relay, deleted record or pool member.
        const recovery = (!active.credential || active.blocked) && (!active.blocked || ['connection-pending', 'connection-unavailable'].includes(active.blocked))
          && targetId ? inspections.get(targetId) : undefined;
        rows.unshift({ id, label: currentModel, detail: [active.credential ? `${active.credential.source} credential` : 'Current request', currentProvider, currentConnection, endpoint].filter(Boolean).join(' · '),
          note, disabled: true, focusable: true });
        const lines = [`Provider: ${currentProvider}`, `Model: ${currentModel}`, `Status: ${note}`, `Reasoning effort: ${thinkingEffort ?? 'auto'}`,
          'Catalogue: models.yaml, models.yml or models.json (user profile only); settings: config.yaml, config.yml or config.json; connections: auth.json.',
          ...(currentConnection ? [`Selected connection: ${currentConnection}`] : []),
          ...(active.credential ? [`Credential source: ${active.credential.source}`] : []), ...(endpoint ? [`Endpoint: ${endpoint}`] : []),
          ...(active.blocked ? [`Request blocker: ${active.blocked}`] : []),
          ...(exactFacts ?? ['Model capabilities: unverified']),
          'Remote availability: unverified'];
        details.set(id, lines);
        const identity = JSON.stringify([currentProvider, currentConnection ?? null, currentModel]);
        detailRecords.set(id, { identity, view: {
          label: currentModel, lines, actions: recovery ? [{ id: 'connection', label: 'Connection details',
            run: () => ({ next: recovery() }) }] : [], available: true, revision: observedRevision, admission: admitInspection,
        } });
        inspections.set(id, () => modelDetailsPicker(detailSourceFor(id, currentModel, identity)));
      }
      if (context.sessionId && !assigning) {
        try {
          for (const role of ['default', 'subagent', 'summary', 'advisor'] as const) {
            const target = !selectionAvailable ? undefined : role === 'default' ? logical ? { ...logical, connectionId: undefined } : { provider: active.provider, model: active.model, connectionId: active.credential?.connectionId, thinkingEffort }
              : (selection?.roles ?? config.sessionModelRoles)?.[role];
            const id = `role:${role}`;
            rows.push({ id, label: role === 'default' ? 'Default' : role[0].toUpperCase() + role.slice(1),
              detail: !selectionAvailable ? 'unknown' : target?.model ? `${target.provider}/${target.model}` : 'Uses default model', disabled: true, focusable: true });
            groups.set(id, { category: 'roles' });
            details.set(id, [`Role: ${role}`, !selectionAvailable ? 'Model: unknown' : target?.model ? `Model: ${target.provider}/${target.model}` : 'Model: follows the default',
              ...(target?.connectionId ? [`Connection: ${target.connectionId}`] : []),
              ...(role !== 'default' && target ? [`Reasoning effort: ${target.thinkingEffort ?? 'provider decides'}`] : []),
              'Role assignments and presets share the existing session model owner.']);
            if (role === 'default') {
              inspections.set(id, () => modelPicker(context, undefined, new CatalogNavigation('ready', false, true), undefined, undefined, signIn,
                note => modelPicker(context, id, navigation, undefined, note, signIn, parent)));
            } else {
              inspections.set(id, () => {
                const back = (note?: string, fresh = context) => modelPicker(fresh, id, navigation, undefined, note, signIn, parent);
                return modelRoleEditor(context, role,
                  (assign, thinkingEffort) => modelPicker(context, undefined, new CatalogNavigation('ready', false, true), { role, assign, back, thinkingEffort }, undefined, signIn), back, notice);
              });
            }
          }
          const presets = { ...readProfilePresets(), ...(selection?.presets ?? {}) };
          for (const [name, preset] of Object.entries(presets)) {
            const resolved = resolveModelPreset(context.sessionId, name);
            const allId = `preset-all:${name}`;
            groups.set(allId, { category: 'roles' });
            const failure = wholePresetFailure(preset);
            rows.push({ id: allId, label: `Preset: ${name} / all`, detail: 'Default and automatic model roles', note: failure ?? resolved?.source,
              ...(failure || !choice ? { disabled: true } : {}) });
            details.set(allId, [failure ?? 'Apply all supported roles in one session update.',
              ...Object.entries(preset.roles).map(([role, target]) => `${role}: ${target.connectionId} · ${target.provider}/${target.model} · ${target.thinkingEffort ?? 'auto'}`)]);
            if (!failure && choice) {
              const captured = choice;
              actions.set(allId, async stillOwned => {
                const admission = () => modelActionAdmission(captured.admission, stillOwned) ?? (sameValue(resolveModelPreset(context.sessionId, name), resolved)
                  ? undefined : 'Model preset changed. Reopen the model picker.');
                return admission() ?? applyModelPreset(context.sessionId!, name, 'default', { ...context, admission }, true);
              });
            }
            for (const [role, target] of Object.entries(preset.roles)) {
              const id = role === 'default' ? `preset:${name}` : `preset:${name}:${role}`;
              groups.set(id, { category: 'roles' });
              rows.push({ id, label: `Preset: ${name}${role === 'default' ? '' : ` / ${role}`}`,
                detail: `${target.connectionId} · ${target.provider}/${target.model}`, note: resolved?.source });
              details.set(id, [`Preset: ${name}`, `Role: ${role}`, `Source: ${resolved?.source}`,
                `Connection: ${target.connectionId}`, `Model: ${target.provider}/${target.model}`, `Reasoning effort: ${target.thinkingEffort ?? 'auto'}`]);
              if (choice) {
                const captured = choice;
                actions.set(id, async stillOwned => {
                  const admission = () => modelActionAdmission(captured.admission, stillOwned) ?? (sameValue(resolveModelPreset(context.sessionId, name), resolved)
                    ? undefined : 'Model preset changed. Reopen the model picker.');
                  return admission() ?? applyModelPreset(context.sessionId!, name, role, { ...context, admission });
                });
              }
            }
          }
        } catch {
          rows.push({ id: "preset:unavailable", label: "Model presets unavailable", detail: "The preset library could not be read.", disabled: true });
        }
      }
      activeFocus = focus ?? (logical ? `virtual:${JSON.stringify([logical.provider, logical.model])}`
        : rows.find(row => row.note === 'active' && groups.get(row.id)?.configured)?.id);
      const projected = navigation.project('');
      const previousRows = focusFallback?.rows ?? projected;
      const crossCategory = focusFallback?.crossCategory === true;
      focusFallback = undefined;
      navigation.set(rows, groups, [...(assigning ? [] : [{ id: 'roles', label: 'Roles' }]), ...categories]);
      const fallbackOptions = crossCategory ? navigation.all : navigation.project('');
      if (returnFocus) {
        const requested = returnFocus;
        const update = navigation.point(requested, '');
        if (!update) {
          const replacement = focusState.select(fallbackOptions, previousRows, requested, observedRevision);
          activeFocus = replacement;
          if (replacement) navigation.point(replacement, '');
        }
        returnFocus = undefined;
      }
      focusState.settle(observedRevision);
      refreshFailed = false;
      return rows;
    },
    detail: id => refreshFailed ? [refreshFailure] : (id ? details.get(id) ?? [] : []),
    subscribe: publish => watchModels(context, () => picker.load(), rows => {
      refreshFailed = false;
      publish(rows);
    }, observedRevision, () => {
      refreshFailed = true;
      publish(navigation.all);
    }),
    async inspect(id) {
      if (typeof id !== 'string') return undefined;
      if (refreshFailed) return navigation.all.some(row => row.id === id) ? { note: refreshFailure } : undefined;
      const refusal = id.startsWith('virtual:') ? context.logicalModelAdmission?.() ?? (context.logicalModelAdmission ? undefined : inspectionAdmission?.()) : inspectionAdmission?.();
      if (refusal) return { note: refusal };
      const next = inspections.get(id)?.(); return next ? { next } : undefined;
    },
    async apply(ids: readonly string[], stillOwned?: () => boolean): Promise<PickerOutcome | undefined> {
      if (ids.length !== 1 || !ids[0]) return undefined;
      if (refreshFailed) return { note: refreshFailure };
      const owned = actionOwner.begin(context.signal, stillOwned);
      if (!owned) return undefined;
      try {
        const assignment = assignments.get(ids[0]);
        const action = actions.get(ids[0]);
        const note = assignment && assigning ? assignment().output : action ? await action(owned)
          : 'Model selection unavailable. Reopen the picker in an active session.';
        const back = assignment && assigning ? assigning.back : parent;
        const returning = back && owned() && modelBrowserOwned(context);
        // The writer's confirmed outcome survives closure; the old parent does not.
        return { note, ...(returning && owned() ? { next: back(note) } : {}) };
      } finally { actionOwner.finish(owned); }
    },
  };
  let detailReload: Promise<readonly Option[]> | undefined;
  const reloadDetailCatalogue = (): Promise<readonly Option[]> => detailReload ??= picker.load().finally(() => {
    detailReload = undefined;
  });
  const detailSourceFor = (id: string, label: string, identity: string): ModelDetailSource => catalogueDetailSource({
    label, identity, read: () => detailRecords.get(id), revision: () => context.readConfiguration?.().revision,
    reload: async () => { await reloadDetailCatalogue(); },
    currentRows: () => navigation.origin,
    back: (origin, detailNotice) => {
      let refreshed = assigning;
      if (assigning) {
        try { refreshed = refreshRoleSelection(context, assigning); }
        catch { return assigning.back(detailNotice ?? 'Role settings could not be read. Reopen the model panel.'); }
      }
      return modelPicker(context, id, navigation, refreshed, detailNotice, signIn, parent, origin);
    },
    canReturn: () => modelBrowserOwned(context),
    ...(context.readConfiguration ? {
      watch: (load, publish, observed, onFailure) => watchModels(context, load, publish, observed, onFailure),
    } : {}),
  });
  return picker;
}

function refreshRoleSelection(context: CommandContext, selection: RoleSelection): RoleSelection {
  const edit = prepareModelRole(context, selection.role);
  return { ...selection, assign: edit.assign, thinkingEffort: edit.current?.thinkingEffort ?? null,
    back: (notice?: string, fresh = context) => selection.back(notice, fresh) };
}

function modelTargetContext(context: CommandContext, target: SessionModelTarget): CommandContext {
  const resolveModelTarget = context.resolveConfigTarget?.resolveModelTarget;
  if (!resolveModelTarget) return context;
  return { ...context, resolveConfigTarget: (config: RuntimeConfig, sessionId?: string) =>
    resolveModelTarget(config, sessionId, target) };
}

function rowId(connection: string | undefined, provider: string, model: string): string {
  return `model:${JSON.stringify([connection ?? null, provider, model])}`;
}

function modelDetails(provider: CatalogProvider, connection?: ConnectionAvailability, source?: string): readonly string[] {
  return [`Provider: ${provider.label} (${provider.runtime})`,
    'Catalogue: models.yaml, models.yml or models.json (user profile only); settings: config.yaml, config.yml or config.json; connections: auth.json.',
    ...(connection ? [`Connection: ${connection.connectionId}`, ...(connection.label ? [`Label: ${connection.label}`] : []), ...(connection.endpoint ? [`Endpoint: ${connection.endpoint}`] : []),
      `Availability: ${availabilityLabel(connection.state)}`, connection.reason] : source ? [`Credential source: ${source}`] : ['Availability: configure a connection']),
    'Remote availability: unverified'];
}
