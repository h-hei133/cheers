import { argumentIssue, nameIssue, reviewDefinition, valueIssue, type McpAddDefinition } from './mcp/definition.js';
import type { Picker } from '../overlay.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';

type Scope = 'user' | 'project';
export type { McpAddDefinition } from './mcp/definition.js';
export type McpAddServer = (scope: Scope, name: string, definition: McpAddDefinition) => Promise<string | undefined>;

/** Definition steps never connect; the final choice enters the existing publication approval. */
export function mcpAddWizard(add: McpAddServer, admission?: () => string | undefined): Picker {
  const current = () => { try { return !admission?.(); } catch { return false; } };
  const choice = (title: string, stage: number, options: readonly Option[], next: (id: string) => Picker): Picker => {
    let offered = false, used = false;
    return { title, form: 'panel', empty: 'No choices', filterable: false, exclusive: true, isCurrent: current,
      footer: `Step ${stage} · Choose one value. Esc cancels without saving.`,
      load: async () => { offered = true; return options; }, previewEnd: () => { used = true; },
      apply: async ids => {
        if (!current() || !offered || used || ids.length !== 1 || !options.some(option => option.id === ids[0])) return undefined;
        used = true; return { next: next(ids[0]!) };
      } };
  };
  const input = (title: string, stage: number, label: string, initial: string, validate: (text: string) => string | undefined,
    next: (text: string) => Picker): Picker => {
    let offered = false, used = false;
    return { title: `${title} — Step ${stage}`, form: 'panel', empty: '', holdInput: true, exclusive: true, isCurrent: current,
      footer: `Step ${stage} · Enter continues. Esc cancels without saving.`,
      load: async () => { offered = true; return []; }, apply: async () => undefined, previewEnd: () => { used = true; },
      input: { initial, label, validate, apply: async text => {
        if (!current() || !offered || used || validate(text)) return undefined;
        used = true; return { next: next(text) };
      } } };
  };
  const confirm = (scope: Scope, name: string, definition: McpAddDefinition): Picker => {
    let offered = false, used = false;
    const review = reviewDefinition(definition);
    return { title: 'Confirm MCP definition', form: 'panel', empty: '', filterable: false, exclusive: true,
      initialSelection: 'cancel', footer: 'Review · Continue requests ordinary approval. Saving does not connect or test a server.',
      load: async () => { offered = true; return [{ id: 'cancel', label: 'Cancel' },
        { id: 'add', label: `Review adding ${name}`, note: scope, detail: review }]; },
      detail: () => [name, `Scope: ${scope}`, ...review.split('\n'), 'Connection: not tested'],
      previewEnd: () => { used = true; },
      apply: async ids => {
        if (!offered || used || ids.length !== 1 || !['cancel', 'add'].includes(ids[0]!)) return undefined;
        used = true; if (ids[0] === 'cancel' || !current()) return undefined;
        const note = await add(scope, name, definition);
        return note && current() ? { note } : undefined;
      } };
  };
  const argumentsStep = (scope: Scope, name: string, command: string): Picker => input('Server arguments', 5,
    'JSON string array, for example ["--path", "a folder"]', '[]', text => argumentIssue(command, text),
    text => confirm(scope, name, { command, args: JSON.parse(text) }));
  const transportStep = (scope: Scope, name: string): Picker => choice('Transport', 3, [
    { id: 'stdio', label: 'stdio', detail: 'Configure a local executable and separate arguments' },
    { id: 'http', label: 'http', detail: 'Configure an HTTPS or loopback HTTP URL' },
  ], selected => input(selected === 'http' ? 'Server URL' : 'Server executable', 4,
    selected === 'http' ? 'https://host/path' : 'Executable or path only; arguments follow', '',
    text => valueIssue(selected, text),
    text => selected === 'http' ? confirm(scope, name, { url: text.trim() }) : argumentsStep(scope, name, text.trim())));

  return choice('Scope', 1, [
    { id: 'user', label: 'User', detail: 'Available in every project' },
    { id: 'project', label: 'Project', detail: 'This workspace only' },
  ], scope => input('Server name', 2, 'name', '', nameIssue,
    text => transportStep(scope as Scope, text.trim())));
}
