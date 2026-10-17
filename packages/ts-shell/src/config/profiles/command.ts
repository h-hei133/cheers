import { currentProfile, assertProfileIdentity } from '../../core/paths/profile/context.js';
import type { CommandContext, LocalCommandResult } from '../../core/commands/types.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { profileSyntax } from '../../core/commands/profile/syntax.js';
import { createProfile, listProfiles, openProfile } from './context.js';
import { IMPORT_CATEGORIES, IMPORT_EXCLUSIONS, type ImportPlan } from './import/model.js';
import { importRequest, planImport } from './import/plan.js';
import { applyImport, recoverImport, type ImportOutcome } from './import/runtime.js';
import { readJournal } from './import/journal.js';

function preview(plan: ImportPlan): string {
  const active = plan.request.excludedSessionId ? '\nThe active source conversation is excluded because this preview appends to it. Import it from another profile after it becomes inactive.' : '';
  return `Profile import preview: ${plan.files.length} files, ${plan.bytes} bytes.\n${IMPORT_EXCLUSIONS}${active}\nConfirm digest: ${plan.digest}\nApplied data becomes available to new operations or a new target process; this preview changed no target storage.`;
}
function outcome(result: ImportOutcome): string {
  return result.status === 'complete' ? `Profile import stored and read back: ${result.operation}. The active runtime was not reloaded.`
    : `Profile import ${result.status}: ${result.reason} Operation: ${result.operation}`;
}

export async function runProfileCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const local = (output: string): LocalCommandResult => ({ kind: 'local', output });
  const parsed = parseSyntax(profileSyntax, args);
  if (!parsed.ok) return local(`${parsed.reason}\n${syntaxHelp(profileSyntax)}`);
  const owner = currentProfile();
  if (!owner) return local('Profile management unavailable: no captured process profile.');
  const admit = () => { assertProfileIdentity(owner); return context.signal?.aborted ? 'Cancelled.' : context.admission?.(); };
  try {
    if (admit()) return local('Profile operation was not admitted.');
    const action = parsed.action.name;
    if (action === 'status') return local(`Active profile: ${owner.id}. Switching requires a fresh process.`);
    if (action === 'list') return local(listProfiles(owner).map(item => `${item.name}${item.name === owner.id ? ' (active)' : ''}${item.available ? '' : ' (unavailable)'}`).join('\n'));
    if (action === 'create') {
      const result = createProfile(parsed.args[0]!, owner);
      return local(`Profile ${result.profile.id}: ${result.created ? 'created' : 'already exists'}. Active profile: ${owner.id}.`);
    }
    const confirmation = parsed.flags.get('confirm') as string | undefined;
    if (action === 'switch') {
      if (!context.profileSwitch) return local('Profile switch unavailable in this host.');
      const result = await context.profileSwitch.request({ target: parsed.args[0]!, confirmation, sessionId: context.sessionId, signal: context.signal });
      if (result.status === 'preview') return local(`Profile switch preview: ${owner.id} → ${result.target}.\nConfirm digest: ${result.digest}\nThe current surface must close and resources must drain before a fresh process can start.`);
      return local(result.status === 'requested' ? `Profile switch requested: ${result.operation}. Target startup is not yet verified.` : `Profile switch unavailable: ${result.reason}`);
    }
    const target = openProfile(parsed.flags.get('target') as string | undefined ?? owner.id, owner.homeDir);
    if (action === 'recover') {
      const operation = parsed.args[0]!;
      if (!readJournal(target.root, operation)) return local(context.profileSwitch?.inspect(operation) ?? 'No import operation exists in this target.');
      const result = recoverImport(target, operation, confirmation, admit);
      return local(result.status === 'preview' ? `Retained import state: ${result.previous}.\n${preview(result.plan)}` : outcome(result));
    }
    const categories = IMPORT_CATEGORIES.filter(category => parsed.flags.has(category));
    const source = openProfile(parsed.args[0]!, owner.homeDir);
    const excludedSessionId = source.root === owner.root && source.rootIdentity === owner.rootIdentity ? context.sessionId : undefined;
    const plan = planImport(importRequest({ source: source.id, target: target.id, homeDir: owner.homeDir, workspace: context.projectRoot ?? context.cwd, categories, excludedSessionId }));
    return local(confirmation === undefined ? preview(plan) : outcome(applyImport(plan, confirmation, admit)));
  } catch {
    return local('Profile operation could not be verified. Check the name, retained operation, source revisions and storage identities; no success is claimed.');
  }
}
