import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserDomSnapshot } from "./browserDomSnapshot.js";

export interface BrowserAccessibilityNodeInput {
  readonly role: string;
  readonly name?: string;
  readonly selector?: string;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
  readonly value?: string;
}

export interface BrowserAccessibilitySnapshot {
  readonly snapshotId: string;
  readonly roleTreeSummary: readonly string[];
  readonly landmarks: readonly string[];
  readonly interactiveElements: readonly BrowserAccessibilityElement[];
  readonly labels: readonly string[];
  readonly candidateActionTargets: readonly BrowserAccessibilityElement[];
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly rawAccessibilityStored: false;
}

export interface BrowserAccessibilityElement {
  readonly role: string;
  readonly name: string;
  readonly selectorSummary: string;
  readonly disabled: boolean;
  readonly hidden: boolean;
  readonly sensitive: boolean;
}

export function createBrowserAccessibilitySnapshot(input: {
  readonly snapshotId?: string;
  readonly nodes?: readonly BrowserAccessibilityNodeInput[];
  readonly domSnapshot?: BrowserDomSnapshot;
  readonly outputBudgetItems?: number;
}): BrowserAccessibilitySnapshot {
  const redactions = new Set<string>();
  const warnings = new Set<string>();
  const limit = Math.max(4, Math.min(40, input.outputBudgetItems ?? 24));
  const nodes = input.nodes ?? nodesFromDom(input.domSnapshot);
  const elements = nodes
    .map((node, index) => elementFromNode(node, index, redactions))
    .sort((left, right) => `${left.role}:${left.name}`.localeCompare(`${right.role}:${right.name}`))
    .slice(0, limit);
  if (nodes.length > limit) {
    warnings.add("accessibility-snapshot-truncated-to-budget");
  }
  const roleTreeSummary = elements
    .map((element) => `${element.role}${element.name ? ` "${element.name}"` : ""}${element.disabled ? " disabled" : ""}${element.hidden ? " hidden" : ""}`)
    .slice(0, limit);
  return {
    snapshotId: sanitizeId(input.snapshotId ?? "accessibility:snapshot"),
    roleTreeSummary,
    landmarks: elements.filter((element) => ["main", "navigation", "banner", "contentinfo"].includes(element.role)).map((element) => element.name || element.role),
    interactiveElements: elements.filter(isInteractive),
    labels: elements.map((element) => element.name).filter(Boolean).slice(0, limit),
    candidateActionTargets: elements.filter((element) => isInteractive(element) && !element.disabled && !element.hidden && !element.sensitive),
    redactions: Array.from(redactions).sort(),
    warnings: Array.from(warnings).sort(),
    rawAccessibilityStored: false,
  };
}

function nodesFromDom(domSnapshot: BrowserDomSnapshot | undefined): readonly BrowserAccessibilityNodeInput[] {
  if (!domSnapshot) {
    return [];
  }
  return [
    { role: "document", name: domSnapshot.title },
    ...domSnapshot.headings.map((name) => ({ role: "heading", name })),
    ...domSnapshot.links.map((link) => ({ role: "link", name: link.label, selector: link.selectorSummary })),
    ...domSnapshot.buttons.map((button) => ({ role: "button", name: button.label, selector: button.selectorSummary })),
    ...domSnapshot.inputs.map((input) => ({
      role: input.inputType === "password" ? "textbox" : "textbox",
      name: input.label,
      selector: input.selectorSummary,
      value: undefined,
    })),
  ];
}

function elementFromNode(
  node: BrowserAccessibilityNodeInput,
  index: number,
  redactions: Set<string>,
): BrowserAccessibilityElement {
  const rawName = node.name ?? "";
  const sensitive = /password|payment|credit|card|token|secret|api[_ -]?key/i.test(rawName);
  if (node.value) {
    redactions.add("user-entered-value");
  }
  if (sensitive) {
    redactions.add("sensitive-accessibility-label");
  }
  return {
    role: sanitizeBrowserText(node.role || "generic", 60).toLowerCase(),
    name: sensitive ? "[REDACTED_SENSITIVE_LABEL]" : sanitizeBrowserText(rawName, 140),
    selectorSummary: sanitizeBrowserText(node.selector ?? `${node.role || "node"}:nth(${index + 1})`, 100),
    disabled: node.disabled ?? false,
    hidden: node.hidden ?? false,
    sensitive,
  };
}

function isInteractive(element: BrowserAccessibilityElement): boolean {
  return ["button", "link", "textbox", "checkbox", "combobox", "radio", "menuitem"].includes(element.role);
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 140)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "accessibility:snapshot";
}
