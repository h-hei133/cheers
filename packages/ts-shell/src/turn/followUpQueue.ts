import { freezeDeep } from "../core/values/freeze.js";
import { redactReportText } from "../core/security/redaction.js";

export interface FollowUpQueuedMessageLike {
  readonly id: string;
  readonly text: string;
  readonly mode?: "follow-up" | "steering" | string;
}

export type FollowUpDeliveryStatus =
  | "queued"
  | "delivered"
  | "blocked"
  | "redacted"
  | "unsupported"
  | "abandoned";

export interface FollowUpQueueItem {
  readonly followUpId: string;
  readonly source: "runtime" | "user" | "model" | "unknown";
  readonly safeSummary: string;
  readonly targetTurnId: string;
  readonly deliveryStatus: FollowUpDeliveryStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface FollowUpQueueProjection {
  readonly queueId: string;
  readonly items: readonly FollowUpQueueItem[];
  readonly queuedCount: number;
  readonly deliveredCount: number;
  readonly blockedCount: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectFollowUpQueue(input: {
  readonly turnId: string;
  readonly pendingBundleId: string;
  readonly messages: readonly FollowUpQueuedMessageLike[];
  readonly deliveredMessageIds?: readonly string[];
  readonly unsupportedMessageIds?: readonly string[];
  readonly abandonedMessageIds?: readonly string[];
  readonly blockedMessageIds?: readonly string[];
}): FollowUpQueueProjection {
  const delivered = new Set(input.deliveredMessageIds ?? []);
  const unsupported = new Set(input.unsupportedMessageIds ?? []);
  const abandoned = new Set(input.abandonedMessageIds ?? []);
  const blocked = new Set(input.blockedMessageIds ?? []);
  const items = input.messages
    .filter((message) => message.mode === "follow-up")
    .map((message): FollowUpQueueItem => {
      const safeSummary = redactReportText(message.text, 160);
      const deliveryStatus = statusFor({
        id: message.id,
        text: message.text,
        delivered,
        unsupported,
        abandoned,
        blocked,
      });
      return freezeDeep({
        followUpId: sanitizeId(`follow-up:${message.id}`),
        source: "user",
        safeSummary,
        targetTurnId: input.pendingBundleId,
        deliveryStatus,
        redactionStatus:
          deliveryStatus === "redacted" || safeSummary !== message.text.trim().slice(0, 160)
            ? "redacted"
            : "report-safe",
        notProvenClaims: unique([
          "terminal-success",
          "task-success",
          "next-turn-success",
          "follow-up-delivery-is-not-success",
        ]),
        terminalSuccessClaim: false,
      });
    });

  return freezeDeep({
    queueId: sanitizeId(`${input.turnId}:follow-up-queue`),
    items: freezeDeep(items),
    queuedCount: items.filter((item) => item.deliveryStatus === "queued").length,
    deliveredCount: items.filter((item) => item.deliveryStatus === "delivered").length,
    blockedCount: items.filter((item) =>
      item.deliveryStatus === "blocked" ||
      item.deliveryStatus === "unsupported" ||
      item.deliveryStatus === "redacted"
    ).length,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "next-turn-success",
      ...items.flatMap((item) => item.notProvenClaims),
    ]),
  });
}

function statusFor(input: {
  readonly id: string;
  readonly text: string;
  readonly delivered: ReadonlySet<string>;
  readonly unsupported: ReadonlySet<string>;
  readonly abandoned: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
}): FollowUpDeliveryStatus {
  if (input.abandoned.has(input.id)) {
    return "abandoned";
  }
  if (input.unsupported.has(input.id)) {
    return "unsupported";
  }
  if (input.blocked.has(input.id)) {
    return "blocked";
  }
  if (redactReportText(input.text, 160) !== input.text.trim().slice(0, 160)) {
    return "redacted";
  }
  return input.delivered.has(input.id) ? "delivered" : "queued";
}

function unique(values: readonly string[]): readonly string[] {
  return freezeDeep(Array.from(new Set(values.map((value) => redactReportText(value, 120)))).sort());
}

function sanitizeId(value: string): string {
  return redactReportText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
