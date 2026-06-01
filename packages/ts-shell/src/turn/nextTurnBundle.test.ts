import { describe, expect, it } from "vitest";

import { evaluateNextTurnDeliveryPolicy } from "./deliveryPolicy.js";
import { projectFollowUpQueue } from "./followUpQueue.js";
import { prepareNextTurnBundle } from "./nextTurnBundle.js";
import { projectSteeringQueue } from "./steeringQueue.js";

describe("next turn preparation boundaries", () => {
  it("builds a report-safe bundle without executing the next turn", () => {
    const steeringQueue = projectSteeringQueue({
      turnId: "sess:turn:1",
      messages: [
        { id: "steer-a", mode: "steer", text: "prefer concise answer" },
      ],
    });
    const followUpQueue = projectFollowUpQueue({
      turnId: "sess:turn:1",
      pendingBundleId: "bundle-a",
      messages: [
        { id: "follow-a", mode: "follow-up", text: "token=secret oldText=before newText=after" },
      ],
    });
    const policy = evaluateNextTurnDeliveryPolicy({
      bundleId: "bundle-a",
      steeringQueue,
      followUpQueue,
      toolResultMessageIds: ["tool-result-message:call-a"],
      contextRebuildProjectionIds: ["context-a"],
      sessionActivePathIds: ["session-path-a"],
      modelResponseIds: ["response-a"],
    });
    const bundle = prepareNextTurnBundle({
      bundleId: "bundle-a",
      turnId: "sess:turn:1",
      steeringQueue,
      followUpQueue,
      contextRebuildProjectionId: "context-a",
      sessionActivePathId: "session-path-a",
      providerMetadataIds: ["provider-a"],
      deliveryPolicy: policy,
    });
    const serialized = JSON.stringify(bundle);

    expect(bundle.deliveryStatus).toBe("waiting");
    expect(bundle.readinessStatus).toBe("not_ready");
    expect(bundle.steeringMessageIds).toEqual(["steering:steer-a"]);
    expect(bundle.followUpMessageIds).toEqual(["follow-up:follow-a"]);
    expect(policy.nextTurnExecuted).toBe(false);
    expect(policy.providerCalled).toBe(false);
    expect(bundle.terminalSuccessClaim).toBe(false);
    expect(bundle.notProvenClaims).toEqual(
      expect.arrayContaining([
        "next-turn-success",
        "bundle-prepared-is-not-execution",
      ]),
    );
    expect(serialized).not.toMatch(/token=secret|oldText=before|newText=after/i);
  });

  it("includes safe tool messages and excludes redacted messages from next-turn facts", () => {
    const bundle = prepareNextTurnBundle({
      bundleId: "bundle-a",
      turnId: "sess:turn:1",
      toolResultMessages: {
        batchId: "tool-result-message-batch:batch-a",
        dispatchPlanId: "plan-a",
        messages: [
          {
            messageId: "tool-result-message:call-safe",
            role: "tool",
            toolCallId: "call-safe",
            toolName: "read",
            safeContentSummary: "read completed",
            category: "executed_tool_fact",
            deliveryStatus: "prepared",
            redactionStatus: "report-safe",
            notProvenClaims: ["task-success"],
            terminalSuccessClaim: false,
          },
          {
            messageId: "tool-result-message:call-redacted",
            role: "tool",
            toolCallId: "call-redacted",
            toolName: "bash",
            safeContentSummary: "token=secret raw provider output: hidden reasoning",
            category: "not_dispatched",
            deliveryStatus: "blocked",
            redactionStatus: "redacted",
            notProvenClaims: ["task-success"],
            terminalSuccessClaim: false,
          },
        ],
        preparedCount: 1,
        blockedCount: 1,
        terminalSuccessClaim: false,
        notProvenClaims: ["next-turn-success"],
      },
      toolOutcomeBundle: {
        bundleId: "tool-outcome-bundle:batch-a",
        sourceBatchId: "tool-result-batch:batch-a",
        resultMessageIds: [
          "tool-result-message:call-safe",
          "tool-result-message:call-redacted",
        ],
        receiptIds: [],
        executedCount: 1,
        failedCount: 0,
        blockedCount: 1,
        authorityRequiredCount: 0,
        unsupportedCount: 0,
        malformedCount: 0,
        unknownCount: 0,
        notDispatchedCount: 0,
        mixedOutcomeStatus: "mixed_success_and_non_success",
        redactionStatus: "redacted",
        detailStatuses: [],
        blockingFacts: ["call-redacted:blocked_by_policy"],
        notProvenClaims: ["tool-outcome-bundle-is-not-task-success"],
        terminalSuccessClaim: false,
      },
    });
    const serialized = JSON.stringify(bundle);

    expect(bundle.readinessStatus).toBe("blocked_by_policy");
    expect(bundle.requiredUserAction).toBe("policy-blocker-must-be-resolved");
    expect(bundle.sourceToolOutcomeBundleId).toBe("tool-outcome-bundle:batch-a");
    expect(bundle.includedToolResultMessageIds).toEqual([
      "tool-result-message:call-safe",
    ]);
    expect(bundle.excludedToolResultMessageIds).toEqual([
      "tool-result-message:call-redacted",
    ]);
    expect(bundle.blockingFacts).toEqual(
      expect.arrayContaining(["call-redacted:blocked_by_policy"]),
    );
    expect(bundle.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(/token=secret|hidden reasoning/i);
  });

  it("represents steering and follow-up statuses without success claims", () => {
    const messages = [
      { id: "queued", mode: "steer" as const, text: "queued" },
      { id: "delivered", mode: "steer" as const, text: "delivered" },
      { id: "blocked", mode: "steer" as const, text: "blocked" },
      { id: "unsupported", mode: "steer" as const, text: "unsupported" },
      { id: "abandoned", mode: "steer" as const, text: "abandoned" },
      { id: "redacted", mode: "steer" as const, text: "Bearer abcdefghijk" },
    ];
    const steeringQueue = projectSteeringQueue({
      turnId: "sess:turn:1",
      messages,
      deliveredMessageIds: ["delivered"],
      blockedMessageIds: ["blocked"],
      unsupportedMessageIds: ["unsupported"],
      abandonedMessageIds: ["abandoned"],
    });
    const followUpQueue = projectFollowUpQueue({
      turnId: "sess:turn:1",
      pendingBundleId: "bundle-a",
      messages: messages.map((message) => ({ ...message, mode: "follow-up" as const })),
      deliveredMessageIds: ["delivered"],
      blockedMessageIds: ["blocked"],
      unsupportedMessageIds: ["unsupported"],
      abandonedMessageIds: ["abandoned"],
    });

    expect(steeringQueue.items.map((item) => item.deliveryStatus)).toEqual([
      "queued",
      "delivered",
      "blocked",
      "unsupported",
      "abandoned",
      "redacted",
    ]);
    expect(followUpQueue.items.map((item) => item.deliveryStatus)).toEqual([
      "queued",
      "delivered",
      "blocked",
      "unsupported",
      "abandoned",
      "redacted",
    ]);
    expect(
      [...steeringQueue.items, ...followUpQueue.items].every(
        (item) => item.terminalSuccessClaim === false,
      ),
    ).toBe(true);
    const bundle = prepareNextTurnBundle({
      bundleId: "bundle-a",
      turnId: "sess:turn:1",
      steeringQueue,
      followUpQueue,
    });
    expect(bundle.deliveryFacts.map((fact) => ({
      kind: fact.deliveryKind,
      queued: fact.queued,
      delivered: fact.delivered,
      blocked: fact.blocked,
    }))).toEqual(expect.arrayContaining([
      { kind: "steering", queued: true, delivered: false, blocked: false },
      { kind: "steering", queued: false, delivered: true, blocked: false },
      { kind: "steering", queued: false, delivered: false, blocked: true },
      { kind: "follow-up", queued: true, delivered: false, blocked: false },
      { kind: "follow-up", queued: false, delivered: true, blocked: false },
      { kind: "follow-up", queued: false, delivered: false, blocked: true },
    ]));
  });

  it("keeps delivery policy order deterministic and observation-only", () => {
    const steeringQueue = projectSteeringQueue({
      turnId: "sess:turn:1",
      messages: [{ id: "steer", mode: "steer", text: "steer" }],
    });
    const followUpQueue = projectFollowUpQueue({
      turnId: "sess:turn:1",
      pendingBundleId: "bundle-a",
      messages: [{ id: "follow", mode: "follow-up", text: "follow" }],
    });
    const policy = evaluateNextTurnDeliveryPolicy({
      bundleId: "bundle-a",
      steeringQueue,
      followUpQueue,
      toolResultMessageIds: ["tool-a"],
      contextRebuildProjectionIds: ["context-a"],
      sessionActivePathIds: ["session-a"],
      modelResponseIds: ["response-a"],
    });

    expect(policy.entries.map((entry) => entry.source)).toEqual([
      "steering",
      "follow-up",
      "tool-result-message",
      "context-rebuild",
      "session-active-path",
      "model-response",
    ]);
    expect(policy.entries.map((entry) => entry.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(policy.terminalSuccessClaim).toBe(false);
    expect(policy.notProvenClaims).toContain(
      "delivery-policy-evaluated-is-not-success",
    );
  });
});
