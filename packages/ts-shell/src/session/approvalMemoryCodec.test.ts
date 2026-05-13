import { describe, expect, it } from "vitest";
import {
  decodeApprovalMemory,
  decodeApprovalMemoryHistory,
  encodeApprovalMemory,
  normalizeApprovalMemoryRecord,
  projectApprovalSummaryFallback,
} from "./approvalMemoryCodec.js";

describe("approvalMemoryCodec", () => {
  it("normalizes structured approval memory without changing durable defaults", () => {
    expect(
      normalizeApprovalMemoryRecord({
        decision: " allow-always ",
        decisionSource: " cli-policy ",
        cacheEffect: " persistent ",
        projectRoot: " /repo ",
        cacheKey: " /repo|bash:spawn ",
        scopeLabel: " bash/spawn ",
        lineage: " route-1 ",
        stopReason: " denied before write ",
        channel: "interactive",
        inputKey: "a",
        recordedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      decision: "allow-always",
      decisionSource: "cli-policy",
      persistent: true,
      cacheEffect: "persistent",
      projectRoot: "/repo",
      cacheKey: "/repo|bash:spawn",
      scopeLabel: "bash/spawn",
      lineage: "route-1",
      stopReason: "denied before write",
      channel: "interactive",
      inputKey: "a",
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("decodes approval memory from structured, continuity, then summary fallbacks", () => {
    expect(
      decodeApprovalMemory({
        approvalAudit: {
          decision: "deny",
          projectRoot: "/repo",
          cacheKey: "/repo|apply_patch",
          scopeLabel: "apply_patch/write",
        },
        continuity: {
          lastApprovalDecision: "allow-once",
        },
      }),
    ).toMatchObject({
      decision: "deny",
      decisionSource: "unknown",
      persistent: false,
      cacheEffect: "none",
    });

    expect(
      decodeApprovalMemory({
        continuity: {
          lastApprovalDecision: "allow-once",
          lastApprovalDecisionSource: "continuity",
          lastApprovalPersistent: false,
          lastApprovalCacheEffect: "none",
          lastApprovalProjectRoot: "/repo",
          lastApprovalCacheKey: "/repo|bash",
          lastApprovalScope: "bash/spawn",
          lastApprovalChannel: "non-interactive",
          lastApprovalInputKey: "y",
        },
      }),
    ).toMatchObject({
      decision: "allow-once",
      decisionSource: "continuity",
      channel: "non-interactive",
      inputKey: "y",
    });

    expect(
      decodeApprovalMemory({
        summary: [
          "- last-approval-decision: allow-always",
          "- last-approval-decision-source: summary",
          "- last-approval-persistent: yes",
          "- last-approval-cache-key: /repo|bash",
        ],
      }),
    ).toMatchObject({
      decision: "allow-always",
      decisionSource: "summary",
      persistent: true,
      cacheKey: "/repo|bash",
    });
  });

  it("keeps compact summary compatibility for approval-audit fallback lines", () => {
    expect(
      projectApprovalSummaryFallback([
        "approval-audit:decision=deny",
        "approval-audit:decision-source=legacy-summary",
        "approval-audit:persistent=false",
        "- last-approval-channel: interactive",
        "- last-approval-input-key: n",
      ]),
    ).toMatchObject({
      decision: "deny",
      decisionSource: "legacy-summary",
      persistent: false,
      channel: "interactive",
      inputKey: "n",
    });
  });

  it("decodes approval history from root before continuity and applies the limit", () => {
    const rootHistory = [
      { decision: "deny", recordedAt: "2026-01-01T00:00:00.000Z" },
      { decision: "allow-once", recordedAt: "2026-01-02T00:00:00.000Z" },
    ];
    const continuityHistory = [
      { decision: "allow-always", recordedAt: "2026-01-03T00:00:00.000Z" },
    ];

    expect(
      decodeApprovalMemoryHistory(
        {
          approvalAuditHistory: rootHistory,
          continuity: { lastApprovalHistory: continuityHistory },
        },
        { historyLimit: 1 },
      ),
    ).toEqual([
      {
        decision: "allow-once",
        decisionSource: "unknown",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "unknown",
        cacheKey: "unknown",
        scopeLabel: "unknown",
        recordedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("encodes a stable durable record shape", () => {
    expect(
      encodeApprovalMemory({
        decision: "deny",
        decisionSource: "cli",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "/repo",
        cacheKey: "/repo|bash",
        scopeLabel: "bash/spawn",
        recordedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      decision: "deny",
      decisionSource: "cli",
      persistent: false,
      cacheEffect: "none",
      projectRoot: "/repo",
      cacheKey: "/repo|bash",
      scopeLabel: "bash/spawn",
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
