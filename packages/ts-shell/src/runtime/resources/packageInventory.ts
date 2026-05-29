import {
  projectResourceTrustPolicy,
  type ResourceScope,
  type ResourceSourceKind,
  type ResourceTrustLevel,
  type ResourceTrustPolicyProjection,
} from "../../policy/resourceTrustPolicy.js";
import type { StaticResourceKind } from "./staticResourceDescriptor.js";

export type PackageEnablementState =
  | "enabled"
  | "disabled"
  | "blocked"
  | "requires_approval"
  | "unsupported"
  | "unknown";

export type PackagePinnedState = "pinned" | "unpinned" | "unknown";

export type PackageConflictKind =
  | "duplicate-package-id"
  | "duplicate-resource-id"
  | "capability-overlap"
  | "disabled-package-enabled-resource"
  | "blocked-package-available"
  | "unknown-trust-executable";

export interface PackageVersionMetadata {
  readonly exactVersion?: string;
  readonly versionRange?: string;
  readonly pinnedState: PackagePinnedState;
  readonly lockSource?: string;
  readonly integrity?: string;
  readonly notProvenClaims?: readonly string[];
}

export interface PackageResourceDeclaration {
  readonly resourceId: string;
  readonly kind: StaticResourceKind;
  readonly enablementState: PackageEnablementState;
  readonly precedence: number;
}

export interface PackageManifestContract {
  readonly packageId: string;
  readonly safeName: string;
  readonly version: PackageVersionMetadata;
  readonly sourceKind: ResourceSourceKind;
  readonly sourceLabel: string;
  readonly scope: ResourceScope;
  readonly trustLevel: ResourceTrustLevel;
  readonly enabledState: PackageEnablementState;
  readonly resourceIds: readonly string[];
  readonly resources?: readonly PackageResourceDeclaration[];
  readonly declaredCapabilities: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly executable: boolean;
  readonly supported: boolean;
  readonly notProvenClaims: readonly string[];
}

export interface PackageManifestProjection extends PackageManifestContract {
  readonly resources: readonly PackageResourceDeclaration[];
  readonly trust: ResourceTrustPolicyProjection;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
}

export type PackageManifestValidationResult =
  | {
      readonly ok: true;
      readonly manifest: PackageManifestProjection;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly redaction: {
        readonly status: "report-safe" | "redacted";
        readonly excluded: readonly string[];
      };
    };

