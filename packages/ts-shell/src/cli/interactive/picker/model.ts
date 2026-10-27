import { projectModelSelection, projectSessionModel } from "../../../session/model/projection.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { availabilityLabel, availabilitySnapshot, endpointLabel, type ConnectionAvailability } from "../../../core/models/availability.js";
import { catalogBaseUrl, catalogProvider, type CatalogProvider } from "../../../core/models/catalog.js";
import { effortCapability } from "../../../core/models/capability.js";
import { resolveProviderCredential } from "../../../core/shell/providerCredentials.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import { isFocusable } from "../../../presentation/tui/chrome/option.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { applyModelPreset, resolveModelPreset, wholePresetFailure } from "../../../core/commands/model/preset.js";
import { readProfilePresets } from "../../../core/commands/model/presetStore.js";
import { readSessionModel } from "../../../session/model/state.js";
import type { SessionModelRole, SessionModelTarget } from "../../../session/model/contract.js";
import { exactTargetMatches, scopedModelTarget, targetResolutionIdentity } from "../../../core/commands/model/target.js";
import { captureModelChoice } from "../../../core/commands/model/choice.js";
import { setReviewedModelTarget } from "../../../core/commands/model/selection.js";
import { captureThinkingPreference } from "../../../core/models/preference.js";
import { sameValue } from "../../../config/values.js";
import { connectionDraft, connectionEndpoint } from './connections.js';
import { catalogueDetailSource, modelDetailsPicker, type ModelDetailAction, type ModelDetailRecord,
  type ModelDetailOrigin, type ModelDetailSource } from './model/details.js';
import { CatalogNavigation, type NavigationGroup } from './navigation.js';
import { watchModels } from './model/watch.js';
import { refreshModelCatalog } from './model/publication.js';
import { modelEffortPicker } from './model/recovery.js';
import { prepareModelRole, type AutomaticModelRole, type RoleResult } from '../../../core/commands/model/role.js';
import { modelRoleEditor } from './model/role.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';
import { modelAccountSignIn, modelSignInPicker, modelSignInStatus, type ModelSignIn } from './model/auth.js';
import { modelKeyPicker } from './model/key.js';
import { listedModelMetadata, modelMetadataDetails } from './model/metadata.js';
import { ModelFocus } from './model/focus.js';

interface RoleSelection {
  readonly role: AutomaticModelRole;
  readonly assign: (target: SessionModelRole) => RoleResult;
  readonly back: (notice?: string, context?: CommandContext) => Picker;
  readonly thinkingEffort: ThinkingPreference;
}

