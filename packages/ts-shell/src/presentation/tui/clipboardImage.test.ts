import { describe, expect, it } from "vitest";
import { readClipboardImage } from "./clipboardImage.js";

/**
 * Reading an image from the clipboard.
 *
 * There is nothing to mock here without mocking the process itself, so what is
 * asserted is the contract that matters on any machine: this answers with an image
 * or with a reason there is none, and never throws. Every failure mode — no
 * clipboard tool installed, no desktop session, a headless box — is the same thing
 * to a user, which is that there is no image to paste.
 *
 * The distinction the implementation keeps between "could not ask" and "asked,
 * nothing there" is not observable from outside, so it is not asserted here. What
 * is asserted is that asking at all cannot take the editor down, and that an image
 * which comes back is one this build could actually send.
 */

describe("reading the clipboard", () => {
  it("answers with an image or a reason, and does not throw", async () => {
    const result = await readClipboardImage();
    if (result.kind === "image") {
      expect(result.image.bytes.length).toBeGreaterThan(0);
      expect(result.image.mimeType).toMatch(/^image\//);
      // An image that came back is one small enough to send: the provider refuses
      // an oversized one outright, which would fail the whole request and lose
      // whatever the user wrote beside it.
      expect(result.image.bytes.length).toBeLessThanOrEqual(3.75 * 1024 * 1024);
    } else {
      expect(["none", "too-large"]).toContain(result.kind);
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
