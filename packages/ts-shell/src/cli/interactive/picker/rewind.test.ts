import { describe, expect, it, vi } from "vitest";
import { opensPicker, pickerFor } from "./registry.js";
import { OverlayHost } from "../overlay.js";
import { parseKeyEvent } from "../../../presentation/tui/input/keys.js";
import { rewindPicker } from './rewind.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

describe("back selectors", () => {
  it.each(["/back", "/back 2", "/BACK older", " /back message-1 "])("opens the chooser for %s", (line) => {
    expect(opensPicker(line)).toBe(true);
  });

  it.each(["/backlog 2", "/constructor", "/resume session-1", "/model use model-1", "/tree message-1"])(
    "keeps %s out of picker interception", (line) => expect(opensPicker(line)).toBe(false),
  );

  it.each(["2", "message-1", "older question"])("prepares %s without navigating until confirmation", async (selector) => {
    const rewind = vi.fn(async () => ({ note: "restored", draft: "older question" }));
    const picker = pickerFor(`/back ${selector}`, {
      sessionTurns: () => [
        { id: "message-1", role: "user", content: "older question" },
        { id: "message-2", role: "user", content: "newer question" },
      ],
      rewind,
    } as never)!;
    const overlay = new OverlayHost(() => {});
    overlay.open(picker);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rewind).not.toHaveBeenCalled();
    const selected = vi.fn();
    overlay.handleKey(parseKeyEvent("\r"), selected);
    expect(selected).toHaveBeenCalledWith(picker, ["message-1"]);
    expect(await picker.apply(["message-1"])).toEqual({ note: "restored", draft: "older question" });
    expect(rewind).toHaveBeenCalledTimes(1);
  });

  it('does not invent a draft when navigation reports an unknown outcome', async () => {
    const picker = rewindPicker({
      turns: [{ id: 'question', role: 'user', content: '  original question  ' }],
      rewind: async () => ({ note: 'Navigation outcome is unknown.' }),
    });
    expect(await picker.apply(['question'])).toEqual({ note: 'Navigation outcome is unknown.' });
  });

  it('pages older questions while keeping the newest-first order', async () => {
    const turns = Array.from({ length: 60 }, (_, index) => ({
      id: `question-${index}`,
      role: 'user' as const,
      content: `question ${index}`,
    }));
    const rewind = vi.fn(async () => ({ note: 'restored' }));
    const first = rewindPicker({ turns, rewind });
    const firstOptions = await first.load();

    expect(firstOptions).toHaveLength(26);
    expect(firstOptions[0]?.label).toBe('question 59');
    expect(firstOptions.at(-1)?.id).toBe('__more__');

    const second = await first.apply(['__more__']);
    expect(second?.next).toBeDefined();
    const secondOptions = await second!.next!.load();
    expect(secondOptions[0]?.label).toBe('question 34');
    expect(secondOptions.at(-1)?.id).toBe('__more__');

    await second!.next!.apply(['question-10']);
    expect(rewind).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'question-10' }));
  });

  it('positions numeric and stable-id selectors on the page that contains them', async () => {
    const turns = Array.from({ length: 60 }, (_, index) => ({
      id: `question-${index}`,
      role: 'user' as const,
      content: `question ${index}`,
    }));
    const rewind = vi.fn(async () => ({ note: 'restored' }));

    const numeric = rewindPicker({ turns, selector: '26', rewind });
    expect(numeric.initialSelection).toBe('question-34');
    expect((await numeric.load())[0]?.id).toBe('question-34');

    const stable = rewindPicker({ turns, selector: 'question-0', rewind });
    expect(stable.initialSelection).toBe('question-0');
    expect((await stable.load()).at(-1)?.id).toBe('question-0');
  });

  it('gives an exact stable id priority over a newer prompt mentioning it', async () => {
    const rewind = vi.fn(async () => ({ draft: 'original question' }));
    const picker = rewindPicker({ turns: [
      { id: 'original', role: 'user', content: 'original question' },
      { id: 'newer', role: 'user', content: 'Please discuss original again' },
    ], selector: 'original', rewind });
    expect(picker.initialSelection).toBe('original');
    const overlay = new OverlayHost(() => {});
    overlay.open(picker);
    await vi.waitFor(() => expect(strip(overlay)).toContain('original question'));
    const selected = vi.fn();
    overlay.handleKey(parseKeyEvent('\r'), selected);
    expect(selected).toHaveBeenCalledWith(picker, ['original']);
    expect(rewind).not.toHaveBeenCalled();
  });

  it('filters the full question text before paging and keeps the query on continuation', async () => {
    const turns = Array.from({ length: 60 }, (_, index) => ({
      id: `question-${index}`, role: 'user' as const, content: `question ${index}\narchived`,
    }));
    turns.push({ id: 'newest', role: 'user', content: 'unrelated newest question' });
    const rewind = vi.fn(async () => ({ draft: 'older question' }));
    const picker = rewindPicker({ turns, selector: 'archived', rewind });
    expect(picker.initialFilter).toBe('archived');
    const overlay = new OverlayHost(() => {});
    overlay.open(picker);
    await vi.waitFor(() => expect(strip(overlay)).toContain('question 59'));
    expect(strip(overlay)).not.toContain('unrelated newest question');
    const second = (await picker.apply(['__more__']))!.next!;
    expect(second.initialFilter).toBe('archived');
    expect((await second.load())[0]?.id).toBe('question-34');
    expect(rewind).not.toHaveBeenCalled();
    overlay.close();
  });

  it('reaches the last page without duplicates and only dispatches an offered question', async () => {
    const turns = Array.from({ length: 60 }, (_, index) => ({
      id: `question-${index}`, role: 'user' as const, content: `question ${index}`,
    }));
    const rewind = vi.fn(async () => ({ draft: 'question 0' }));
    let picker = rewindPicker({ turns, rewind });
    const ids: string[] = [];
    for (let page = 0; page < 3; page++) {
      const options = await picker.load();
      ids.push(...options.filter(option => option.id !== '__more__').map(option => option.id));
      expect(await picker.apply(['not-offered'])).toBeUndefined();
      if (page < 2) picker = (await picker.apply(['__more__']))!.next!;
      else {
        expect(options).toHaveLength(10);
        expect(await picker.apply(['__more__'])).toBeUndefined();
      }
    }
    expect(ids).toEqual(turns.map(turn => turn.id).reverse());
    expect(rewind).not.toHaveBeenCalled();
    expect(await picker.apply(['question-0'])).toEqual({ draft: 'question 0' });
    expect(rewind).toHaveBeenCalledTimes(1);
    expect(rewind).toHaveBeenCalledWith({ entryId: 'question-0', prompt: 'question 0', dropped: 59 });
  });

  it('keeps pages on the captured points when the source turns change', async () => {
    const turns = Array.from({ length: 51 }, (_, index) => ({
      id: `question-${index}`, role: 'user' as const, content: `question ${index}`,
    }));
    const rewind = vi.fn(async () => undefined);
    const first = rewindPicker({ turns, rewind });
    await first.load();
    turns.push({ id: 'newest', role: 'user', content: 'newest question' });
    const next = (await first.apply(['__more__']))!.next!;
    expect((await next.load())[0]?.id).toBe('question-25');
    expect(await first.apply(['question-25'])).toBeUndefined();
    expect(rewind).not.toHaveBeenCalled();
  });

  it('keeps a question whose stable id resembles the continuation selectable', async () => {
    const turns = Array.from({ length: 26 }, (_, index) => ({
      id: index === 25 ? '__more__' : `question-${index}`, role: 'user' as const, content: `question ${index}`,
    }));
    const rewind = vi.fn(async () => ({ draft: 'question 25' }));
    const picker = rewindPicker({ turns, rewind });
    const options = await picker.load();
    expect(new Set(options.map(option => option.id)).size).toBe(26);
    expect(options.at(-1)?.id).not.toBe('__more__');
    expect(await picker.apply(['__more__'])).toEqual({ draft: 'question 25' });
    expect(rewind).toHaveBeenCalledTimes(1);
  });

  it('searches older questions after typing and resets paging when the query clears', async () => {
    const turns = Array.from({ length: 60 }, (_, index) => ({
      id: `question-${index}`, role: 'user' as const, content: index === 0 ? 'oldest rare prompt' : `question ${index}`,
    }));
    const rewind = vi.fn(async () => undefined);
    const first = rewindPicker({ turns, rewind });
    const second = (await first.apply(['__more__']))!.next!;
    const overlay = new OverlayHost(() => {});
    overlay.open(second);
    await vi.waitFor(() => expect(strip(overlay)).toContain('question 34'));
    overlay.handlePaste('rare');
    expect(strip(overlay)).toContain('oldest rare prompt');
    expect(strip(overlay)).toContain('Questions 1-1 of 1');
    for (let index = 0; index < 4; index++) overlay.handleKey(parseKeyEvent('\x7f'), () => {});
    expect(strip(overlay)).toContain('question 59');
    overlay.handleKey(parseKeyEvent('\x1b'), () => {});
    expect(overlay.active).toBe(false);
    expect(rewind).not.toHaveBeenCalled();
  });
});

function strip(overlay: OverlayHost): string {
  return stripAnsi(overlay.render(100, 30).join('\n'));
}
