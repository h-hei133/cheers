import fs from "node:fs";
import path from "node:path";
import {
  BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION,
  serializeBrowserExternalRunnerManifest,
  validateBrowserExternalRunnerManifest,
  type BrowserExternalRunnerManifest,
} from "./runtime/external/manifest.js";
import {
  BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION,
  serializeBrowserLocalFixtureManifest,
  validateBrowserLocalFixtureManifest,
  type BrowserLocalFixtureManifest,
} from "./browserLocalFixtureManifest.js";
import { createBrowserSkillRunnerBinding } from "./skill/runner/binding.js";
import { createBrowserSkillRunnerMetadata } from "./skill/runner/metadata.js";
import {
  createBrowserSelfHealingManifestPatch,
  type BrowserSelfHealingManifestKind,
  type BrowserSelfHealingManifestPatch,
  type BrowserSelfHealingManifestPatchKind,
} from "./browserSelfHealingManifestPatch.js";
import { decideBrowserSelfHealingManifestPatchPolicy } from "./browserSelfHealingManifestPatchPolicy.js";

export interface BrowserSelfHealingManifestPatchWriteResult {
  readonly patch: BrowserSelfHealingManifestPatch;
  readonly status: "applied" | "blocked";
  readonly manifestPatchStatus: string;
  readonly manifestKind: BrowserSelfHealingManifestKind;
  readonly applied: boolean;
  readonly changedSummary: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly browserExecuted: false;
  readonly replayExecuted: false;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function writeBrowserSelfHealingManifestPatch(input: {
  readonly proposalId: string;
  readonly patchKind: BrowserSelfHealingManifestPatchKind;
  readonly manifestPath?: string;
  readonly requestedOrigin?: string;
  readonly fixtureSummary?: string;
  readonly now?: () => string;
}): BrowserSelfHealingManifestPatchWriteResult {
  const policy = decideBrowserSelfHealingManifestPatchPolicy(input);
  if (!policy.allowed || !input.manifestPath) {
    const patch = createBrowserSelfHealingManifestPatch({
      proposalId: input.proposalId,
      patchKind: input.patchKind,
      manifestPath: input.manifestPath,
      blockers: policy.blockers,
      warnings: policy.warnings,
    });
    return blocked(patch, policy.status, "unknown", policy.blockers, policy.warnings, policy.nextAction, policy.evidence);
  }
  const loaded = loadManifest(input.manifestPath);
  if (loaded.ok === false) {
    const patch = createBrowserSelfHealingManifestPatch({
      proposalId: input.proposalId,
      patchKind: input.patchKind,
      manifestPath: input.manifestPath,
      targetManifestKind: "unknown",
      blockers: [loaded.reason],
    });
    return blocked(patch, "patch-blocked-unsupported", "unknown", [loaded.reason], [], "Provide a supported valid local/test manifest.", loaded.evidence);
  }
  const patch = createBrowserSelfHealingManifestPatch({
    proposalId: input.proposalId,
    patchKind: input.patchKind,
    manifestPath: input.manifestPath,
    targetManifestKind: loaded.kind,
  });
  const patched = patchManifest(loaded, input);
  if (patched.ok === false) {
    return blocked(patch, "patch-blocked-unsupported", loaded.kind, [patched.reason], [], patched.nextAction, patched.evidence);
  }
  const tempPath = `${input.manifestPath}.tmp-${(input.now?.() ?? new Date().toISOString()).replace(/[^0-9A-Za-z_-]+/g, "-")}`;
  fs.writeFileSync(tempPath, patched.serialized, "utf8");
  fs.renameSync(tempPath, input.manifestPath);
  return {
    patch,
    status: "applied",
    manifestPatchStatus: "patch-allowed",
    manifestKind: loaded.kind,
    applied: true,
    changedSummary: patched.summary,
    blockers: [],
    warnings: patched.warnings,
    browserExecuted: false,
    replayExecuted: false,
    nextAction: "Run /browser replay <receipt-id> explicitly after reviewing the manifest patch.",
    evidence: [
      ...policy.evidence,
      ...loaded.evidence,
      ...patched.evidence,
      "browser-self-healing-manifest-patch-writer:validated-before-write",
      "browser-self-healing-manifest-patch-writer:validated-after-write",
      "browser-self-healing-manifest-patch-writer:atomic-rename",
      "browser-self-healing-manifest-patch-writer:no-browser-execution",
      "browser-self-healing-manifest-patch-writer:no-automatic-replay",
    ],
  };
}

type LoadedManifest =
  | {
      readonly ok: true;
      readonly kind: "external-runner";
      readonly manifest: BrowserExternalRunnerManifest;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: true;
      readonly kind: "local-fixture";
      readonly manifest: BrowserLocalFixtureManifest;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
    };

function loadManifest(manifestPath: string): LoadedManifest {
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (value.manifestVersion === BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION) {
      const validated = validateBrowserExternalRunnerManifest(value);
      if (validated.ok === true) {
        return { ok: true, kind: "external-runner", manifest: validated.manifest, evidence: validated.evidence };
      }
      return { ok: false, reason: validated.reason, evidence: validated.evidence };
    }
    if (value.version === BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION) {
      const validated = validateBrowserLocalFixtureManifest(value);
      if (validated.ok === true) {
        return { ok: true, kind: "local-fixture", manifest: validated.manifest, evidence: validated.evidence };
      }
      return { ok: false, reason: validated.reason, evidence: validated.evidence };
    }
    return { ok: false, reason: "Unsupported manifest kind.", evidence: ["browser-self-healing-manifest-patch-writer:unsupported-manifest"] };
  } catch {
    return { ok: false, reason: "Manifest could not be read or parsed.", evidence: ["browser-self-healing-manifest-patch-writer:manifest-read-failed"] };
  }
}

