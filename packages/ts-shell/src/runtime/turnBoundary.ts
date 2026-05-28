import type { RuntimeEvidenceSavePoint } from "../evidence/runtimeSavePoint.js";
import type { RuntimeTurnSnapshot } from "../turn/turnSnapshot.js";

export interface RuntimeTurnBoundaryObserver {
  readonly onTurnSnapshot?: (snapshot: RuntimeTurnSnapshot) => void;
  readonly onEvidenceSavePoint?: (savePoint: RuntimeEvidenceSavePoint) => void;
}

export function notifyRuntimeTurnSnapshot(
  observer: RuntimeTurnBoundaryObserver | undefined,
  snapshot: RuntimeTurnSnapshot,
): void {
  observer?.onTurnSnapshot?.(snapshot);
}

export function notifyRuntimeEvidenceSavePoint(
  observer: RuntimeTurnBoundaryObserver | undefined,
  savePoint: RuntimeEvidenceSavePoint,
): void {
  observer?.onEvidenceSavePoint?.(savePoint);
}

