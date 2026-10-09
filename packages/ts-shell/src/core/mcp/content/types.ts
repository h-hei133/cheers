import type { GetPromptResult, Prompt, ReadResourceResult, Resource, ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import type { McpConfigScope, McpTransport } from "../types.js";

export type McpContentRequest =
  | { readonly action: "resources" }
  | { readonly action: "templates" }
  | { readonly action: "prompts" }
  | { readonly action: "read"; readonly uri: string }
  | { readonly action: "subscribe"; readonly uri: string }
  | { readonly action: "unsubscribe"; readonly uri: string }
  | { readonly action: "prompt"; readonly name: string; readonly arguments?: Record<string, string> };

export type McpContentResult =
  | { readonly kind: "unsupported"; readonly capability: "resources" | "prompts" | "subscriptions" }
  | { readonly kind: "resources"; readonly items: Resource[] }
  | { readonly kind: "templates"; readonly items: ResourceTemplate[] }
  | { readonly kind: "prompts"; readonly items: Prompt[] }
  | { readonly kind: "read"; readonly value: ReadResourceResult }
  | { readonly kind: "prompt"; readonly value: GetPromptResult }
  | { readonly kind: "subscribe" | "unsubscribe"; readonly uri: string };

export interface McpContentResponse {
  readonly serverName: string;
  readonly scope: McpConfigScope;
  readonly transport: McpTransport;
  readonly result: McpContentResult;
}

/** Notification bodies may carry credentials or arbitrary instructions. Retain metadata only. */
export interface McpNotification {
  readonly sequence: number;
  readonly receivedAt: string;
  readonly method: string;
  readonly level?: string;
}

export interface McpNotificationSnapshot {
  readonly serverName: string;
  readonly state: "live" | "not-connected";
  readonly entries: readonly McpNotification[];
  readonly dropped: number;
}
