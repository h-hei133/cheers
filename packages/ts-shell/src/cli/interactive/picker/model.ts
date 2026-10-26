import { projectModelSelection, projectSessionModel } from "../../../session/model/projection.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { availabilityLabel, availabilitySnapshot, endpointLabel, type ConnectionAvailability } from "../../../core/models/availability.js";
import { catalogBaseUrl, catalogModel, catalogProvider, type CatalogProvider } from "../../../core/models/catalog.js";
import { effortCapability } from "../../../core/models/capability.js";
import { resolveProviderCredential } from "../../../core/shell/providerCredentials.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { applyModelPreset, resolveModelPreset, wholePresetFailure } from "../../../core/commands/model/preset.js";
import { readProfilePresets } from "../../../core/commands/model/presetStore.js";
import { readSessionModel } from "../../../session/model/state.js";
import type { SessionModelRole, SessionModelTarget } from "../../../session/model/contract.js";
import { scopedModelTarget } from "../../../core/commands/model/target.js";
import { captureModelChoice } from "../../../core/commands/model/choice.js";
import { setModelTarget } from "../../../core/commands/model/selection.js";
import { captureThinkingPreference } from "../../../core/models/preference.js";
import { sameValue } from "../../../config/values.js";
import { connectionDraft, connectionEndpoint } from './connections.js';
import { modelDetailsPicker } from './model/details.js';
import { CatalogNavigation, type NavigationGroup } from './navigation.js';
import { watchModels } from './model/watch.js';
import { prepareModelRole, type AutomaticModelRole, type RoleResult } from '../../../core/commands/model/role.js';
import { modelRoleEditor } from './model/role.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';
import { modelAccountSignIn, modelSignInPicker, modelSignInStatus, type ModelSignIn } from './model/auth.js';
import { modelKeyPicker } from './model/key.js';

interface RoleSelection {
  readonly role: AutomaticModelRole;
  readonly assign: (target: SessionModelRole) => RoleResult;
  readonly back: (notice?: string, context?: CommandContext) => Picker;
  readonly thinkingEffort: ThinkingPreference;
}

