import { expect, it } from 'vitest';
import { CONFIG_FIELDS } from './runtimeConfig.js';
import { CONFIG_SETTINGS, formatSetting, settingDefinition, settingPatch, validateSetting } from './settings.js';
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
