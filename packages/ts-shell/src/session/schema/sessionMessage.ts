export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}
