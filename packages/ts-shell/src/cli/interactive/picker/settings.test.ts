import { describe, expect, it, vi } from 'vitest';
import { settingsPicker } from './settings.js';
import { OverlayHost } from '../overlay.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

function host() {
  const save = vi.fn(async () => 'Saved to your user configuration. Effective for the next operation.');
  return { save, openSettings: () => ({ save, values: {
    attentionOnIdle: { effective: true, stored: false }, offline: { effective: false, stored: undefined },
  } }) };
}

describe('settings picker', () => {
  it('marks effective values while displaying a different user-file value and the explicit target', async () => {
    const h = host(); const picker = settingsPicker(h);
    const options = await picker.load();
    expect(picker.title).toContain('save to user configuration');
    expect(options.find(item => item.id === 'attentionOnIdle:true')).toMatchObject({ selected: true, note: 'Current on · user off' });
    expect(options.find(item => item.id === 'attentionOnIdle:false')?.selected).toBe(false);
    expect(h.save).not.toHaveBeenCalled();
  });
  it.each([80, 120])('keeps actual current and stored state visible in the rendered %i-column panel', async width => {
    const overlay = new OverlayHost(() => {}); overlay.open(settingsPicker(host()));
    await Promise.resolve(); await Promise.resolve();
    const rows = overlay.render(width, 24).map(stripAnsi);
    expect(rows.filter(row => row.includes('Attention on idle'))).toHaveLength(2);
    for (const row of rows.filter(row => row.includes('Attention on idle'))) expect(row).toContain('Current on · user off');
    for (const row of rows.filter(row => row.includes('Offline'))) expect(row).toContain('Current off · user unset');
    overlay.close();
  });
  it('only saves on apply and preserves the host application outcome', async () => {
    const h = host(); h.save.mockResolvedValue('Saved. Configuration was not applied (rejected).');
    const picker = settingsPicker(h); await picker.load();
    const result = await picker.apply(['attentionOnIdle:true']);
    expect(h.save).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledWith('attentionOnIdle', true);
    expect(result?.note).toBe('Attention on idle: Saved. Configuration was not applied (rejected).');
  });
  it.each([[], ['attentionOnIdle:yes'], ['attentionOnIdle:true:extra'], ['offline:true', 'attentionOnIdle:true']].map(ids => ({ ids })))('ignores invalid selections $ids', async ({ ids }) => {
    const h = host(); const picker = settingsPicker(h); await picker.load();
    expect(await picker.apply(ids)).toBeUndefined(); expect(h.save).not.toHaveBeenCalled();
  });
});
