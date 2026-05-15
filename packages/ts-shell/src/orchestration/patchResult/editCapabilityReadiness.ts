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
  | "bounded-broad-patch-safe-subset"
  | "fenced-bounded-broad-patch-safe-subset"
  | "recovery-authority-capture"
  | "restore-preview"
  | "restore-execute"
  | "arbitrary-broad-apply-patch"
  | "fuzzy-patch"
  | "automatic-recovery"
  | "atomic-rollback";

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
  blocked("arbitrary-broad-apply-patch", [
    "unsupported broad shape fixtures",
    "no broad arbitrary readiness claim",
  ]),
  blocked("fuzzy-patch", [
    "exact parser/normalizer only",
    "fuzzy/no-newline fixtures remain blocked",
  ]),
  blocked("automatic-recovery", [
    "recoveryExecuted remains false in route results",
    "restore requires explicit user/session action",
  ]),
  blocked("atomic-rollback", [
    "rollbackAtomicityClaim remains false",
    "no transaction rollback executor exists",
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
