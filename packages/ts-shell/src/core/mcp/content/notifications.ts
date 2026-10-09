import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  LoggingMessageNotificationSchema, PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema, ResourceUpdatedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpNotification } from "./types.js";

const MAX_NOTIFICATIONS = 200;

export class McpNotifications {
  private sequence = 0;
  private readonly entries: McpNotification[] = [];

  constructor(client: Client, active: () => boolean, invalidate: (kind: "resources" | "prompts" | "updated", uri?: string) => void) {
    client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
      if (!active()) return;
      this.record("notifications/resources/list_changed");
      invalidate("resources");
    });
    client.setNotificationHandler(PromptListChangedNotificationSchema, () => {
      if (!active()) return;
      this.record("notifications/prompts/list_changed");
      invalidate("prompts");
    });
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
      if (!active()) return;
      this.record("notifications/resources/updated");
      invalidate("updated", notification.params.uri);
    });
    client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
      if (active()) this.record(notification.method, notification.params.level);
    });
  }

  record(method: string, level?: string): void {
    this.entries.push({ sequence: ++this.sequence, receivedAt: new Date().toISOString(), method, ...(level ? { level } : {}) });
    if (this.entries.length > MAX_NOTIFICATIONS) this.entries.shift();
  }

  snapshot(): { entries: McpNotification[]; dropped: number } {
    return { entries: structuredClone(this.entries), dropped: this.sequence - this.entries.length };
  }
}
