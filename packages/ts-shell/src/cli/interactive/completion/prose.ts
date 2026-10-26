import { promptTokenAt } from '../../../core/prompts/tokens.js';
import { scanCommandArgs } from '../../../core/commands/arguments.js';
import { getSlashInvocation, listSlashInvocations, type SlashCatalogScope } from '../../../entrypoints/slashCommandRegistry.js';
import { quoteCompletion } from '../completion.js';
import type { DraftSnapshot } from '../../../presentation/tui/editor/replacement.js';
import type { Suggestion } from '../../../presentation/tui/chrome/suggestions.js';
import { pathDirectory } from './paths.js';

export function proseRequest(snapshot: DraftSnapshot, scope?: SlashCatalogScope) {
  const source = promptTokenAt(snapshot.text, snapshot.cursor);
  const windows = source && /^[A-Za-z]:\\/.test(source.raw);
  if (!source || source.literal && source.literal !== 'quote' && !(windows && source.literal === 'escape')) return undefined;
  const opening = /^\/([^\s/]+)(?:\s|$)/.exec(snapshot.text)?.[1];
  const openingInvocation = opening ? getSlashInvocation(opening, scope) : undefined;
  if (opening && openingInvocation && !openingInvocation.composition && !opening.startsWith('skill:')) return undefined;
  const prefix = snapshot.text.slice(source.from, snapshot.cursor);
  const value = windows ? prefix : scanCommandArgs(prefix, true)[0]?.value ?? '';
  const quoted = source.literal === 'quote';
  if (quoted && /^\/skill:/.test(value)) return undefined;
  if (quoted && !/^["'](?:\/|~\/|\.\.?\/)/.test(prefix)) return undefined;
  if (!/^(?:\/|~\/|\.\.?\/|[A-Za-z]:[\\/])/.test(value)) return undefined;
  const explicitSkill = !quoted && value.startsWith('/skill:');
  // Offset zero command names belong to the synchronous slash menu.
  if (source.from === 0 && !explicitSkill && /^\/[A-Za-z0-9:._?-]*$/.test(prefix) &&
    listSlashInvocations(scope, {
      templates: { namePrefix: prefix.slice(1).toLowerCase() },
    }).some(item => item.kind !== 'alias' && item.invocation.startsWith(prefix))) return undefined;
  const kind = explicitSkill ? 'inline-skill' as const : !quoted && /^\/[A-Za-z0-9:._?-]*$/.test(value)
    ? 'prose' as const : 'path' as const;
  return { kind, token: { from: source.from, to: source.to, prefix, value, before: [] }, snapshot,
    fixed: [] as Suggestion[], query: explicitSkill ? undefined : pathDirectory(value), scope };
}

/** Bare prose requires a skill name segment prefix; paths never lose to fuzzy descriptions. */
export function proseSuggestions(request: { readonly kind: string; readonly snapshot: DraftSnapshot; readonly scope?: SlashCatalogScope;
  readonly token: { readonly from: number; readonly to: number; readonly prefix: string; readonly value: string } }, items: readonly Suggestion[]): Suggestion[] {
  const value = request.token.value.toLowerCase();
  const explicit = value.startsWith('/skill:');
  const bare = value.slice(1);
  const commands: Suggestion[] = request.kind === 'prose' ? listSlashInvocations(request.scope, {
    templates: { namePrefix: value.slice(1) },
  }).filter(item => item.kind !== 'alias' && item.composition)
    .map(item => ({ value: item.invocation, label: item.invocation, kind: 'command', identity: item.name, detail: item.summary })) : [];
  return [...items, ...commands].filter(item => {
    if (item.kind === 'command') return item.value.toLowerCase().startsWith(value);
    if (item.kind !== 'skill') return item.value.toLowerCase().startsWith(value);
    const name = item.value.slice('/skill:'.length).toLowerCase();
    return explicit ? name.includes(value.slice('/skill:'.length)) || (item.detail ?? '').toLowerCase().includes(value.slice('/skill:'.length))
      : 'skill:'.startsWith(bare) || name.split('-').some(segment => segment.startsWith(bare));
  }).slice(0, 100).map(item => {
    const text = item.kind === 'skill' ? item.value : quoteCompletion(item.value, request.token.prefix);
    const directory = item.kind === 'path' && item.value.endsWith('/');
    const insertion = text + (!directory && request.token.to === request.snapshot.text.length ? ' ' : '');
    return { ...item, edit: { snapshot: request.snapshot, from: request.token.from, to: request.token.to, text: insertion,
      ...(directory ? { cursorOffset: text.length - (/['"]$/.test(text) ? 1 : 0) } : {}) } };
  });
}
