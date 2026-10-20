import { expect, it, vi } from "vitest";
import { createStartupNoticeRouter } from "./startupNotice.js";

it("routes non-fullscreen notices through the renderer", () => {
  const renderLine = vi.fn();
  const router = createStartupNoticeRouter({
    renderer: { renderLine },
    logger: { warn: vi.fn() },
  });

  router.publish("Recovery hint: /resume");

  expect(renderLine).toHaveBeenCalledWith("Recovery hint: /resume");
});

it("routes fullscreen notices through the installed transcript writer", () => {
  const renderLine = vi.fn();
  const writeTranscript = vi.fn();
  const router = createStartupNoticeRouter({
    renderer: { renderLine },
    logger: { warn: vi.fn() },
  });
  router.setFullScreenHost(true);
  router.setTranscriptWriter(writeTranscript);

  router.publish("Recovery hint: /resume");

  expect(writeTranscript).toHaveBeenCalledWith("Recovery hint: /resume");
  expect(renderLine).not.toHaveBeenCalled();
});

it("reports a missing fullscreen transcript writer instead of leaking to stdout", () => {
  const renderLine = vi.fn();
  const warn = vi.fn();
  const router = createStartupNoticeRouter({
    renderer: { renderLine },
    logger: { warn },
  });
  router.setFullScreenHost(true);

  router.publish("Recovery hint: /resume");

  expect(renderLine).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    "Startup notice could not reach the interactive transcript",
  );
});

it("does not throw when the missing-writer logger is unavailable", () => {
  const router = createStartupNoticeRouter({
    renderer: { renderLine: vi.fn() },
    logger: {
      warn: () => {
        throw new Error("logger failed");
      },
    },
  });
  router.setFullScreenHost(true);

  expect(() => router.publish("Recovery hint: /resume")).not.toThrow();
});
