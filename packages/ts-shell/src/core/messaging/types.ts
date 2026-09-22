export type PeerAgentKind = "subagent" | "teammate" | "local_session" | "cloud" | "remote_control";

export interface AgentDescriptor {
  readonly id: string;
  readonly name: string;
  readonly kind: PeerAgentKind;
  readonly status: "running" | "idle" | "parked" | "offline";
  readonly socketPath?: string;
  readonly workspaceRoot?: string;
  readonly model?: string;
  readonly description?: string;
  readonly lastActiveAt: number;
}

export type MessagingFrame =
  | {
      readonly type: "auth";
      readonly token: string;
      readonly clientSessionId: string;
    }
  | {
      readonly type: "message";
      readonly id: string;
      readonly sender: string;
      readonly senderId: string;
      readonly content: string;
      readonly replySocket?: string;
      readonly timestamp: number;
    }
  | {
      readonly type: "subscribe_idle";
      readonly subscriptionId: string;
      readonly returnSocket: string;
      readonly subscriberSessionId: string;
    }
  | {
      readonly type: "idle_notice";
      readonly subscriptionId: string;
      readonly targetSessionId: string;
      readonly finishedAt: number;
      readonly statusSummary?: string;
    };
