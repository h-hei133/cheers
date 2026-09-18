import {
  sanitizeSidebarText,
  type SidebarSeverity,
  type SidebarVisibility,
} from "./sidebarStateModel.js";

export type SidebarEventId = string;
export type SidebarEventKind =
  | "command"
  | "edit"
  | "compact"
  | "memory"
  | "warmup"
  | "validation"
  | "tool"
  | "warning"
  | "blocker"
  | "route";
export type SidebarEventSeverity = SidebarSeverity;
export type SidebarEventVisibility = SidebarVisibility;
export type SidebarEventSource =
  | "slash-command"
  | "session-runtime"
  | "compact"
  | "memory"
  | "warmup"
  | "validation"
  | "tool-availability"
  | "route";

export interface SidebarEvent {
  readonly id: SidebarEventId;
  readonly kind: SidebarEventKind;
  readonly severity: SidebarEventSeverity;
  readonly visibility: SidebarEventVisibility;
  readonly source: SidebarEventSource;
  readonly timestamp?: string;
  readonly title: string;
  readonly summary: string;
  readonly references: readonly string[];
  readonly redactions: readonly string[];
  readonly nextAction?: string;
  readonly evidence: readonly string[];
}

export interface SidebarEventInput extends Omit<SidebarEvent, "id" | "references" | "redactions" | "evidence"> {
  readonly id?: SidebarEventId;
  readonly references?: readonly string[];
  readonly redactions?: readonly string[];
  readonly evidence?: readonly string[];
  readonly rawContent?: string;
}

export function createSidebarEvent(input: SidebarEventInput): SidebarEvent {
  const redactions = new Set(input.redactions ?? []);
  if (input.rawContent) {
    redactions.add("raw-event-content-excluded");
  }
  const title = sanitizeSidebarText(input.title, redactions, 100);
  const summary = sanitizeSidebarText(input.summary, redactions);
  const references = unique((input.references ?? []).map((item) => sanitizeSidebarText(item, redactions, 120)));
  const nextAction = input.nextAction
    ? sanitizeSidebarText(input.nextAction, redactions)
    : undefined;
  const id = input.id ?? eventId({
    kind: input.kind,
    source: input.source,
    timestamp: input.timestamp,
    title,
    summary,
  });
  return {
    id: normalizeId(id),
    kind: input.kind,
    severity: input.severity,
    visibility: input.visibility,
    source: input.source,
    timestamp: input.timestamp,
    title,
    summary,
    references,
    redactions: Array.from(redactions).sort(),
    nextAction,
    evidence: unique([
      ...(input.evidence ?? []),
      "sidebar-event-model:pure",
      "sidebar-event-model:no-persistence",
      "sidebar-event-model:no-provider-call",
    ].map((item) => sanitizeSidebarText(item, redactions, 120))),
  };
}

export function sidebarEventHasForbiddenContent(event: SidebarEvent): boolean {
  const encoded = JSON.stringify(event);
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(encoded) ||
    /\bRAW_[A-Z0-9_]+\b/.test(encoded) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(encoded)
  );
}

function eventId(input: {
  readonly kind: SidebarEventKind;
  readonly source: SidebarEventSource;
  readonly timestamp?: string;
  readonly title: string;
  readonly summary: string;
}): string {
  return `${input.kind}:${input.source}:${input.timestamp ?? "no-time"}:${input.title}:${input.summary.slice(0, 48)}`;
}

function normalizeId(value: string): string {
  return value.replace(/\s+/g, "-").replace(/[^A-Za-z0-9:._-]/g, "").trim() || "sidebar-event";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