/** Every actionable row retains its exact target and the inputs used to display it. */
export function modelPicker(context: CommandContext, focus?: string, navigation = new CatalogNavigation(), assigning?: RoleSelection,
  notice?: string, signIn?: ModelSignIn, parent?: (notice?: string) => Picker): Picker {
  const details = new Map<string, readonly string[]>();
  const actions = new Map<string, () => Promise<string>>();
  const inspections = new Map<string, () => Picker>();
  const assignments = new Map<string, () => RoleResult>();
  let activeFocus = focus;
  let returnFocus = focus;
  const picker: Picker = {
    title: assigning ? `${assigning.role} model` : "Model",
    form: "panel",
    empty: "No providers in the catalogue.",
    navigation, fullScreen: true,
    ...(assigning ? { back: assigning.back } : parent ? { back: () => parent(notice) } : {}),
    onOpen() { returnFocus = focus; },
    get initialSelection() { return activeFocus; },
    ...(notice ? { status: () => notice } : {}),
    filterOptions: query => navigation.project(query),
    footer: '↑↓ browse · Tab: navigation/content · ←→: parent/content · Enter: inspect or activate · Esc: back',
    async load(): Promise<readonly Option[]> {
      details.clear(); actions.clear(); inspections.clear(); assignments.clear();
      let choice: ReturnType<typeof captureModelChoice> | undefined;
      try { choice = captureModelChoice(context); } catch { /* Read-only discovery still works without a saved session. */ }
      const publication = context.readConfiguration?.();
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
      const ordered = [...catalog].sort((left, right) => Number(!availability.providers.some(item => item.provider === left.runtime && item.state === 'ready'))
        - Number(!availability.providers.some(item => item.provider === right.runtime && item.state === 'ready')));
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
            const ambiguous = catalogProvider(catalog, provider.runtime, resolution?.baseUrl).ambiguous;
            const capability = effortCapability(catalog, provider.runtime, model.id, thinkingEffort, resolution?.baseUrl);
            const assignedEffort = assigning && capability !== 'supported' ? null : thinkingEffort;
            const unsupported = !assigning && capability === 'unsupported';
            const selected = Boolean(!active.blocked && active.credential
              && connection?.connectionId === active.credential.connectionId && provider.runtime === active.provider && model.id === active.model
              && resolution?.baseUrl === active.baseUrl && sameValue(resolution?.credential, active.credential));
            const reason = assigning && !connection ? 'role assignment requires a configured connection'
              : !connection && !providerSlot ? 'configure a connection' : connection && connection.state !== 'ready' ? availabilityLabel(connection.state)
              : resolution?.blocked || !resolution?.credential ? 'credential unavailable'
              : ambiguous ? 'model catalogue endpoint is ambiguous'
              : unsupported ? 'reasoning effort unsupported' : !choice?.baseline ? 'active session required' : undefined;
            const metadata = catalogModel(catalog, provider.runtime, model.id, catalogBaseUrl(catalog, provider.runtime, resolution?.baseUrl));
            rows.push({ id, label: model.id,
              detail: [connection?.connectionId ?? (resolution?.credential ? `${resolution.credential.source} credential` : undefined), connection?.label, provider.label, connection?.endpoint ?? endpointLabel(resolution?.baseUrl),
                metadata?.contextWindow ? `${Math.round(metadata.contextWindow / 1000)}k` : undefined].filter(Boolean).join(' · '),
              note: selected ? 'active' : reason ?? (connection ? availabilityLabel(connection.state) : 'ready'),
              ...(reason ? { disabled: true, focusable: true } : {}) });
            const displayed = connection?.state === 'ready' && (resolution?.blocked || !resolution?.credential)
              ? { ...connection, state: 'credential-missing' as const, reason: 'This explicit connection needs its own credential.' } : connection;
            details.set(id, [...modelDetails(provider, displayed, !connection ? resolution?.credential?.source : undefined),
              ...(!connection && resolution?.baseUrl ? [`Endpoint: ${endpointLabel(resolution.baseUrl)}`] : []), `Reasoning effort: ${assignedEffort ?? 'auto'}`,
              ...(metadata?.contextWindow ? [`Context: ${metadata.contextWindow} tokens`] : []), ...(reason ? [reason] : [])]);
            if (reason) {
              const endpoint = config.providerConnections.find(item => item.id === connection?.connectionId)?.baseUrl ?? provider.baseUrl;
              const safeEndpoint = connectionEndpoint(endpoint);
              const canConfigure = !connection && !providerSlot || reason === 'credential unavailable'
                || Boolean(connection && ['credential-missing', 'pending', 'error'].includes(connection.state));
              const draft = canConfigure && (!endpoint || safeEndpoint) && (provider.id === provider.runtime || safeEndpoint)
                ? connectionDraft(provider, model.id, endpoint, connection?.label ?? provider.id) : undefined;
              const account = signIn && canConfigure && modelAccountSignIn(provider, model.id, endpoint);
              const back = (fresh: CommandContext, result?: string, connectionId?: string) => {
                const refreshed = assigning ? { ...assigning, assign: prepareModelRole(fresh, assigning.role).assign,
                  back: (note?: string) => assigning.back(note, fresh) } : undefined;
                return modelPicker(fresh, connectionId ? rowId(connectionId, provider.id, model.id) : id, navigation, refreshed,
                  result ? modelSignInStatus(result) : undefined, signIn, parent);
              };
              inspections.set(id, () => modelDetailsPicker(model.id, details.get(id) ?? [],
                () => modelPicker(context, id, navigation, assigning, undefined, signIn, parent), draft,
                account ? () => modelSignInPicker(context, provider.runtime, signIn, back) : undefined,
                draft && signIn ? () => modelKeyPicker(context, provider.runtime,
                  { model: model.id, label: connection?.label ?? provider.id, baseUrl: safeEndpoint }, signIn, back) : undefined));
            }
            if (!reason && assigning && connection) {
              assignments.set(id, () => assigning.assign({ connectionId: connection.connectionId, provider: connection.provider, model: model.id, thinkingEffort: assignedEffort }));
            } else if (!reason && choice) {
              const captured = choice;
              actions.set(id, async () => captured.admission() ?? setModelTarget(target,
                { ...context, admission: captured.admission }, captured.baseline));
            }
          }
        }
      }
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
        const targetId = exactCatalog?.entry && !exactCatalog.ambiguous ? rowId(connection!.id, exactCatalog.entry.id, currentModel) : undefined;
        // A report offers the existing exact-record inspection; labels and runtime
        // aliases cannot choose another relay, deleted record or pool member.
        const recovery = (!active.credential || active.blocked) && (!active.blocked || ['connection-pending', 'connection-unavailable'].includes(active.blocked))
          && targetId ? inspections.get(targetId) : undefined;
        rows.unshift({ id, label: currentModel, detail: [active.credential ? `${active.credential.source} credential` : 'Current request', currentProvider, currentConnection, endpoint].filter(Boolean).join(' · '),
          note, disabled: true, focusable: true });
        details.set(id, [`Provider: ${currentProvider}`, `Model: ${currentModel}`, `Status: ${note}`, `Reasoning effort: ${thinkingEffort ?? 'auto'}`,
          ...(currentConnection ? [`Selected connection: ${currentConnection}`] : []),
          ...(active.credential ? [`Credential source: ${active.credential.source}`] : []), ...(endpoint ? [`Endpoint: ${endpoint}`] : []),
          ...(active.blocked ? [`Request blocker: ${active.blocked}`] : []),
          'Remote availability: unverified']);
        inspections.set(id, () => modelDetailsPicker(currentModel, details.get(id) ?? [],
          () => modelPicker(context, id, navigation, assigning, undefined, signIn, parent), undefined, undefined, undefined,
          recovery ? () => {
            const refusal = choice?.admission() ?? context.admission?.();
            return refusal ? { note: refusal } : { next: recovery() };
          } : undefined));
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
      navigation.set(rows, groups, [...(assigning ? [] : [{ id: 'roles', label: 'Roles' }]), { id: 'all', label: 'All models' },
        ...ordered.map(provider => ({ id: provider.id, label: provider.label,
          note: availability.providers.find(item => item.provider === provider.runtime)?.state === 'ready' ? undefined : '○' }))]);
      if (returnFocus) { navigation.point(returnFocus, ''); returnFocus = undefined; }
      return rows;
    },
    detail: id => (id ? details.get(id) ?? [] : []),
    subscribe: publish => watchModels(context, () => picker.load(), publish),
    async inspect(id) { const next = inspections.get(id)?.(); return next ? { next } : undefined; },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (!ids[0]) return undefined;
      const assignment = assignments.get(ids[0]);
      if (assignment && assigning) {
        const result = assignment();
        return { note: result.output, ...(result.saved ? { next: assigning.back(result.output) } : {}) };
      }
      const action = actions.get(ids[0]);
      const note = action ? await action() : 'Model selection unavailable. Reopen the picker in an active session.';
      return { note, ...(parent ? { next: parent(note) } : {}) };
    },
  };
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
