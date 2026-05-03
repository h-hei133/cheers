import { describe, expect, it } from "vitest";
import {
  detectPtyCapability,
  formatPtyUnavailableSkipMessage,
} from "./ptyCapabilityDetector.js";

describe("PTY capability detector", () => {
  it("defaults to unavailable until a true PTY strategy is explicitly approved", async () => {
    await expect(detectPtyCapability()).resolves.toEqual({
      available: false,
      reason: "dependency-unavailable",
      details:
        "No approved true PTY dependency or external probe is configured; pipe-spawn coverage is not true PTY coverage.",
    });
  });

  it("does not treat an approved strategy as available without a probe", async () => {
    await expect(
      detectPtyCapability({ approvedStrategy: "node-pty" }),
    ).resolves.toEqual({
      available: false,
      reason: "dependency-unavailable",
      details:
        'Approved PTY strategy "node-pty" has no test-only probe implementation; pipe-spawn coverage is not true PTY coverage.',
    });
  });

  it("normalizes an approved successful probe to the approved strategy", async () => {
    await expect(
      detectPtyCapability({
        approvedStrategy: "external-pty-probe",
        probe: () => ({ available: true, details: "probe ok" }),
      }),
    ).resolves.toEqual({
      available: true,
      strategy: "external-pty-probe",
      details: "probe ok",
    });
  });

  it("keeps unavailable probe attribution structured", async () => {
    await expect(
      detectPtyCapability({
        approvedStrategy: "node-pty",
        probe: () => ({
          available: false,
          reason: "environment-unsupported",
          details: "Windows PTY support unavailable in this environment.",
        }),
      }),
    ).resolves.toEqual({
      available: false,
      reason: "environment-unsupported",
      details: "Windows PTY support unavailable in this environment.",
    });
  });

  it("classifies EPERM probe failures as sandbox spawn blocks", async () => {
    const error = Object.assign(new Error("spawn EPERM"), { code: "EPERM" });
    await expect(
      detectPtyCapability({
        approvedStrategy: "node-pty",
        probe: () => {
          throw error;
        },
      }),
    ).resolves.toEqual({
      available: false,
      reason: "sandbox-spawn-blocked",
      details: "PTY probe spawn was blocked with EPERM: spawn EPERM",
    });
  });

  it("formats skip messages without implying pipe-spawn fallback", () => {
    expect(
      formatPtyUnavailableSkipMessage({
        available: false,
        reason: "manual-tty-only",
        details: "Only inherited TTY manual runner exists.",
      }),
    ).toBe(
      "true PTY unavailable: manual-tty-only. Only inherited TTY manual runner exists. Pipe-spawn coverage is not true PTY coverage.",
    );
  });
});
