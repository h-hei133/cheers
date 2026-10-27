import { promptTokenAt } from '../../../core/prompts/tokens.js';
import { scanCommandArgs } from '../../../core/commands/arguments.js';
import { getSlashInvocation, listSlashInvocations, type SlashCatalogScope } from '../../../entrypoints/slashCommandRegistry.js';
import { quoteCompletion } from '../completion.js';
import type { DraftSnapshot } from '../../../presentation/tui/editor/replacement.js';
import type { Suggestion } from '../../../presentation/tui/chrome/suggestions.js';
import { pathDirectory, pathTargetExists } from './paths.js';

export function proseRequest(snapshot: DraftSnapshot, scope?: SlashCatalogScope) {
  const source = promptTokenAt(snapshot.text, snapshot.cursor);
  const quoteContentEnd = source?.quote ? source.quote.to - (source.quote.closed ? 1 : 0) : undefined;
  const quote = source?.quote !== undefined && quoteContentEnd !== undefined
    && snapshot.cursor > source.quote.from && snapshot.cursor <= quoteContentEnd ? source.quote : undefined;
  const tokenFrom = quote?.from ?? source?.from ?? snapshot.cursor;
  const prefix = source ? snapshot.text.slice(tokenFrom, snapshot.cursor) : '';
  const quotedBody = quote && quoteContentEnd !== undefined ? snapshot.text.slice(quote.from + 1,
    Math.min(snapshot.cursor, Math.max(quote.from + 1, quoteContentEnd))) : undefined;
  const quoted = source?.literal === 'quote';
  const candidate = quotedBody ?? prefix;
  const windows = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/.test(candidate);
  if (!source || source.literal === 'code' || source.literal === 'escape' && !windows) return undefined;
  if (quoted && quotedBody === undefined) return undefined;
  // Raw Windows separators remain literal. Our double-quoted insertions
  // double the drive/UNC backslashes and must round-trip through the scanner.
  const rawWindows = windows && (!quote || prefix.startsWith("'") ||
    /^(?:[A-Za-z]:\\(?!\\)|\\{2}(?!\\))/.test(candidate));
  const value = rawWindows ? candidate : scanCommandArgs(prefix, true)[0]?.value ?? '';
  if (quoted && !pathLike(value)) return undefined;
  if (!pathLike(value)) return undefined;
  const pathExists = tokenFrom === 0 && value.length > 1 &&
    pathTargetExists(scope?.root ?? process.cwd(), value);
  const opening = /^\/([^\s/]+)(?:\s|$)/.exec(snapshot.text)?.[1];
  const openingInvocation = opening ? getSlashInvocation(opening, scope) : undefined;
  if (opening && openingInvocation && !openingInvocation.composition && !opening.startsWith('skill:') && !pathExists) return undefined;
  const explicitSkill = !quoted && value.startsWith('/skill:');
  // Offset zero command names belong to the synchronous slash menu.
  if (tokenFrom === 0 && !explicitSkill && /^\/[A-Za-z0-9:._?-]*$/.test(prefix) &&
    listSlashInvocations(scope, {
      templates: { namePrefix: prefix.slice(1).toLowerCase() },
    }).some(item => item.invocation.startsWith(prefix)) && !pathExists) return undefined;
  const kind = !quoted && /^\/[A-Za-z0-9:._?-]*$/.test(value)
    ? 'prose' as const : 'path' as const;
  return { kind, token: { from: tokenFrom, to: quote?.to ?? source.to, prefix, value, before: [] }, snapshot,
    fixed: [] as Suggestion[], query: pathDirectory(value), scope };
}

/** Bare prose requires a skill name segment prefix; paths never lose to fuzzy descriptions. */
export function proseSuggestions(request: { readonly kind: string; readonly snapshot: DraftSnapshot; readonly scope?: SlashCatalogScope;
  readonly token: { readonly from: number; readonly to: number; readonly prefix: string; readonly value: string } }, items: readonly Suggestion[]): Suggestion[] {
  const value = request.token.value.toLowerCase();
  const explicit = value.startsWith('/skill:');
  const bare = value.slice(1);
  const invocations = request.kind === 'prose' ? listSlashInvocations(request.scope, {
    templates: { namePrefix: value.slice(1) },
  }) : [];
  const commands: Suggestion[] = invocations
    .filter(item => item.kind !== 'alias' && (request.token.from === 0 || item.composition))
    .map(item => ({ value: item.invocation, label: item.invocation, kind: 'command', identity: item.name, detail: item.summary }));
  const commandPrefix = request.token.from === 0 &&
    invocations.some(item => item.invocation.toLowerCase().startsWith(value));
  const ordered = request.token.from === 0 ? [...commands, ...items] : [...items, ...commands];
  return ordered.filter(item => {
    if (item.kind === 'command') return item.value.toLowerCase().startsWith(value);
    if (item.kind !== 'skill') return item.value.toLowerCase().startsWith(value);
    const name = item.value.slice('/skill:'.length).toLowerCase();
    return explicit ? name.includes(value.slice('/skill:'.length)) || (item.detail ?? '').toLowerCase().includes(value.slice('/skill:'.length))
      : 'skill:'.startsWith(bare) || name.split('-').some(segment => segment.startsWith(bare));
  }).slice(0, 100).map(item => {
    const singleComponentAbsolute = item.value.startsWith('/') && !item.value.slice(1).includes('/');
    const directory = item.kind === 'path' && item.value.endsWith('/');
    const pathCollision = item.kind === 'path' && !directory &&
      (request.token.from === 0 ? commandPrefix || singleComponentAbsolute
        : item.value.startsWith('/') && (item.value.startsWith('/skill:') ||
          getSlashInvocation(item.value.slice(1), request.scope) !== undefined));
    const text = item.kind === 'skill' ? item.value
      : pathCollision ? quoteCompletion(item.value, '"')
      : quoteCompletion(item.value, request.token.prefix);
    const insertion = text + (!directory && request.token.to === request.snapshot.text.length ? ' ' : '');
    return { ...item, edit: { snapshot: request.snapshot, from: request.token.from, to: request.token.to, text: insertion,
      ...(directory ? { cursorOffset: text.length - (/['"]$/.test(text) ? 1 : 0) } : {}) } };
  });
}

function pathLike(value: string): boolean {
  return /^(?:\/|~\/|\.\.?\/|[A-Za-z]:[\\/]|\\\\|\/\/)/.test(value);
}
