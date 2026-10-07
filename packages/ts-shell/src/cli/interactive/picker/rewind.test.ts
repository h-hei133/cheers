import { describe, expect, it, vi } from "vitest";
import { opensPicker, pickerFor } from "./registry.js";
import { OverlayHost } from "../overlay.js";
import { parseKeyEvent } from "../../../presentation/tui/input/keys.js";
import { rewindPicker } from './rewind.js';

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
});
