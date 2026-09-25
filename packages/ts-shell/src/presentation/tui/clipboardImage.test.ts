import { describe, expect, it } from "vitest";
import { readClipboardImage } from "./clipboardImage.js";

/**
 * Reading an image from the clipboard.
 *
 * There is nothing to mock here without mocking the process itself, so what is
 * asserted is the contract that matters on any machine: this returns an image or
 * nothing, and never throws. Every failure mode — no clipboard tool installed, no
 * desktop session, a headless box — is the same thing to a user, which is that
 * there is no image to paste.
 *
 * The distinction the implementation keeps between "could not ask" and "asked,
 * nothing there" is not observable from outside, so it is not asserted here. What
 * is asserted is that asking at all cannot take the editor down.
 */

describe("reading the clipboard", () => {
  it("returns an image or nothing, and does not throw", async () => {
    const result = await readClipboardImage();
    // Either an image with bytes and a supported type, or nothing at all.
    if (result !== undefined) {
      expect(result.bytes.length).toBeGreaterThan(0);
      expect(result.mimeType).toMatch(/^image\//);
    } else {
      expect(result).toBeUndefined();
    }
  });

  it("settles rather than hanging when no backend can be asked", async () => {
    // The backends shell out with their own timeouts. This asserts the whole call
    // finishes rather than leaving the editor waiting on a clipboard that will
    // never answer.
    const started = Date.now();
    await readClipboardImage();
    expect(Date.now() - started).toBeLessThan(20_000);
  });
});
