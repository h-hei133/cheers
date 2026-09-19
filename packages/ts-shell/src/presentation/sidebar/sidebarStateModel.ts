import { redactUnsafeReportText } from "../../core/security/reportText.js";

export const SIDEBAR_STATE_SNAPSHOT_VERSION = "sidebar-state-v1" as const;

export type SidebarSection =
  | "task-route"
  | "edit"
  | "compact"
  | "memory"
  | "warmup"
  | "validation"
  | "tools"
  | "blockers"
  | "next-action";

export type SidebarSeverity = "info" | "success" | "warning" | "blocked" | "error";
export type SidebarFactKind = "status" | "evidence" | "warning" | "action" | "reference";
export type SidebarVisibility = "user-visible" | "developer-only" | "hidden";
export type SidebarSource =
  | "edit-closeout"
  | "compact"
  | "memory"
  | "warmup"
  | "validation"
  | "command"
  | "tool-availability"
  | "route";

export interface SidebarFact {
  readonly id: string;
  readonly section: SidebarSection;
  readonly severity: SidebarSeverity;
  readonly kind: SidebarFactKind;
  readonly visibility: SidebarVisibility;
  readonly source: SidebarSource;
  readonly label: string;
  readonly summary: string;
  readonly evidence: readonly string[];
}

export interface SidebarNotice {
  readonly id: string;
  readonly severity: Extract<SidebarSeverity, "warning" | "blocked" | "error">;
  readonly message: string;
  readonly source: SidebarSource;
  readonly evidence: readonly string[];
}

export interface SidebarNextAction {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly source: SidebarSource;
  readonly evidence: readonly string[];
}

export interface SidebarActivityItem {
  readonly id: string;
  readonly timestamp?: string;
  readonly kind: string;
  readonly severity: SidebarSeverity;
  readonly source: string;
  readonly title: string;
  readonly summary: string;
  readonly nextAction?: string;
  readonly evidence: readonly string[];
}

export interface SidebarRecentActivity {
  readonly events: readonly SidebarActivityItem[];
  readonly maxVisibleEvents: number;
  readonly droppedEventCount: number;
  readonly dedupedEventCount: number;
  readonly hasHiddenDeveloperEvents: boolean;
  readonly latestNextAction?: string;
  readonly evidence: readonly string[];
}

export interface SidebarStateSnapshot {
  readonly snapshotVersion: typeof SIDEBAR_STATE_SNAPSHOT_VERSION;
  readonly generatedAt?: string;
  readonly title: string;
  readonly facts: readonly SidebarFact[];
  readonly notices: readonly SidebarNotice[];
  readonly nextActions: readonly SidebarNextAction[];
  readonly recentActivity?: SidebarRecentActivity;
  readonly redactions: readonly string[];
  readonly safety: {
    readonly readOnly: true;
    readonly actualSidebarUi: false;
    readonly dynamicDiscovery: false;
    readonly providerCall: "none";
    readonly modelCall: "none";
    readonly persistence: "none";
    readonly automaticMemoryInjection: false;
    readonly startupAutoLoad: false;
    readonly rawContent: "excluded";
  };
  readonly evidence: readonly string[];
}

export interface SidebarStateSnapshotInput {
  readonly generatedAt?: string;
  readonly title?: string;
  readonly facts?: readonly SidebarFact[];
  readonly notices?: readonly SidebarNotice[];
  readonly nextActions?: readonly SidebarNextAction[];
  readonly recentActivity?: SidebarRecentActivity;
  readonly redactions?: readonly string[];
  readonly evidence?: readonly string[];
}