function patchManifest(
  loaded: Extract<LoadedManifest, { ok: true }>,
  input: {
    readonly patchKind: BrowserSelfHealingManifestPatchKind;
    readonly requestedOrigin?: string;
    readonly fixtureSummary?: string;
  },
):
  | { readonly ok: true; readonly serialized: string; readonly summary: string; readonly warnings: readonly string[]; readonly evidence: readonly string[] }
  | { readonly ok: false; readonly reason: string; readonly nextAction: string; readonly evidence: readonly string[] } {
  if (loaded.kind === "external-runner") {
    return patchExternalRunnerManifest(loaded.manifest, input);
  }
  return patchLocalFixtureManifest(loaded.manifest, input);
}

function patchExternalRunnerManifest(
  manifest: BrowserExternalRunnerManifest,
  input: { readonly patchKind: BrowserSelfHealingManifestPatchKind },
) {
  if (input.patchKind === "add-runner-binding") {
    const patched: BrowserExternalRunnerManifest = {
      ...manifest,
      runnerRef: manifest.runnerRef ?? manifest.runnerId,
      warnings: unique([...manifest.warnings, "self-healing-manifest-patch:runner-binding"]),
    };
    return validateExternalPatched(patched, "runner binding metadata patched");
  }
  if (input.patchKind === "add-skill-metadata") {
    const metadata = createBrowserSkillRunnerMetadata({
      runnerId: manifest.runnerId,
      skillId: manifest.runnerId,
      skillName: "Self-healing browser runner metadata",
      actions: manifest.allowedActions,
      warnings: ["self-healing-manifest-patch:skill-metadata"],
    });
    const patched: BrowserExternalRunnerManifest = {
      ...manifest,
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerRef: manifest.runnerRef ?? manifest.runnerId,
      skillRunnerMetadata: metadata,
      skillRunnerBinding: manifest.runnerCommand
        ? createBrowserSkillRunnerBinding({
            metadata,
            runnerCommand: manifest.runnerCommand,
            runnerRef: manifest.runnerRef ?? manifest.runnerId,
          })
        : undefined,
      warnings: unique([...manifest.warnings, "self-healing-manifest-patch:skill-metadata"]),
    };
    return validateExternalPatched(patched, "skill metadata patched");
  }
  return { ok: false as const, reason: "Patch kind is not supported for external runner manifests.", nextAction: "Use an external runner manifest for runner or skill metadata patches.", evidence: ["browser-self-healing-manifest-patch-writer:external-kind-blocked"] };
}

