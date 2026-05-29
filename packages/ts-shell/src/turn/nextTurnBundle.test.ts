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
