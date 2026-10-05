import { parsePermissionsArgs, permissionsSyntax } from "../core/commands/permissions/syntax.js";
import { syntaxHelp } from "../core/commands/syntax/projection.js";
import path from "node:path";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import { renderProjectedLines } from "../cli/output/projectedLineRenderer.js";
import {
  projectPermissionListDisplay,
} from "./cliDisplayProjection.js";

export function runCliPermissionCommand(input: {
  readonly renderer: StreamingRenderer;
  readonly trustPolicy: ApprovalTrustPolicy;
  readonly projectRoot: string;
  readonly permissionAction?: "list" | "explain" | "revoke" | "reset";
  readonly permissionSelector?: string;
}): void {
  const permissionAction = input.permissionAction ?? "list";
  const parsed = parsePermissionsArgs([permissionAction, ...(input.permissionSelector === undefined ? [] : [input.permissionSelector])]);
  if (!parsed.ok) {
    input.renderer.renderLine(`Invalid /permissions arguments: ${parsed.reason}\n${syntaxHelp(permissionsSyntax)}`);
    return;
  }
  if (permissionAction === "list") {
    renderPermissionsList(input.renderer, input.trustPolicy, input.projectRoot);
    return;
  }

  if (permissionAction === "explain") {
    renderPermissionExplain(input.renderer, input.trustPolicy, input.projectRoot);
    return;
  }

  if (permissionAction === "revoke") {
    const selector = input.permissionSelector?.trim();
    if (!selector) {
      input.renderer.renderLine("\nUsage: /permissions revoke <index|scope-key>\n");
      return;
    }
    const revokeResult = input.trustPolicy.revokeGrant(
      input.projectRoot,
      selector,
    );
    if (revokeResult.removed > 0) {
      input.renderer.renderLine(
        `\nRemoved trust grant: ${revokeResult.removedGrant?.scopeLabel ?? selector}\n`,
      );
    } else {
      input.renderer.renderLine(
        `\nNo trust grant matched selector "${selector}" in current project.\n`,
      );
    }
    return;
  }

  if (permissionAction === "reset") {
    const selector = input.permissionSelector?.trim().toLowerCase();
    if (selector === "all") {
      const resetAll = input.trustPolicy.resetAll();
      input.renderer.renderLine(
        `\nReset all persisted trust grants (${resetAll.removed} removed).\n`,
      );
      return;
    }
    const resetProject = input.trustPolicy.resetProject(input.projectRoot);
    input.renderer.renderLine(
      `\nReset current project trust grants (${resetProject.removed} removed).\n`,
    );
  }
}

function renderPermissionsList(
  renderer: StreamingRenderer,
  trustPolicy: ApprovalTrustPolicy,
  projectRoot: string,
): void {
  const grants = trustPolicy.listGrants(projectRoot);
  const projection = projectPermissionListDisplay({
    projectRoot,
    grantCount: grants.length,
  });
  const projectLabel = projection.projectLabel;
  renderer.renderLine(`\nTrust policy grants @ ${projectLabel}`);
  if (grants.length === 0) {
    renderProjectedLines(renderer, projection.emptyLines ?? []);
    return;
  }

  for (const [index, grant] of grants.entries()) {
    renderer.renderLine(
      `${index + 1}. ${grant.scopeLabel}  updated=${toRelativeTime(grant.updatedAt)}  key=${grant.scopeKey}`,
    );
  }
  renderer.renderLine(
    "Tip: /permissions revoke <index|scope-key> removes one rule, /permissions reset clears project rules.\n",
  );
}

function renderPermissionExplain(
  renderer: StreamingRenderer,
  trustPolicy: ApprovalTrustPolicy,
  projectRoot: string,
): void {
  const lastHit = trustPolicy.getLastHit();
  renderer.renderLine("\nTrust policy explain");
  if (!lastHit) {
    renderer.renderLine(
      "- No automatic approval hit has occurred in this shell yet.",
    );
    renderer.renderLine(
      "- After a cached allow or policy match, run /permissions explain again.",
    );
    renderer.renderLine("");
    return;
  }

  const sourceLabel =
    lastHit.source === "allow-always-policy"
      ? "persisted allow-always policy"
      : "allow-once cache (current shell run)";
  renderer.renderLine(`- Last hit source: ${sourceLabel}`);
  renderer.renderLine(`- Scope: ${lastHit.scopeLabel}`);
  renderer.renderLine(`- Rule key: ${lastHit.cacheKey}`);
  renderer.renderLine(
    `- Project match: ${normalizePathForCompare(lastHit.projectRoot) === normalizePathForCompare(projectRoot) ? "current project" : "different project"}`,
  );
  renderer.renderLine(`- When: ${toRelativeTime(lastHit.at)}`);
  renderer.renderLine("");
}

function toRelativeTime(iso: string): string {
  const updatedAt = new Date(iso).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}
