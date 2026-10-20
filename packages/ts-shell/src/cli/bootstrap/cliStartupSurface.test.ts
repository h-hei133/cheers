import { expect, it } from "vitest";
import { projectCliStartupSurfaceVisibility } from "./cliStartupSurface.js";

const terminal = { isTTY: true } as NodeJS.ReadStream & NodeJS.WriteStream;
const pipe = { isTTY: false } as NodeJS.ReadStream & NodeJS.WriteStream;
const options = { printMode: false, replayFile: undefined };

it("selects the fullscreen host for a real terminal without startup prose", () => {
  expect(projectCliStartupSurfaceVisibility({
    options,
    stdin: terminal,
    stdout: terminal,
    nonInteractivePromptCount: 0,
    stdinTransportMode: "stream-live",
  })).toEqual({
    fullScreenHost: true,
    showStartupSurface: false,
  });
});

it("uses the startup surface and line host over a pipe", () => {
  expect(projectCliStartupSurfaceVisibility({
    options,
    stdin: pipe,
    stdout: pipe,
    nonInteractivePromptCount: 0,
    stdinTransportMode: "stream-live",
  })).toEqual({
    fullScreenHost: false,
    showStartupSurface: true,
  });
});

it("keeps print mode on the startup surface path", () => {
  expect(projectCliStartupSurfaceVisibility({
    options: { ...options, printMode: true },
    stdin: terminal,
    stdout: terminal,
    nonInteractivePromptCount: 1,
    stdinTransportMode: "none",
  })).toEqual({
    fullScreenHost: false,
    showStartupSurface: true,
  });
});