function patchLocalFixtureManifest(
  manifest: BrowserLocalFixtureManifest,
  input: {
    readonly patchKind: BrowserSelfHealingManifestPatchKind;
    readonly requestedOrigin?: string;
    readonly fixtureSummary?: string;
  },
) {
  if (input.patchKind === "update-allowlist-local-fixture") {
    const origin = input.requestedOrigin ?? manifest.fixtures[0]?.url ?? "local-fixture://route114-patched";
    const patched: BrowserLocalFixtureManifest = {
      ...manifest,
      allowedLocalOrigins: unique([...manifest.allowedLocalOrigins, origin]),
      warnings: unique([...manifest.warnings, "self-healing-manifest-patch:allowlist-local-fixture"]),
    };
    return validateLocalFixturePatched(patched, "local fixture allowlist patched");
  }
  if (input.patchKind === "refresh-fixture-summary") {
    const fixture = manifest.fixtures[0];
    const patched: BrowserLocalFixtureManifest = {
      ...manifest,
      fixtures: [{
        ...fixture,
        textSummary: input.fixtureSummary ?? "Route 114 refreshed sanitized fixture summary.",
      }],
      warnings: unique([...manifest.warnings, "self-healing-manifest-patch:fixture-summary"]),
    };
    return validateLocalFixturePatched(patched, "fixture summary refreshed");
  }
  return { ok: false as const, reason: "Patch kind is not supported for local fixture manifests.", nextAction: "Use a local fixture manifest for allowlist or fixture patches.", evidence: ["browser-self-healing-manifest-patch-writer:local-fixture-kind-blocked"] };
}

function validateExternalPatched(manifest: BrowserExternalRunnerManifest, summary: string) {
  const validated = validateBrowserExternalRunnerManifest(manifest);
  if (validated.ok === false) {
    return { ok: false as const, reason: validated.reason, nextAction: "Fix the explicit external runner manifest before patching.", evidence: validated.evidence };
  }
  return {
    ok: true as const,
    serialized: serializeBrowserExternalRunnerManifest(validated.manifest),
    summary,
    warnings: validated.warnings,
    evidence: validated.evidence,
  };
}

function validateLocalFixturePatched(manifest: BrowserLocalFixtureManifest, summary: string) {
  const validated = validateBrowserLocalFixtureManifest(manifest);
  if (validated.ok === false) {
    return { ok: false as const, reason: validated.reason, nextAction: "Fix the explicit local fixture manifest before patching.", evidence: validated.evidence };
  }
  return {
    ok: true as const,
    serialized: serializeBrowserLocalFixtureManifest(validated.manifest),
    summary,
    warnings: validated.warnings,
    evidence: validated.evidence,
  };
}

function blocked(
  patch: BrowserSelfHealingManifestPatch,
  manifestPatchStatus: string,
  manifestKind: BrowserSelfHealingManifestKind,
  blockers: readonly string[],
  warnings: readonly string[],
  nextAction: string,
  evidence: readonly string[],
): BrowserSelfHealingManifestPatchWriteResult {
  return {
    patch,
    status: "blocked",
    manifestPatchStatus,
    manifestKind,
    applied: false,
    changedSummary: "none",
    blockers,
    warnings,
    browserExecuted: false,
    replayExecuted: false,
    nextAction,
    evidence: [
      ...patch.evidence,
      ...evidence,
      "browser-self-healing-manifest-patch-writer:blocked",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
