import type { Picker } from '../overlay.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';

type Scope = 'user' | 'project';
type Transport = 'stdio' | 'http';

export type McpAddDefinition = { readonly command: string; readonly args: readonly string[] } | { readonly url: string };
export type McpAddServer = (scope: Scope, name: string, definition: McpAddDefinition) => Promise<string | undefined>;

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const plain = (text: string) => !/[\x00-\x1f\x7f]/.test(text);

/** A three-step definition wizard; nothing is written until the final confirm. */
export function mcpAddWizard(add: McpAddServer): Picker {
  const choice = (title: string, options: readonly Option[], next: (id: string) => Picker): Picker => ({
    title, form: 'panel', empty: 'No choices', filterable: false,
    load: async () => options,
    apply: async ids => { const id = ids[0]; return id && options.some(option => option.id === id) ? { next: next(id) } : undefined; },
  });
  const input = (title: string, label: string, initial: string, validate: (text: string) => string | undefined,
    next: (text: string) => Picker): Picker => ({
    title, form: 'panel', empty: '', holdInput: true, exclusive: true,
    load: async () => [], apply: async () => undefined,
    input: { initial, label, validate, apply: async text => ({ next: next(text) }) },
  });
  const confirm = (scope: Scope, transport: Transport, name: string, value: string): Picker => ({
    title: 'Add MCP server',
    form: 'panel', empty: '',
    load: async (): Promise<readonly Option[]> => [{ id: 'add', label: `Add ${name}`, note: scope,
      detail: transport === 'stdio' ? `stdio: ${value}` : `http: ${value}` }],
    apply: async ids => {
      if (ids[0] !== 'add') return undefined;
      const definition: McpAddDefinition = transport === 'stdio' ? { command: value, args: [] } : { url: value };
      const note = await add(scope, name, definition);
      return note ? { note } : undefined;
    },
  });
  const transportStep = (scope: Scope, name: string): Picker => choice('Transport', [
    { id: 'stdio', label: 'stdio', detail: 'Run a local command' },
    { id: 'http', label: 'http', detail: 'Connect to a URL' },
  ], selected => input(selected === 'http' ? 'Server URL' : 'Server command',
    selected === 'http' ? 'https://host/path' : 'command', '',
    text => !text.trim() ? 'A value is required.' : !plain(text) ? 'Control characters are not accepted.' : undefined,
    text => confirm(scope, selected as Transport, name, text.trim())));

  return choice('Scope', [
    { id: 'user', label: 'User', detail: 'Available in every project' },
    { id: 'project', label: 'Project', detail: 'This workspace only' },
  ], scope => input('Server name', 'name', '', text => NAME.test(text.trim()) ? undefined : 'Use 1–64 letters, digits, _ or -.',
    text => transportStep(scope as Scope, text.trim())));
}
