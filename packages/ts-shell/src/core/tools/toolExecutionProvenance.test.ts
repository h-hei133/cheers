import { describe, expect, it } from "vitest";
import {
  deriveToolExecutionProvenance,
  toLegacyToolSuccess,
} from "./toolExecutionProvenance.js";

describe("tool execution provenance", () => {
  it("maps successful execution to legacy success", () => {
    expect(
      deriveToolExecutionProvenance({
        success: true,
      }),
    ).toEqual({
      kind: "executed-succeeded",
      source: "tool-runtime",
      legacySuccess: true,
    });
  });

  it("keeps approval denial separate from executed failures", () => {
    expect(
      deriveToolExecutionProvenance({
        success: false,
        error: "Approval denied by user for bash",
        metadata: { wasEscalated: true },
      }),
    ).toEqual({
      kind: "approval-denied",
      source: "approval-flow",
      legacySuccess: false,
      failureBoundary: "approval-denied",
    });
  });

  it("maps rust sandbox preflight failure separately from execution failure", () => {
    expect(
      deriveToolExecutionProvenance({
        success: false,
        error: "Network access requires escalation",
        metadata: {
          executionPath: "rust-daemon",
          failureKind: "sandbox_preflight",
        },
      }),
    ).toEqual({
      kind: "sandbox-preflight-blocked",
      source: "sandbox-enforcer",
      legacySuccess: false,
      failureBoundary: "sandbox-preflight-blocked",
    });
  });

  it("maps unavailable tools separately from permission policy blocks", () => {
    expect(
      deriveToolExecutionProvenance({
        success: false,
        error: "MCP tool 'mcp__missing__tool' is not registered",
        metadata: { executionPath: "mcp-stdio" },
      }),
    ).toEqual({
      kind: "unavailable-tool",
      source: "mcp-registry",
      legacySuccess: false,
      failureBoundary: "unavailable-tool",
    });
  });

  it("maps MVP allowlist denial as permission blocked", () => {
    expect(
      deriveToolExecutionProvenance({
        success: false,
        error: "Tool 'network-fetch' is not in the MVP allowlist",
      }),
    ).toEqual({
      kind: "permission-blocked",
      source: "allowlist",
      legacySuccess: false,
      failureBoundary: "permission-blocked",
    });
  });

  it("honors explicit structured execution metadata ahead of legacy heuristics", () => {
    expect(
      deriveToolExecutionProvenance({
        success: false,
        error: "legacy text says not registered",
        metadata: { toolExecutionKind: "executed-failed" },
      }),
    ).toEqual({
      kind: "executed-failed",
      source: "tool-result-metadata",
      legacySuccess: false,
      failureBoundary: "executed-failed",
    });
  });

  it("keeps legacy success compatible for every blocked or failed kind", () => {
    expect(toLegacyToolSuccess("executed-succeeded")).toBe(true);
    expect(toLegacyToolSuccess("executed-failed")).toBe(false);
    expect(toLegacyToolSuccess("approval-denied")).toBe(false);
    expect(toLegacyToolSuccess("permission-blocked")).toBe(false);
    expect(toLegacyToolSuccess("sandbox-preflight-blocked")).toBe(false);
    expect(toLegacyToolSuccess("unavailable-tool")).toBe(false);
  });
});
