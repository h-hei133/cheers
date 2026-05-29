import {
  type StaticResourceDescriptor,
  validateStaticResourceDescriptor,
} from "./staticResourceDescriptor.js";

export interface StaticResourceSummary {
  readonly id: string;
  readonly kind: StaticResourceDescriptor["kind"];
  readonly name: string;
  readonly description: string;
  readonly ownerDomain: string;
  readonly visibility: StaticResourceDescriptor["visibility"];
  readonly sourceType: StaticResourceDescriptor["sourceType"];
  readonly enabledByDefault: false;
  readonly requiresOptIn: boolean;
  readonly capabilitiesSummary: readonly string[];
  readonly riskLevel: StaticResourceDescriptor["riskLevel"];
  readonly provider?: {
    readonly providerLabel: string;
    readonly modelLabel?: string;
    readonly endpointClass?: string;
    readonly capabilityFlags: readonly string[];
    readonly defaultEnabled: false;
    readonly requiresOptIn: true;
  };
  readonly extension?: {
    readonly extensionId: string;
    readonly capabilities: readonly string[];
    readonly lifecycleEvents: readonly string[];
    readonly hookEffects: readonly string[];
    readonly toolKinds: readonly string[];
    readonly requiredPermissions: readonly string[];
    readonly executable: false;
    readonly supported: false;
  };
  readonly notProvenClaims: readonly string[];
}

export interface StaticResourceProjection {
  readonly registryMode: "explicit-static";
  readonly dynamicDiscovery: "disabled";
  readonly packageLoading: "disabled";
  readonly pluginExecution: "disabled";
  readonly providerDefaultEnablement: "disabled";
  readonly resources: readonly StaticResourceSummary[];
  readonly rejectedResourceCount: number;
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export function projectStaticResourceRegistry(input: {
  readonly descriptors: readonly StaticResourceDescriptor[];
}): StaticResourceProjection {
  const summaries: StaticResourceSummary[] = [];
  let rejectedResourceCount = 0;
  let redacted = false;
  const redactionExclusions = new Set<string>();

  for (const descriptor of input.descriptors) {
    const validation = validateStaticResourceDescriptor(descriptor);
    for (const excluded of validation.redaction.excluded) {
      redactionExclusions.add(excluded);
    }
    redacted = redacted || validation.redaction.status === "redacted";
    if (!validation.ok) {
      rejectedResourceCount += 1;
      continue;
    }
    summaries.push(toSummary(validation.descriptor));
  }

  return deepFreeze({
    registryMode: "explicit-static",
    dynamicDiscovery: "disabled",
    packageLoading: "disabled",
    pluginExecution: "disabled",
    providerDefaultEnablement: "disabled",
    resources: summaries,
    rejectedResourceCount,
    notProvenClaims: [
      "resource-execution",
      "dynamic-discovery",
      "package-loading",
      "plugin-execution",
      "provider-enabled",
      "provider-success",
      "tool-success",
      "verification-success",
      "terminal-success",
    ],
    redaction: {
      status: redacted ? "redacted" : "report-safe",
      excluded: [...redactionExclusions].sort(),
    },
  });
}

function toSummary(descriptor: StaticResourceDescriptor): StaticResourceSummary {
  return {
    id: descriptor.id,
    kind: descriptor.kind,
    name: descriptor.name,
    description: descriptor.description,
    ownerDomain: descriptor.ownerDomain,
    visibility: descriptor.visibility,
    sourceType: descriptor.sourceType,
    enabledByDefault: false,
    requiresOptIn: descriptor.requiresOptIn,
    capabilitiesSummary: descriptor.capabilitiesSummary,
    riskLevel: descriptor.riskLevel,
    ...(descriptor.providerMetadata
      ? {
          provider: {
            providerLabel: descriptor.providerMetadata.providerLabel,
            ...(descriptor.providerMetadata.modelLabel
              ? { modelLabel: descriptor.providerMetadata.modelLabel }
              : {}),
            ...(descriptor.providerMetadata.endpointClass
              ? { endpointClass: descriptor.providerMetadata.endpointClass }
              : {}),
            capabilityFlags: descriptor.providerMetadata.capabilityFlags,
            defaultEnabled: false,
            requiresOptIn: true,
          },
        }
      : {}),
    ...(descriptor.extensionManifest
      ? {
          extension: {
            extensionId: descriptor.extensionManifest.extensionId,
            capabilities: descriptor.extensionManifest.capabilities,
            lifecycleEvents: descriptor.extensionManifest.lifecycleEvents ?? [],
            hookEffects: descriptor.extensionManifest.hookEffects ?? [],
            toolKinds: descriptor.extensionManifest.toolKinds,
            requiredPermissions: descriptor.extensionManifest.requiredPermissions,
            executable: false,
            supported: false,
          },
        }
      : {}),
    notProvenClaims: descriptor.notProvenClaims,
  };
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
