import { expect, it } from 'vitest';
import { CONFIG_FIELDS } from './runtimeConfig.js';
import { CONFIG_SETTINGS, formatSetting } from './settings.js';
import { runSettingsCommand } from '../core/commands/settingsCommandRuntime.js';

it('covers every public file field, expanding TUI leaves and excluding CLI-only exemptions', () => {
  const editable = Object.entries(CONFIG_FIELDS).filter(([, field]) => field.sensitivity === 'public' && field.application !== 'metadata' && field.sources.includes('user')).map(([key]) => key).sort();
  expect([...new Set(CONFIG_SETTINGS.map(item => item.path[0]))].sort()).toEqual(editable);
  expect(new Set(CONFIG_SETTINGS.map(item => item.key)).size).toBe(CONFIG_SETTINGS.length);
});

it('uses the same advanced registry for command help without accepting a write command', async () => {
  expect((await runSettingsCommand(['maxOutputTokens'], {} as never)).output).toContain('Requested output token budget');
  expect((await runSettingsCommand(['tui.diagrams'], {} as never)).output).toContain('restart');
  expect((await runSettingsCommand(['providerCredentials'], {} as never)).output).toContain('Invalid /settings');
  expect((await runSettingsCommand(['maxTurns', '25'], {} as never)).output).toContain('Invalid /settings');
});

it('renders public file values as round-trippable JSON without terminal controls', () => {
  const value = ['custom\x1b]52;clipboard\x07', '\x9b31m', '\x7f'];
  const shown = formatSetting(value);
  expect(shown).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
  expect(JSON.parse(shown)).toEqual(value);
});
