export type EditCapabilityReadinessStatus =
  | "default-ready-candidate"
  | "non-default-ready-candidate"
  | "explicit-opt-in-only"
  | "blocked-by-design"
  | "future-research";

export type EditCapabilityId =
  | "single-update-create-delete-move"
  | "bounded-update-only-2-32"
  | "bounded-mixed-2-32"
  | "bounded-delete-only-2-32"
  | "bounded-move-only-2-32"
  | "bounded-marker-apply-patch-candidates"
  | "bounded-broad-patch-safe-subset"
  | "fenced-bounded-broad-patch-safe-subset"
  | "rename-with-content-decomposition"
  | "unsupported-broad-shape-taxonomy"
  | "recovery-authority-capture"
  | "restore-preview"
  | "restore-execute"
  | "local-restore-command"
  | "arbitrary-broad-apply-patch"
  | "fuzzy-patch"
  | "binary-mode-symlink-submodule-copy"
  | "directory-operations"
  | "overwrite"
  | "automatic-recovery"
  | "atomic-rollback"
  | "default-durable-persistence";

export interface EditCapabilityReadiness {
  readonly id: EditCapabilityId;
  readonly status: EditCapabilityReadinessStatus;
  readonly evidence: readonly string[];
  readonly nonClaims: readonly string[];
}

const READINESS: readonly EditCapabilityReadiness[] = [
  defaultReady("single-update-create-delete-move", [
    "single-file route tests",
    "Route 71 compatibility gauntlet executable fixtures",
    "result-contract validation",
  ]),
  defaultReady("bounded-update-only-2-32", [
    "multi-file update route tests",
    "32-operation compatibility gauntlet fixture",
  ]),
  defaultReady("bounded-mixed-2-32", [
    "mixed route tests",
    "Route 71/72 mixed executable gauntlet fixtures",
  ]),
  defaultReady("bounded-delete-only-2-32", [
    "delete route tests",
    "delete-only executable gauntlet fixture",
  ]),
  defaultReady("bounded-move-only-2-32", [
    "move route tests",
    "bounded write policy cap evidence",
  ]),
  defaultReady("bounded-marker-apply-patch-candidates", [
    "marker parser tests",
    "bounded apply_patch candidate tests",
    "compatibility gauntlet marker fixtures",
  ]),
  defaultReady("bounded-broad-patch-safe-subset", [
    "bounded broad patch normalizer tests",
    "bounded apply_patch candidate tests",
    "compatibility gauntlet supported and blocked fixtures",
  ]),
  defaultReady("fenced-bounded-broad-patch-safe-subset", [
    "fenced patch extractor tests",
    "fenced broad diff candidate tests",
    "Route 72 compatibility gauntlet fenced fixtures",
  ]),
  defaultReady("rename-with-content-decomposition", [
    "bounded broad patch normalizer tests",
    "mixed route executable gauntlet fixture",
    "per-file patch plan coverage",
  ]),
  defaultReady("unsupported-broad-shape-taxonomy", [
    "broad unsupported reason tests",
    "blocked compatibility gauntlet fixtures",
    "no-write result projection evidence",
  ]),
  explicitOptIn("recovery-authority-capture", [
    "non-default ledgerRoot required",
    "recovery authority coverage drills",
    "compatibility gauntlet capture fixtures",
  ]),
  nonDefault("restore-preview", [
    "restore preview tests",
    "session/user recovery surface projection tests",
  ]),
  explicitOptIn("restore-execute", [
    "explicit restore execution bridge tests",
    "hidden edit guard tests",
  ]),
  explicitOptIn("local-restore-command", [
    "restore command contract tests",
    "restore command runner tests",
    "explicit execute command path",
  ]),
  blocked("arbitrary-broad-apply-patch", [
    "unsupported broad shape fixtures",
    "no broad arbitrary readiness claim",
  ]),
  blocked("fuzzy-patch", [
    "exact parser/normalizer only",
    "fuzzy/no-newline fixtures remain blocked",
  ]),
  blocked("binary-mode-symlink-submodule-copy", [
    "broad normalizer blocked metadata fixtures",
    "compatibility gauntlet destructive metadata fixtures",
  ]),
  blocked("directory-operations", [
    "directory operation candidate rejection tests",
    "workspace authority remains file-scoped",
  ]),
  blocked("overwrite", [
    "path conflict candidate rejection tests",
    "create/move exclusive target authority",
  ]),
  blocked("automatic-recovery", [
    "recoveryExecuted remains false in route results",
    "restore requires explicit user/session action",
  ]),
  blocked("atomic-rollback", [
    "rollbackAtomicityClaim remains false",
    "no transaction rollback executor exists",
  ]),
  blocked("default-durable-persistence", [
    "recovery authority requires explicit non-default root",
    "no SessionManager persistence wiring",
  ]),
];

export function listEditCapabilityReadiness(): readonly EditCapabilityReadiness[] {
  return READINESS;
}

export function getEditCapabilityReadiness(
  id: EditCapabilityId,
): EditCapabilityReadiness {
  const readiness = READINESS.find((item) => item.id === id);
  if (!readiness) {
    throw new Error(`Unknown edit capability readiness id: ${id}`);
  }
  return readiness;
}

function defaultReady(
  id: EditCapabilityId,
  evidence: readonly string[],
): EditCapabilityReadiness {
  return {
    id,
    status: "default-ready-candidate",
    evidence,
    nonClaims: [
      "does not imply arbitrary broad apply_patch readiness",
      "does not imply automatic recovery",
      "does not imply atomic rollback",
    ],
  };
}

function nonDefault(
  id: EditCapabilityId,
  evidence: readonly string[],
): EditCapabilityReadiness {
  return {
    id,
    status: "non-default-ready-candidate",
    evidence,
    nonClaims: [
      "not enabled as default persistence",
      "does not execute recovery automatically",
      "does not imply atomic rollback",
    ],
  };
}

function explicitOptIn(
  id: EditCapabilityId,
  evidence: readonly string[],
): EditCapabilityReadiness {
  return {
    id,
    status: "explicit-opt-in-only",
    evidence,
    nonClaims: [
      "requires explicit non-default authority or user action",
      "does not execute recovery automatically",
      "does not imply atomic rollback",
    ],
  };
}

function blocked(
  id: EditCapabilityId,
  evidence: readonly string[],
): EditCapabilityReadiness {
  return {
    id,
    status: "blocked-by-design",
    evidence,
    nonClaims: [
      "not a current edit capability",
      "no default readiness claim",
      "requires a separate route before implementation",
    ],
  };
}