export function createSidebarFact(input: SidebarFact): SidebarFact {
  const redactions = new Set<string>();
  return {
    ...input,
    id: normalizeToken(input.id, "sidebar-fact"),
    label: redactUnsafeReportText(input.label, redactions, 80),
    summary: redactUnsafeReportText(input.summary, redactions),
    evidence: unique(input.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

export function createSidebarNotice(input: SidebarNotice): SidebarNotice {
  const redactions = new Set<string>();
  return {
    ...input,
    id: normalizeToken(input.id, "sidebar-notice"),
    message: redactUnsafeReportText(input.message, redactions),
    evidence: unique(input.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

export function createSidebarNextAction(input: SidebarNextAction): SidebarNextAction {
  const redactions = new Set<string>();
  return {
    ...input,
    id: normalizeToken(input.id, "sidebar-action"),
    label: redactUnsafeReportText(input.label, redactions, 80),
    summary: redactUnsafeReportText(input.summary, redactions),
    evidence: unique(input.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

export function createSidebarStateSnapshot(
  input: SidebarStateSnapshotInput = {},
): SidebarStateSnapshot {
  const redactions = new Set(input.redactions ?? []);
  const facts = uniqueById(
    (input.facts ?? []).map((fact) => sanitizeFact(fact, redactions)),
  );
  const notices = uniqueById(
    (input.notices ?? []).map((notice) => sanitizeNotice(notice, redactions)),
  );
  const nextActions = uniqueById(
    (input.nextActions ?? []).map((action) => sanitizeNextAction(action, redactions)),
  );
  const recentActivity = input.recentActivity
    ? sanitizeRecentActivity(input.recentActivity, redactions)
    : undefined;
  return {
    snapshotVersion: SIDEBAR_STATE_SNAPSHOT_VERSION,
    generatedAt: input.generatedAt,
    title: redactUnsafeReportText(input.title ?? "Visible agent state", redactions, 120),
    facts,
    notices,
    nextActions,
    recentActivity,
    redactions: Array.from(redactions).sort(),
    safety: {
      readOnly: true,
      actualSidebarUi: false,
      dynamicDiscovery: false,
      providerCall: "none",
      modelCall: "none",
      persistence: "none",
      automaticMemoryInjection: false,
      startupAutoLoad: false,
      rawContent: "excluded",
    },
    evidence: unique([
      ...(input.evidence ?? []),
      "sidebar-state-model:pure",
      "sidebar-state-model:read-only",
      "sidebar-state-model:no-persistence",
      "sidebar-state-model:no-provider-or-model-call",
      "sidebar-state-model:no-dynamic-discovery",
    ].map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

export function sidebarFactsForSection(
  snapshot: SidebarStateSnapshot,
  section: SidebarSection,
  visibility: SidebarVisibility = "user-visible",
): readonly SidebarFact[] {
  return snapshot.facts.filter(
    (fact) => fact.section === section && fact.visibility === visibility,
  );
}

export function sidebarTextHasForbiddenContent(value: string): boolean {
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value)
  );
}

function sanitizeFact(fact: SidebarFact, redactions: Set<string>): SidebarFact {
  return {
    ...fact,
    id: normalizeToken(fact.id, "sidebar-fact"),
    label: redactUnsafeReportText(fact.label, redactions, 80),
    summary: redactUnsafeReportText(fact.summary, redactions),
    evidence: unique(fact.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

function sanitizeNotice(notice: SidebarNotice, redactions: Set<string>): SidebarNotice {
  return {
    ...notice,
    id: normalizeToken(notice.id, "sidebar-notice"),
    message: redactUnsafeReportText(notice.message, redactions),
    evidence: unique(notice.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

function sanitizeNextAction(
  action: SidebarNextAction,
  redactions: Set<string>,
): SidebarNextAction {
  return {
    ...action,
    id: normalizeToken(action.id, "sidebar-action"),
    label: redactUnsafeReportText(action.label, redactions, 80),
    summary: redactUnsafeReportText(action.summary, redactions),
    evidence: unique(action.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

function sanitizeRecentActivity(
  activity: SidebarRecentActivity,
  redactions: Set<string>,
): SidebarRecentActivity {
  return {
    ...activity,
    events: uniqueById(activity.events.map((event) => ({
      ...event,
      id: normalizeToken(event.id, "sidebar-activity"),
      kind: redactUnsafeReportText(event.kind, redactions, 80),
      source: redactUnsafeReportText(event.source, redactions, 80),
      title: redactUnsafeReportText(event.title, redactions, 100),
      summary: redactUnsafeReportText(event.summary, redactions),
      nextAction: event.nextAction
        ? redactUnsafeReportText(event.nextAction, redactions)
        : undefined,
      evidence: unique(event.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
    }))),
    latestNextAction: activity.latestNextAction
      ? redactUnsafeReportText(activity.latestNextAction, redactions)
      : undefined,
    evidence: unique(activity.evidence.map((item) => redactUnsafeReportText(item, redactions, 120))),
  };
}

function normalizeToken(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, "-").replace(/[^A-Za-z0-9:._-]/g, "").trim();
  return normalized || fallback;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueById<T extends { readonly id: string }>(values: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value.id)) {
      continue;
    }
    seen.add(value.id);
    result.push(value);
  }
  return result;
}