export interface PackageConflictProjection {
  readonly conflictId: string;
  readonly kind: PackageConflictKind;
  readonly packageIds: readonly string[];
  readonly resourceIds: readonly string[];
  readonly capability?: string;
  readonly precedence: readonly {
    readonly packageId: string;
    readonly scope: ResourceScope;
    readonly precedence: number;
  }[];
  readonly policySuggestion: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface PackageInventoryProjection {
  readonly inventoryMode: "explicit-static";
  readonly packageInstallation: "disabled";
  readonly packageLoading: "disabled";
  readonly dynamicDiscovery: "disabled";
  readonly pluginExecution: "disabled";
  readonly scriptExecution: "disabled";
  readonly networkLookup: "disabled";
  readonly providerDefaultEnablement: "disabled";
  readonly packages: readonly PackageManifestProjection[];
  readonly rejectedPackageCount: number;
  readonly conflicts: readonly PackageConflictProjection[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function validatePackageManifest(
  manifest: PackageManifestContract,
): PackageManifestValidationResult {
  const sanitized = sanitizeManifest(manifest);
  const invalidReason = findInvalidManifestReason(sanitized.manifest);
  if (invalidReason) {
    return {
      ok: false,
      reason: invalidReason,
      redaction: sanitized.redaction,
    };
  }
  return {
    ok: true,
    manifest: deepFreeze(sanitized.manifest),
  };
}

export function projectPackageResourceInventory(input: {
  readonly manifests: readonly PackageManifestContract[];
}): PackageInventoryProjection {
  const packages: PackageManifestProjection[] = [];
  const redactionExclusions = new Set<string>();
  let redacted = false;
  let rejectedPackageCount = 0;

  for (const manifest of input.manifests) {
    const validation = validatePackageManifest(manifest);
    if (validation.ok === false) {
      rejectedPackageCount += 1;
      for (const excluded of validation.redaction.excluded) {
        redactionExclusions.add(excluded);
      }
      redacted = redacted || validation.redaction.status === "redacted";
      continue;
    }
    for (const excluded of validation.manifest.redaction.excluded) {
      redactionExclusions.add(excluded);
    }
    redacted = redacted || validation.manifest.redaction.status === "redacted";
    packages.push(validation.manifest);
  }

  return deepFreeze({
    inventoryMode: "explicit-static",
    packageInstallation: "disabled",
    packageLoading: "disabled",
    dynamicDiscovery: "disabled",
    pluginExecution: "disabled",
    scriptExecution: "disabled",
    networkLookup: "disabled",
    providerDefaultEnablement: "disabled",
    packages,
    rejectedPackageCount,
    conflicts: projectPackageConflicts(packages),
    redaction: {
      status: redacted ? "redacted" : "report-safe",
      excluded: Array.from(redactionExclusions).sort(),
    },
    terminalSuccessClaim: false,
    notProvenClaims: inventoryNotProvenClaims(packages),
  });
}

function findInvalidManifestReason(
  manifest: PackageManifestProjection,
): string | undefined {
  if (!manifest.packageId || !manifest.safeName) {
    return "package manifests require packageId and safeName";
  }
  if (!isEnablementState(manifest.enabledState)) {
    return "package manifest uses an unsupported enablement state";
  }
  if (!isPinnedState(manifest.version.pinnedState)) {
    return "package manifest uses an unsupported pinned state";
  }
  if (manifest.executable && manifest.supported) {
    return "package manifests cannot be both executable and supported by this runtime";
  }
  return undefined;
}

function sanitizeManifest(manifest: PackageManifestContract): {
  readonly manifest: PackageManifestProjection;
  readonly redaction: PackageManifestProjection["redaction"];
} {
  const redactions = new Set<string>();
  const resourceIds = unique([
    ...manifest.resourceIds.map((id) => sanitizeWithTracking(id, redactions, 120)),
    ...(manifest.resources ?? []).map((resource) =>
      sanitizeWithTracking(resource.resourceId, redactions, 120),
    ),
  ]);
  const resources = (manifest.resources ?? resourceIds.map((resourceId, index) => ({
    resourceId,
    kind: "package-metadata" as const,
    enablementState: manifest.enabledState,
    precedence: index,
  }))).map((resource, index) => ({
    resourceId: sanitizeWithTracking(resource.resourceId, redactions, 120),
    kind: resource.kind,
    enablementState: resource.enablementState,
    precedence: Number.isFinite(resource.precedence) ? resource.precedence : index,
  }));
  const trust = projectResourceTrustPolicy({
    sourceKind: manifest.sourceKind,
    sourceLabel: manifest.sourceLabel,
    scope: manifest.scope,
    trustLevel: manifest.trustLevel,
  });
  const version = sanitizeVersion(manifest.version, redactions);
  const notProvenClaims = unique([
    "package-install",
    "package-loading",
    "package-execution",
    "dynamic-discovery",
    "plugin-execution",
    "script-execution",
    "provider-enabled",
    "provider-success",
    "tool-success",
    "verification-success",
    "terminal-success",
    ...(version.notProvenClaims ?? []),
    ...trust.notProvenClaims,
    ...manifest.notProvenClaims,
  ]);

  const redactionStatus =
    redactions.size > 0 || trust.redaction.status === "redacted"
      ? "redacted"
      : "report-safe";

  return {
    manifest: {
      packageId: sanitizeWithTracking(manifest.packageId, redactions, 120),
      safeName: sanitizeWithTracking(manifest.safeName, redactions, 140),
      version,
      sourceKind: manifest.sourceKind,
      sourceLabel: sanitizeWithTracking(manifest.sourceLabel, redactions, 140),
      scope: manifest.scope,
      trustLevel: manifest.trustLevel,
      enabledState: manifest.enabledState,
      resourceIds,
      resources,
      declaredCapabilities: unique(
        manifest.declaredCapabilities.map((capability) =>
          sanitizeWithTracking(capability, redactions, 100),
        ),
      ),
      requiredPermissions: unique(
        manifest.requiredPermissions.map((permission) =>
          sanitizeWithTracking(permission, redactions, 100),
        ),
      ),
      executable: manifest.executable,
      supported: manifest.supported,
      trust,
      redaction: {
        status: redactionStatus,
        excluded: REDACTION_EXCLUSIONS,
      },
      terminalSuccessClaim: false,
      notProvenClaims,
    },
    redaction: {
      status: redactionStatus,
      excluded: REDACTION_EXCLUSIONS,
    },
  };
}

function sanitizeVersion(
  version: PackageVersionMetadata,
  redactions: Set<string>,
): PackageVersionMetadata {
  const integrity = version.integrity
    ? sanitizeWithTracking(version.integrity, redactions, 160)
    : undefined;
  return {
    ...(version.exactVersion
      ? { exactVersion: sanitizeWithTracking(version.exactVersion, redactions, 80) }
      : {}),
    ...(version.versionRange
      ? { versionRange: sanitizeWithTracking(version.versionRange, redactions, 80) }
      : {}),
    pinnedState: version.pinnedState,
    ...(version.lockSource
      ? { lockSource: sanitizeWithTracking(version.lockSource, redactions, 120) }
      : {}),
    ...(integrity ? { integrity } : {}),
    notProvenClaims: unique([
      ...(version.notProvenClaims ?? []),
      ...(integrity ? [] : ["package-integrity"]),
      ...(version.pinnedState === "pinned" ? [] : ["version-resolution"]),
    ]),
  };
}

function projectPackageConflicts(
  packages: readonly PackageManifestProjection[],
): readonly PackageConflictProjection[] {
  const conflicts: PackageConflictProjection[] = [];
  const byPackageId = groupBy(packages, (manifest) => manifest.packageId);
  for (const [packageId, matches] of byPackageId) {
    if (matches.length > 1) {
      conflicts.push(conflict({
        kind: "duplicate-package-id",
        packageIds: matches.map((manifest) => manifest.packageId),
        resourceIds: [],
        policySuggestion: `Review duplicate package id '${packageId}' before enabling resources.`,
        precedence: matches.map((manifest, index) => precedenceFor(manifest, index)),
      }));
    }
  }

  const byResourceId = new Map<string, PackageManifestProjection[]>();
  for (const manifest of packages) {
    for (const resource of manifest.resources) {
      const matches = byResourceId.get(resource.resourceId) ?? [];
      matches.push(manifest);
      byResourceId.set(resource.resourceId, matches);
      if (
        manifest.enabledState === "disabled" &&
        resource.enablementState === "enabled"
      ) {
        conflicts.push(conflict({
          kind: "disabled-package-enabled-resource",
          packageIds: [manifest.packageId],
          resourceIds: [resource.resourceId],
          policySuggestion: "Keep the resource inert until the package enablement policy is explicit.",
          precedence: [precedenceFor(manifest, resource.precedence)],
        }));
      }
    }
    if (manifest.enabledState === "blocked") {
      conflicts.push(conflict({
        kind: "blocked-package-available",
        packageIds: [manifest.packageId],
        resourceIds: manifest.resourceIds,
        policySuggestion: "Do not expose blocked package resources as available.",
        precedence: [precedenceFor(manifest, 0)],
      }));
    }
    if (manifest.trustLevel === "unknown" && manifest.executable) {
      conflicts.push(conflict({
        kind: "unknown-trust-executable",
        packageIds: [manifest.packageId],
        resourceIds: manifest.resourceIds,
        policySuggestion: "Require explicit trust review before any executable package can be considered.",
        precedence: [precedenceFor(manifest, 0)],
      }));
    }
  }

  for (const [resourceId, matches] of byResourceId) {
    if (matches.length > 1) {
      conflicts.push(conflict({
        kind: "duplicate-resource-id",
        packageIds: matches.map((manifest) => manifest.packageId),
        resourceIds: [resourceId],
        policySuggestion: `Resolve duplicate resource id '${resourceId}' by explicit precedence.`,
        precedence: matches.map((manifest, index) => precedenceFor(manifest, index)),
      }));
    }
  }

  const capabilityMap = new Map<string, PackageManifestProjection[]>();
  for (const manifest of packages) {
    for (const capability of manifest.declaredCapabilities) {
      const matches = capabilityMap.get(capability) ?? [];
      matches.push(manifest);
      capabilityMap.set(capability, matches);
    }
  }
  for (const [capability, matches] of capabilityMap) {
    if (matches.length > 1) {
      conflicts.push(conflict({
        kind: "capability-overlap",
        packageIds: matches.map((manifest) => manifest.packageId),
        resourceIds: matches.flatMap((manifest) => manifest.resourceIds),
        capability,
        policySuggestion: `Multiple packages declare capability '${capability}'; choose precedence before enablement.`,
        precedence: matches.map((manifest, index) => precedenceFor(manifest, index)),
      }));
    }
  }

  return conflicts;
}

function conflict(input: {
  readonly kind: PackageConflictKind;
  readonly packageIds: readonly string[];
  readonly resourceIds: readonly string[];
  readonly capability?: string;
  readonly policySuggestion: string;
  readonly precedence: PackageConflictProjection["precedence"];
}): PackageConflictProjection {
  return {
    conflictId: stableId("package-conflict", [
      input.kind,
      ...input.packageIds,
      ...input.resourceIds,
      input.capability ?? "",
    ]),
    kind: input.kind,
    packageIds: unique(input.packageIds),
    resourceIds: unique(input.resourceIds),
    ...(input.capability ? { capability: input.capability } : {}),
    precedence: input.precedence,
    policySuggestion: input.policySuggestion,
    terminalSuccessClaim: false,
    notProvenClaims: [
      "package-conflict-resolution",
      "package-loading",
      "plugin-execution",
      "terminal-success",
    ],
  };
}

function precedenceFor(
  manifest: PackageManifestProjection,
  precedence: number,
): PackageConflictProjection["precedence"][number] {
  return {
    packageId: manifest.packageId,
    scope: manifest.scope,
    precedence,
  };
}

function inventoryNotProvenClaims(
  packages: readonly PackageManifestProjection[],
): readonly string[] {
  return unique([
    "package-install",
    "package-loading",
    "package-execution",
    "dynamic-discovery",
    "plugin-execution",
    "script-execution",
    "provider-enabled",
    "provider-success",
    "tool-success",
    "verification-success",
    "terminal-success",
    ...packages.flatMap((manifest) => manifest.notProvenClaims),
  ]);
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider-env",
  "auth-headers",
  "provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
  "install-scripts",
  "executable-plugin-code",
] as const;

function isEnablementState(value: string): value is PackageEnablementState {
  return [
    "enabled",
    "disabled",
    "blocked",
    "requires_approval",
    "unsupported",
    "unknown",
  ].includes(value);
}

function isPinnedState(value: string): value is PackagePinnedState {
  return ["pinned", "unpinned", "unknown"].includes(value);
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const matches = grouped.get(key) ?? [];
    matches.push(value);
    grouped.set(key, matches);
  }
  return grouped;
}

function sanitizeWithTracking(
  value: string,
  redactions: Set<string>,
  maxLength: number,
): string {
  const sanitized = sanitizeText(value).value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  if (sanitizeText(value).redacted) {
    redactions.add("unsafe-content-redacted");
  }
  if (value.length > maxLength) {
    redactions.add("output-truncated");
  }
  return sanitized;
}

function sanitizeText(input: string): {
  readonly value: string;
  readonly redacted: boolean;
} {
  let value = input;
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]");
  value = value.replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]");
  value = value.replace(/\bauthorization[:=][^\s;,)]+/gi, "authorization=[secret-redacted]");
  value = value.replace(/\bapi[_-]?key[:=][^\s;,)]+/gi, "apiKey=[secret-redacted]");
  value = value.replace(/\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi, "authHeader=[secret-redacted]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider-env=[redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/\b(?:install script|postinstall|preinstall)[:=]?[^\n\r]*/gi, "install-script=[raw-content-excluded]");
  value = value.replace(/\bnpm\s+install\b[^\n\r]*/gi, "install-script=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function stableId(prefix: string, parts: readonly string[]): string {
  const suffix = parts
    .join(":")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return suffix ? `${prefix}:${suffix}` : prefix;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