/** Every actionable row retains its exact target and the inputs used to display it. */
export function modelPicker(context: CommandContext, focus?: string, navigation = new CatalogNavigation(), assigning?: RoleSelection,
  notice?: string, signIn?: ModelSignIn, parent?: (notice?: string) => Picker,
  focusOrigin?: ModelDetailOrigin): Picker {
  const details = new Map<string, readonly string[]>();
  const detailRecords = new Map<string, ModelDetailRecord>();
  const actions = new Map<string, () => Promise<string>>();
  const inspections = new Map<string, () => Picker>();
  const assignments = new Map<string, () => RoleResult>();
  const focusState = new ModelFocus();
  let filtering = false;
  let refreshFailed = false;
  const refreshFailure = 'Model catalogue could not be refreshed; cached models are read-only.';
  let observedRevision: number | undefined;
  let activeFocus = focus;
  let returnFocus = focus;
  let focusFallback = focusOrigin;
  let inspectionAdmission: (() => string | undefined) | undefined;
  const picker: Picker = {
    title: assigning ? `${assigning.role} model` : "Model",
    form: "panel",
    get empty() { return refreshFailed ? refreshFailure : filtering ? 'No matching models.' : 'No providers in the catalogue.'; },
    navigation, fullScreen: true,
    ...(assigning ? { back: assigning.back } : parent ? { back: () => parent(notice) } : {}),
    onOpen() { returnFocus = focus; focusState.reset(); },
    get initialSelection() { return activeFocus; },
    replacementSelection: (options, previous, focused) => {
      if (navigation.all.some(row => row.id === focused)) return undefined;
      const replacement = focusState.select(options, previous, focused, observedRevision);
      if (replacement) navigation.focus(replacement);
      return replacement;
    },
    status: () => [refreshFailed ? refreshFailure : undefined, focusState.notice, notice].filter(Boolean).join(' ') || undefined,
    filterOptions: query => {
      filtering = Boolean(query);
      const rows = navigation.project(query);
      return refreshFailed ? rows.map(row => ({ ...row, disabled: true,
        focusable: isFocusable(row), note: 'unverified' })) : rows;
    },
    footer: '↑↓ browse · Tab: navigation/content · ←→: parent/content · Enter: inspect or activate · Esc: back',
    async load(): Promise<readonly Option[]> {
      refreshFailed = true;
      inspectionAdmission = undefined;
      details.clear(); detailRecords.clear(); actions.clear(); inspections.clear(); assignments.clear();
      refreshModelCatalog(context);
      let choice: ReturnType<typeof captureModelChoice> | undefined;
      try { choice = captureModelChoice(context); } catch { /* Read-only discovery still works without a saved session. */ }
      const admitInspection = () => {
        if (context.signal?.aborted) return 'Model inspection cancelled. Reopen the model picker.';
        const refusal = choice?.admission() ?? context.admission?.();
        return context.signal?.aborted ? 'Model inspection cancelled. Reopen the model picker.' : refusal;
      };
      inspectionAdmission = admitInspection;
      const publication = context.readConfiguration?.();
      observedRevision = publication?.revision;
      const config = choice?.config ?? publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
      const catalog = choice?.catalog ?? publication?.catalog ?? loadCatalog();
      const active = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
      const activeAddress = catalogBaseUrl(catalog, active.provider, active.baseUrl ?? active.credential?.baseUrl);
      const availability = availabilitySnapshot({ config, catalog });
      const thinkingEffort = assigning ? assigning.thinkingEffort
        : captureThinkingPreference(context.projectRoot ?? context.cwd, active.thinkingEffort).thinkingEffort;
      const rows: Option[] = [];
      const groups = new Map<string, NavigationGroup>();
      const seen = new Set<string>();
      const ordered = [...catalog];
      for (const provider of ordered) {
        const entry = availability.providers.find(item => item.provider === provider.runtime);
        const connections = (entry?.connections ?? []).filter(connection => matchesCatalog(provider, connection, config.providerConnections, catalog));
        const providerSlot = active.provider === provider.runtime && !active.credential?.connectionId
          && (provider.id === provider.runtime || Boolean(activeAddress && provider.baseUrl
            && activeAddress.replace(/\/+$/, '') === provider.baseUrl.replace(/\/+$/, '')));
        for (const connection of providerSlot ? [...connections, undefined] : connections.length ? connections : [undefined]) {
          if (!provider.models.length) {
            const id = rowId(connection?.connectionId, provider.id, '');
            groups.set(id, { category: provider.id });
            rows.push({ id, label: provider.label, detail: connection?.label ?? connection?.connectionId,
              note: 'no models listed', disabled: true });
            details.set(id, modelDetails(provider, connection));
          }
          for (const model of provider.models) {
            const id = rowId(connection?.connectionId, provider.id, model.id);
            groups.set(id, { category: provider.id });
            if (seen.has(id)) continue;
            seen.add(id);
            const target: SessionModelTarget = connection ? { connectionId: connection.connectionId, provider: connection.provider, model: model.id, thinkingEffort }
              : { connectionScope: 'provider', provider: provider.runtime, model: model.id, thinkingEffort };
            const candidate = connection || providerSlot ? projectModelSelection(config, scopedModelTarget(target)) : undefined;
            const resolution = candidate ? !connection && context.resolveConfigTarget ? context.resolveConfigTarget(candidate)
              : resolveProviderCredential({ runtimeConfig: candidate }) : undefined;
            const ambientCandidate = !connection && !providerSlot && provider.id === provider.runtime
              ? projectModelSelection(config, scopedModelTarget(target)) : undefined;
            const ambientResolution = ambientCandidate
              ? context.resolveConfigTarget?.(ambientCandidate) ?? resolveProviderCredential({ runtimeConfig: ambientCandidate }) : undefined;
            const namedConnectionRequired = Boolean(ambientResolution && !ambientResolution.blocked
              && ambientResolution.provider === provider.runtime && ambientResolution.credential
              && ambientResolution.credential.connectionId === undefined);
            const effectiveResolution = resolution ?? (namedConnectionRequired ? ambientResolution : undefined);
            const exact = candidate ? exactTargetMatches(context, candidate, target) : false;
            const ambiguous = catalogProvider(catalog, provider.runtime, effectiveResolution?.baseUrl).ambiguous;
            const capability = effortCapability(catalog, provider.runtime, model.id, thinkingEffort, effectiveResolution?.baseUrl);
            const assignedEffort = assigning && capability !== 'supported' ? null : thinkingEffort;
            const unsupported = !assigning && capability === 'unsupported';
            const modelAddress = effectiveResolution?.baseUrl
              ?? config.providerConnections.find(item => item.id === connection?.connectionId)?.baseUrl ?? provider.baseUrl;
            const alias = provider.id === provider.runtime ? catalog.find(candidate => candidate.runtime === provider.runtime
              && candidate.id !== provider.runtime && candidate.baseUrl !== undefined && modelAddress !== undefined
              && candidate.baseUrl.replace(/\/+$/, '') === modelAddress.replace(/\/+$/, '')) : undefined;
            const selected = Boolean(exact && !alias && !active.blocked && active.credential
              && connection?.connectionId === active.credential.connectionId && provider.runtime === active.provider && model.id === active.model
              && resolution?.baseUrl === active.baseUrl && sameValue(resolution?.credential, active.credential));
            const reason = namedConnectionRequired ? 'named connection required'
              : assigning && !connection ? 'role assignment requires a configured connection'
              : !connection && !providerSlot ? 'configure a connection' : connection && connection.state !== 'ready' ? availabilityLabel(connection.state)
              : resolution?.blocked || !resolution?.credential ? 'credential unavailable'
              : !exact ? 'request target mismatch'
              : ambiguous ? 'model catalogue endpoint is ambiguous'
              : unsupported ? 'reasoning effort unsupported' : !choice?.baseline ? 'active session required' : undefined;
            const metadata = listedModelMetadata(catalog, provider, model.id, modelAddress);
            rows.push({ id, label: model.id,
              detail: [connection?.connectionId ?? (effectiveResolution?.credential ? `${effectiveResolution.credential.source} credential` : undefined), connection?.label, provider.label, connection?.endpoint ?? endpointLabel(modelAddress),
                metadata?.contextWindow ? `${Math.round(metadata.contextWindow / 1000)}k` : undefined].filter(Boolean).join(' · '),
              note: selected ? 'active' : reason ?? (alias ? `alias: ${alias.label}` : connection ? availabilityLabel(connection.state) : 'ready'),
              ...(reason ? { disabled: true, focusable: true } : {}) });
            const displayed = connection?.state === 'ready' && (resolution?.blocked || !resolution?.credential)
              ? { ...connection, state: 'credential-missing' as const, reason: 'This explicit connection needs its own credential.' } : connection;
            const lines = [...modelDetails(provider, displayed, !connection ? effectiveResolution?.credential?.source : undefined),
              ...(!connection && (effectiveResolution?.baseUrl ?? provider.baseUrl) ? [`Endpoint: ${endpointLabel(effectiveResolution?.baseUrl ?? provider.baseUrl)}`] : []),
              `Reasoning effort: ${assignedEffort ?? 'auto'}`, ...modelMetadataDetails(catalog, provider, model.id, modelAddress), ...(reason ? [reason] : [])];
            details.set(id, lines);
            const inspection = () => modelDetailsPicker(detailSourceFor(id, model.id, id));
            const detailActions: ModelDetailAction[] = [];
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
                  try { refreshed = { ...assigning, assign: prepareModelRole(fresh, assigning.role).assign,
                    back: (note?: string) => assigning.back(note, fresh) }; }
                  catch { return assigning.back(status ?? 'Role settings could not be read. Reopen the model panel.', fresh); }
                }
                return modelPicker(fresh, connectionId ? rowId(connectionId, provider.id, model.id) : id, navigation, refreshed,
                  status, signIn, parent, origin);
              };
              const childBack = (returnTo: (notice?: string) => Picker, origin?: ModelDetailOrigin) =>
                (fresh: CommandContext, result?: string, connectionId?: string) =>
                  result === undefined && connectionId === undefined ? returnTo() : back(fresh, result, connectionId, origin);
              const captured = choice;
              if (reason === 'reasoning effort unsupported' && captured) {
                const resolution = targetResolutionIdentity(context, config, target);
                detailActions.push({ id: 'effort', label: 'Choose effort', run: (returnTo, inspect) => ({ next: modelEffortPicker({
                  target, current: thinkingEffort, catalog, baseUrl: modelAddress, lines, admission: admitInspection, back: inspect,
                  save: effort => setReviewedModelTarget({ ...target, thinkingEffort: effort }, { ...context, admission: admitInspection },
                    { baseline: captured.baseline, resolution }),
                  done: result => parent ? parent(result) : returnTo(result),
                }) }) });
              }
              if (account && signIn) detailActions.push({ id: 'account', label: 'Account sign-in',
                run: (returnTo, _inspect, origin) => ({ next: modelSignInPicker(context, provider.runtime, signIn, childBack(returnTo, origin)) }) });
              if (draft && signIn) detailActions.push({ id: 'configure', label: 'Configure connection',
                run: (returnTo, _inspect, origin) => ({ next: modelKeyPicker(context, provider.runtime,
                  { model: model.id, label: connection?.label ?? provider.id, baseUrl: safeEndpoint }, signIn,
                  childBack(returnTo, origin)) }) });
              else if (draft) detailActions.push({ id: 'configure', label: 'Configure connection',
                detail: 'Prepare a login command for this exact model.', run: () => ({ draft }) });
              inspections.set(id, inspection);
            }
            detailRecords.set(id, { identity: id, view: {
              label: model.id, lines, actions: detailActions, available: true, revision: observedRevision, admission: admitInspection,
            } });
            if (!reason && assigning && connection) {
              assignments.set(id, () => assigning.assign({ connectionId: connection.connectionId, provider: connection.provider, model: model.id, thinkingEffort: assignedEffort }));
            } else if (!reason && choice) {
              const captured = choice;
              const resolution = targetResolutionIdentity(context, config, target);
              actions.set(id, async () => captured.admission() ?? setReviewedModelTarget(target,
                { ...context, admission: captured.admission }, { baseline: captured.baseline, resolution }));
            }
          }
        }
      }
      // A protocol's credential cannot make a different relay category usable.
      // Derive category readiness from its exact, admitted model rows.
      const readyCategories = new Set(rows.filter(row => !row.disabled).map(row => groups.get(row.id)?.category));
      ordered.sort((left, right) => Number(!readyCategories.has(left.id)) - Number(!readyCategories.has(right.id)));
      rows.sort((left, right) => Number(!readyCategories.has(groups.get(left.id)?.category))
        - Number(!readyCategories.has(groups.get(right.id)?.category)));
      // Overrides and legacy credentials can supply a current request without a
      // matching named connection. Keep that fact visible without inventing one.
      const savedTarget = choice?.baseline?.selection;
      const currentModel = active.model ?? (active.blocked && savedTarget?.connectionScope === 'session' ? savedTarget.model : undefined);
      const currentProvider = !active.model && active.blocked && savedTarget?.connectionScope === 'session' ? savedTarget.provider : active.provider;
      const currentConnection = active.credential && !active.blocked ? active.credential.connectionId
        : active.selection?.connectionId ?? config.sessionConnection?.id
          ?? (active.selection?.credentialScope !== 'provider' ? config.activeProviderConnectionId : undefined);
      if (currentModel && !rows.some(row => row.note === 'active')) {
        const id = 'model:current';
        groups.set(id, { category: currentProvider });
        const endpoint = endpointLabel(active.baseUrl);
        const note = active.blocked ? 'request blocked' : active.credential ? 'active' : 'credential missing';
        const connection = config.providerConnections.find(item => item.id === currentConnection && item.provider === currentProvider);
        const exactCatalog = connection ? catalogProvider(catalog, currentProvider, connection.baseUrl) : undefined;
        const exactFacts = exactCatalog?.entry && !exactCatalog.ambiguous
          ? modelMetadataDetails(catalog, exactCatalog.entry, currentModel, connection!.baseUrl) : undefined;
        const targetId = exactCatalog?.entry && !exactCatalog.ambiguous ? rowId(connection!.id, exactCatalog.entry.id, currentModel) : undefined;
        // A report offers the existing exact-record inspection; labels and runtime
        // aliases cannot choose another relay, deleted record or pool member.
        const recovery = (!active.credential || active.blocked) && (!active.blocked || ['connection-pending', 'connection-unavailable'].includes(active.blocked))
          && targetId ? inspections.get(targetId) : undefined;
        rows.unshift({ id, label: currentModel, detail: [active.credential ? `${active.credential.source} credential` : 'Current request', currentProvider, currentConnection, endpoint].filter(Boolean).join(' · '),
          note, disabled: true, focusable: true });
        const lines = [`Provider: ${currentProvider}`, `Model: ${currentModel}`, `Status: ${note}`, `Reasoning effort: ${thinkingEffort ?? 'auto'}`,
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
          const selection = readSessionModel(context.sessionId);
          for (const role of ['default', 'subagent', 'summary', 'advisor'] as const) {
            const target = role === 'default' ? { provider: active.provider, model: active.model, connectionId: active.credential?.connectionId, thinkingEffort }
              : (selection?.roles ?? config.sessionModelRoles)?.[role];
            const id = `role:${role}`;
            rows.push({ id, label: role === 'default' ? 'Default' : role[0].toUpperCase() + role.slice(1),
              detail: target?.model ? `${target.provider}/${target.model}` : 'Uses default model', disabled: true, focusable: true });
            groups.set(id, { category: 'roles' });
            details.set(id, [`Role: ${role}`, target?.model ? `Model: ${target.provider}/${target.model}` : 'Model: follows the default',
              ...(target?.connectionId ? [`Connection: ${target.connectionId}`] : []),
              ...(role !== 'default' && target ? [`Reasoning effort: ${target.thinkingEffort ?? 'provider decides'}`] : []),
              'Role assignments and presets share the existing session model owner.']);
            if (role === 'default') {
              inspections.set(id, () => modelPicker(context, undefined, new CatalogNavigation(), undefined, undefined, signIn,
                note => modelPicker(context, id, navigation, undefined, note, signIn, parent)));
            } else {
              inspections.set(id, () => {
                const back = (note?: string, fresh = context) => modelPicker(fresh, id, navigation, undefined, note, signIn, parent);
                return modelRoleEditor(context, role,
                  (assign, thinkingEffort) => modelPicker(context, undefined, new CatalogNavigation(), { role, assign, back, thinkingEffort }, undefined, signIn), back);
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
              actions.set(allId, async () => {
                const admission = () => captured.admission() ?? (sameValue(resolveModelPreset(context.sessionId, name), resolved)
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
                actions.set(id, async () => {
                  const admission = () => captured.admission() ?? (sameValue(resolveModelPreset(context.sessionId, name), resolved)
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
      activeFocus = focus ?? rows.find(row => row.note === 'active')?.id;
      const projected = navigation.project('');
      const previousRows = focusFallback?.rows ?? projected;
      const crossCategory = focusFallback?.crossCategory === true;
      focusFallback = undefined;
      navigation.set(rows, groups, [...(assigning ? [] : [{ id: 'roles', label: 'Roles' }]), { id: 'all', label: 'All models' },
        ...ordered.map(provider => ({ id: provider.id, label: provider.label,
          note: readyCategories.has(provider.id) ? undefined : '○' }))]);
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
      if (refreshFailed) return navigation.all.some(row => row.id === id) ? { note: refreshFailure } : undefined;
      const refusal = inspectionAdmission?.();
      if (refusal) return { note: refusal };
      const next = inspections.get(id)?.(); return next ? { next } : undefined;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (!ids[0]) return undefined;
      if (refreshFailed) return { note: refreshFailure };
      const assignment = assignments.get(ids[0]);
      if (assignment && assigning) {
        const result = assignment();
        return { note: result.output, next: assigning.back(result.output) };
      }
      const action = actions.get(ids[0]);
      const note = action ? await action() : 'Model selection unavailable. Reopen the picker in an active session.';
      return { note, ...(parent ? { next: parent(note) } : {}) };
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
    back: (origin, detailNotice) => modelPicker(context, id, navigation, assigning, detailNotice, signIn, parent, origin),
    ...(context.readConfiguration ? {
      watch: (load, publish, observed, onFailure) => watchModels(context, load, publish, observed, onFailure),
    } : {}),
  });
  return picker;
}

function rowId(connection: string | undefined, provider: string, model: string): string {
  return `model:${JSON.stringify([connection ?? null, provider, model])}`;
}

function modelDetails(provider: CatalogProvider, connection?: ConnectionAvailability, source?: string): readonly string[] {
  return [`Provider: ${provider.label} (${provider.runtime})`,
    ...(connection ? [`Connection: ${connection.connectionId}`, ...(connection.label ? [`Label: ${connection.label}`] : []), ...(connection.endpoint ? [`Endpoint: ${connection.endpoint}`] : []),
      `Availability: ${availabilityLabel(connection.state)}`, connection.reason] : source ? [`Credential source: ${source}`] : ['Availability: configure a connection']),
    'Remote availability: unverified'];
}

/** Canonical provider models work through relays; a relay-specific catalogue must match its address. */
function matchesCatalog(provider: CatalogProvider, connection: ConnectionAvailability,
  connections: readonly { readonly id: string; readonly baseUrl?: string }[], catalog: readonly CatalogProvider[]): boolean {
  if (provider.id === provider.runtime) return true;
  const baseUrl = catalogBaseUrl(catalog, provider.runtime, connections.find(item => item.id === connection.connectionId)?.baseUrl);
  return Boolean(baseUrl && provider.baseUrl && baseUrl.replace(/\/+$/, '') === provider.baseUrl.replace(/\/+$/, ''));
}
