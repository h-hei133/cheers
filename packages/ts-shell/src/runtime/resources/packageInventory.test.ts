import { describe, expect, it } from "vitest";

import {
  projectPackageResourceInventory,
  validatePackageManifest,
  type PackageEnablementState,
  type PackageManifestContract,
} from "./packageInventory.js";

describe("package resource inventory governance", () => {
  it("accepts report-safe manifests and preserves scope, trust, source, and version metadata", () => {
    const validation = validatePackageManifest(manifest({
      packageId: "pkg.review",
      safeName: "Review Package",
      sourceKind: "project",
      sourceLabel: "project settings",
      scope: "project",
      trustLevel: "project_declared",
      enabledState: "requires_approval",
      version: {
        exactVersion: "1.2.3",
        pinnedState: "pinned",
        lockSource: "project-lock",
        integrity: "sha256-safe",
      },
      resourceIds: ["skill.review"],
      declaredCapabilities: ["review"],
      requiredPermissions: ["read"],
    }));

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error("expected manifest to validate");
    }
    expect(validation.manifest).toMatchObject({
      packageId: "pkg.review",
      sourceKind: "project",
      scope: "project",
      trustLevel: "project_declared",
      enabledState: "requires_approval",
      terminalSuccessClaim: false,
    });
    expect(validation.manifest.version).toMatchObject({
      exactVersion: "1.2.3",
      pinnedState: "pinned",
      integrity: "sha256-safe",
    });
    expect(validation.manifest.trust.canLoadPackage).toBe(false);
    expect(validation.manifest.notProvenClaims).toEqual(
      expect.arrayContaining(["package-loading", "plugin-execution", "terminal-success"]),
    );
  });

  it("represents all enablement states without executing packages", () => {
    const states: readonly PackageEnablementState[] = [
      "enabled",
      "disabled",
      "blocked",
      "requires_approval",
      "unsupported",
      "unknown",
    ];
    const inventory = projectPackageResourceInventory({
      manifests: states.map((enabledState) =>
        manifest({
          packageId: `pkg.${enabledState}`,
          safeName: `Package ${enabledState}`,
          enabledState,
          resourceIds: [`resource.${enabledState}`],
        }),
      ),
    });

    expect(inventory.packages.map((pkg) => pkg.enabledState)).toEqual(states);
    expect(inventory.packageInstallation).toBe("disabled");
    expect(inventory.packageLoading).toBe("disabled");
    expect(inventory.pluginExecution).toBe("disabled");
    expect(inventory.scriptExecution).toBe("disabled");
    expect(inventory.dynamicDiscovery).toBe("disabled");
    expect(inventory.networkLookup).toBe("disabled");
  });

  it("adds integrity and version-resolution not-proven claims for unpinned packages", () => {
    const inventory = projectPackageResourceInventory({
      manifests: [
        manifest({
          packageId: "pkg.unpinned",
          safeName: "Unpinned Package",
          version: {
            versionRange: "^1.0.0",
            pinnedState: "unpinned",
          },
        }),
      ],
    });

    expect(inventory.packages[0]?.version.notProvenClaims).toEqual(
      expect.arrayContaining(["package-integrity", "version-resolution"]),
    );
    expect(inventory.notProvenClaims).toEqual(
      expect.arrayContaining(["package-install", "package-loading", "terminal-success"]),
    );
  });

  it("projects duplicate, precedence, enablement, blocked, and executable trust conflicts", () => {
    const inventory = projectPackageResourceInventory({
      manifests: [
        manifest({
          packageId: "pkg.duplicate",
          safeName: "Project Package",
          scope: "project",
          resourceIds: ["skill.same"],
          declaredCapabilities: ["review"],
        }),
        manifest({
          packageId: "pkg.duplicate",
          safeName: "User Package",
          scope: "user",
          resourceIds: ["skill.same"],
          declaredCapabilities: ["review"],
        }),
        manifest({
          packageId: "pkg.disabled",
          safeName: "Disabled Package",
          enabledState: "disabled",
          resourceIds: ["skill.enabled"],
          resources: [
            {
              resourceId: "skill.enabled",
              kind: "skill",
              enablementState: "enabled",
              precedence: 10,
            },
          ],
        }),
        manifest({
          packageId: "pkg.blocked",
          safeName: "Blocked Package",
          enabledState: "blocked",
          resourceIds: ["prompt.blocked"],
        }),
        manifest({
          packageId: "pkg.unknown-exec",
          safeName: "Unknown Executable",
          trustLevel: "unknown",
          executable: true,
          supported: false,
          resourceIds: ["extension.unknown"],
        }),
      ],
    });

    expect(inventory.conflicts.map((conflict) => conflict.kind)).toEqual(
      expect.arrayContaining([
        "duplicate-package-id",
        "duplicate-resource-id",
        "capability-overlap",
        "disabled-package-enabled-resource",
        "blocked-package-available",
        "unknown-trust-executable",
      ]),
    );
    expect(
      inventory.conflicts.every((conflict) => conflict.terminalSuccessClaim === false),
    ).toBe(true);
  });

  it("redacts unsafe manifest fields and never exposes install scripts or executable code", () => {
    let executed = false;
    const inventory = projectPackageResourceInventory({
      manifests: [
        manifest({
          packageId: "pkg.secret",
          safeName: "provider.env=/home/wang/.private-agents-real/provider.env",
          sourceLabel:
            "Authorization: Bearer abc raw provider output: hidden oldText=raw-before newText=raw-after",
          version: {
            exactVersion: "1.0.0",
            pinnedState: "pinned",
            lockSource: "token=secret-value",
          },
          declaredCapabilities: ["hidden reasoning: do not leak"],
          requiredPermissions: ["install script: npm install && node postinstall.js"],
          resourceIds: ["resource.secret"],
          resources: [
            {
              resourceId: "resource.secret",
              kind: "package-metadata",
              enablementState: "disabled",
              precedence: 0,
              run: () => {
                executed = true;
              },
            } as never,
          ],
        }),
      ],
    });
    const serialized = JSON.stringify(inventory);

    expect(executed).toBe(false);
    expect(inventory.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(
      /private-agents-real|provider\.env|Bearer abc|raw provider output|raw-before|raw-after|secret-value|hidden reasoning|npm install|postinstall/i,
    );
    expect(serialized).not.toContain('"success":true');
  });

  it("rejects manifests that would imply executable supported package loading", () => {
    const inventory = projectPackageResourceInventory({
      manifests: [
        manifest({
          packageId: "pkg.executable",
          safeName: "Executable Package",
          executable: true,
          supported: true,
        }),
      ],
    });

    expect(inventory.packages).toHaveLength(0);
    expect(inventory.rejectedPackageCount).toBe(1);
    expect(inventory.packageLoading).toBe("disabled");
    expect(inventory.pluginExecution).toBe("disabled");
  });
});

function manifest(input: Partial<PackageManifestContract>): PackageManifestContract {
  return {
    packageId: "pkg.default",
    safeName: "Default Package",
    version: {
      exactVersion: "0.0.0",
      pinnedState: "pinned",
      integrity: "sha256-default",
    },
    sourceKind: "test_fixture",
    sourceLabel: "test fixture",
    scope: "test_fixture",
    trustLevel: "trusted",
    enabledState: "disabled",
    resourceIds: [],
    declaredCapabilities: [],
    requiredPermissions: [],
    executable: false,
    supported: false,
    notProvenClaims: [],
    ...input,
  };
}
