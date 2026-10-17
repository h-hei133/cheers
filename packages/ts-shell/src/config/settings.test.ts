import { expect, it } from 'vitest';
import { CONFIG_FIELDS } from './runtimeConfig.js';
import { CONFIG_SETTINGS, settingEditor, parseSettingInput, formatSetting, settingDefinition, settingPatch, validateSetting } from './settings.js';
import { runSettingsCommand } from '../core/commands/settingsCommandRuntime.js';

it('covers every public file field, expanding TUI leaves and excluding CLI-only exemptions', () => {
  const editable = Object.entries(CONFIG_FIELDS).filter(([, field]) => field.sensitivity === 'public' && field.application !== 'metadata' && field.sources.includes('user')).map(([key]) => key).sort();
  expect([...new Set(CONFIG_SETTINGS.map(item => item.path[0]))].sort()).toEqual(editable);
  expect(new Set(CONFIG_SETTINGS.map(item => item.key)).size).toBe(CONFIG_SETTINGS.length);
});

it('uses the same advanced registry for command help without accepting a write command', async () => {
  expect((await runSettingsCommand(['maxOutputTokens'], {} as never)).output).toContain('Requested output token budget');
  expect((await runSettingsCommand(['tui.diagrams'], {} as never)).output).toContain('restart');
  expect((await runSettingsCommand(['tui.composerShape'], {} as never)).output).toContain('immediate');
  expect((await runSettingsCommand(['providerCredentials'], {} as never)).output).toContain('Invalid /settings');
  expect((await runSettingsCommand(['maxTurns', '25'], {} as never)).output).toContain('Invalid /settings');
});

it('offers all input shapes as an immediate safe leaf without changing other TUI policies', () => {
  const shape = settingDefinition('tui.composerShape')!;
  expect(shape.label).toBe('Input shape');
  expect(shape.choices).toEqual(['default', 'band', 'borderless', 'top-rule', 'padded-rules', 'field', 'rail', 'box']);
  expect(shape.policy).toMatchObject({ application: 'immediate', projectTrust: 'safe', merge: 'tui', sources: ['project', 'user'] });
  for (const value of shape.choices!) expect(validateSetting(shape, value)).toBeUndefined();
  expect(validateSetting(shape, 'unknown')).toContain('Invalid value');
  expect(validateSetting(shape, undefined)).toBeUndefined();
  expect(settingPatch({ tui: { diagrams: 'off' } }, shape, 'rail')).toEqual({ tui: { diagrams: 'off', composerShape: 'rail' } });
  expect(settingDefinition('tui.diagrams')?.policy.application).toBe('restart');
  expect(settingDefinition('tui.statusItems')?.policy.application).toBe('restart');
});

it('renders public file values as round-trippable JSON without terminal controls', () => {
  const value = ['custom\x1b]52;clipboard\x07', '\x9b31m', '\x7f'];
  const shown = formatSetting(value);
  expect(shown).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
  expect(JSON.parse(shown)).toEqual(value);
});

it('gives every public setting a typed editor, with no JSON fallback for numbers, lists, or text', () => {
  const expected: Record<string, string> = {
    maxTurns: 'number', temperature: 'number', topP: 'number', maxOutputTokens: 'number',
    contextWindow: 'number', reserveTokens: 'number', instructionBudgetBytes: 'number',
    retryMaxRetries: 'number', providerRetryMaxRetries: 'number', retryBaseDelayMs: 'number',
    retryMaxDelayMs: 'number', providerConnectTimeoutMs: 'number', providerHeadersTimeoutMs: 'number',
    providerBodyTimeoutMs: 'number',
    allowedTools: 'list', allowedModels: 'list', pathRules: 'list', disabledTools: 'list',
    hiddenToolPrefixes: 'list', denyRules: 'list',
    modelTokenBudgets: 'object',
    attentionOnIdle: 'boolean', cacheWarming: 'choice', retryEnabled: 'boolean', enableMcpTools: 'boolean',
    offline: 'boolean', agentMode: 'choice', steeringMode: 'choice', followUpMode: 'choice',
    toolDiscovery: 'choice', tuiMode: 'choice', theme: 'theme',
    'tui.composerShape': 'choice', 'tui.statusItems': 'status-items', 'tui.diagrams': 'choice',
  };
  const editors = Object.fromEntries(CONFIG_SETTINGS.map(setting => [setting.key, settingEditor(setting)]));
  expect(editors).toEqual(expected);
});

it('parses each editor shape without quoting text or coercing list items', () => {
  const byKey = (key: string) => CONFIG_SETTINGS.find(setting => setting.key === key)!;
  expect(parseSettingInput(byKey('maxTurns'), '12')).toEqual({ ok: true, value: 12 });
  expect(parseSettingInput(byKey('maxTurns'), '1.5').ok).toBe(false);
  expect(parseSettingInput(byKey('maxTurns'), 'abc').ok).toBe(false);
  expect(parseSettingInput(byKey('hiddenToolPrefixes'), 'mcp.\nbrowser.')).toEqual({ ok: true, value: ['mcp.', 'browser.'] });
  expect(parseSettingInput(byKey('allowedTools'), '').value).toEqual([]);
  expect(parseSettingInput(byKey('pathRules'), '{"path":"src","settings":{}}')).toEqual({ ok: true, value: [{ path: 'src', settings: {} }] });
  expect(parseSettingInput(byKey('pathRules'), 'not json').ok).toBe(false);
  expect(parseSettingInput(byKey('theme'), 'custom theme').value).toBe('custom theme');
  expect(parseSettingInput(byKey('modelTokenBudgets'), '{"openai/gpt": {"reserveTokens": 10}}').ok).toBe(true);
});
