/**
 * Model input/output modalities and optional image input constraints.
 */

export const MODEL_INPUT_MODALITIES = ["text", "image"] as const;
export type ModelInputModality = (typeof MODEL_INPUT_MODALITIES)[number];

export interface ModelImageResizeOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxBytes?: number;
  readonly jpegQuality?: number;
}

export interface ModelImageInputLimits {
  readonly resize?: ModelImageResizeOptions;
  readonly maxPerMessage?: number;
  readonly maxPerRequest?: number;
}

export interface ModelInputLimits {
  readonly maxRequestBytes?: number;
  readonly images?: ModelImageInputLimits;
}

export const DEFAULT_IMAGE_RESIZE: Readonly<Required<ModelImageResizeOptions>> = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: Math.floor(4.5 * 1024 * 1024),
  jpegQuality: 80,
};

/** Capture validated limits before asynchronous normalization or request admission. */
export function captureInputLimits(limits: ModelInputLimits | undefined): ModelInputLimits | undefined {
  if (limits === undefined) return undefined;
  if (limits === null || typeof limits !== 'object' || Array.isArray(limits)
    || limits.images !== undefined && (limits.images === null || typeof limits.images !== 'object' || Array.isArray(limits.images))
    || limits.images?.resize !== undefined && (limits.images.resize === null || typeof limits.images.resize !== 'object' || Array.isArray(limits.images.resize))) {
    throw new Error('Model input limits must be objects.');
  }
  const positive = (value: number | undefined): number | undefined => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new Error('Model input limits must be positive safe integers.');
    return value;
  };
  const count = (value: number | undefined): number | undefined => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Model image counts must be non-negative safe integers.');
    return value;
  };
  const resize = limits.images?.resize;
  if (resize?.jpegQuality !== undefined && (!Number.isSafeInteger(resize.jpegQuality) || resize.jpegQuality < 1 || resize.jpegQuality > 100)) {
    throw new Error('Model JPEG quality must be an integer from 1 to 100.');
  }
  return Object.freeze({
    maxRequestBytes: positive(limits.maxRequestBytes),
    ...(limits.images ? { images: Object.freeze({
      maxPerMessage: count(limits.images.maxPerMessage), maxPerRequest: count(limits.images.maxPerRequest),
      ...(resize ? { resize: Object.freeze({
        maxWidth: positive(resize.maxWidth), maxHeight: positive(resize.maxHeight), maxBytes: positive(resize.maxBytes),
        jpegQuality: resize.jpegQuality,
      }) } : {}),
    }) } : {}),
  });
}

const VALID_MODALITY_SET = new Set<string>(MODEL_INPUT_MODALITIES);

export function normalizeModalities(values: readonly string[] | undefined): readonly ModelInputModality[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const filtered: ModelInputModality[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim().toLowerCase();
    const mapped = normalized.startsWith("image/") ? "image" : normalized;
    if (VALID_MODALITY_SET.has(mapped) && !filtered.includes(mapped as ModelInputModality)) {
      filtered.push(mapped as ModelInputModality);
    }
  }
  return filtered.length > 0 ? filtered : undefined;
}

export function modelSupportsVision(model: {
  readonly vision?: boolean;
  readonly input?: readonly ModelInputModality[];
}): boolean {
  if (model.vision !== undefined) return model.vision;
  return model.input?.includes("image") ?? false;
}

export function modelInputModalities(model: {
  readonly vision?: boolean;
  readonly input?: readonly ModelInputModality[];
}): readonly ModelInputModality[] {
  if (model.input && model.input.length > 0) {
    if (model.vision === false) {
      const filtered = model.input.filter((m) => m !== "image");
      return filtered.length > 0 ? filtered : ["text"];
    }
    if (model.vision === true && !model.input.includes("image")) {
      return [...model.input, "image"];
    }
    return model.input;
  }
  return model.vision === true ? ["text", "image"] : ["text"];
}

export function mergeInputLimits(
  existing: ModelInputLimits | undefined,
  patch: ModelInputLimits | undefined,
  preserveExisting: boolean,
): ModelInputLimits | undefined {
  if (!existing && !patch) return undefined;
  if (!existing) return patch;
  if (!patch) return existing;
  const base = preserveExisting ? patch : existing;
  const over = preserveExisting ? existing : patch;
  const images =
    base.images || over.images
      ? {
          ...base.images,
          ...over.images,
          ...(base.images?.resize || over.images?.resize
            ? { resize: { ...base.images?.resize, ...over.images?.resize } }
            : {}),
        }
      : undefined;
  return {
    ...base,
    ...over,
    ...(images ? { images } : {}),
  };
}

export function withDefaultImageLimits<
  T extends { readonly vision?: boolean; readonly input?: readonly ModelInputModality[]; readonly inputLimits?: ModelInputLimits },
>(model: T): T & { readonly inputLimits?: ModelInputLimits } {
  if (!modelSupportsVision(model)) return model;
  if (model.inputLimits?.images?.resize) return model;
  return {
    ...model,
    inputLimits: {
      ...model.inputLimits,
      images: {
        ...model.inputLimits?.images,
        resize: { ...DEFAULT_IMAGE_RESIZE },
      },
    },
  };
}
