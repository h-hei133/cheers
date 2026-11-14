import { describe, expect, it } from "vitest";
import { importCatalog } from "../../config/profiles/import/catalog.js";
import { mergeProviders, type CatalogModel, type CatalogProvider } from "./catalog.js";
import {
  DEFAULT_IMAGE_RESIZE,
  modelInputModalities,
  modelSupportsVision,
  normalizeModalities,
  withDefaultImageLimits,
} from "./modalities.js";
import { resolveRequestShape } from "./requestShape.js";

describe("model catalog multimodal support", () => {
  it("normalizes modalities and derives vision from input array or vision flag", () => {
    expect(normalizeModalities(["TEXT", "image/png", "image", "unknown"])).toEqual(["text", "image"]);
    expect(normalizeModalities(["audio"])).toBeUndefined();

    expect(modelSupportsVision({ input: ["text", "image"] })).toBe(true);
    expect(modelSupportsVision({ input: ["text"], vision: true })).toBe(true);
    expect(modelSupportsVision({ input: ["text", "image"], vision: false })).toBe(false);
    expect(modelSupportsVision({})).toBe(false);

    expect(modelInputModalities({ vision: true })).toEqual(["text", "image"]);
    expect(modelInputModalities({ input: ["text"], vision: true })).toEqual(["text", "image"]);
    expect(modelInputModalities({})).toEqual(["text"]);
  });

  it("attaches default image resize limits only for vision models without overrides", () => {
    const plainInput: CatalogModel = { id: "text-only" };
    const plain = withDefaultImageLimits(plainInput);
    expect(plain.inputLimits).toBeUndefined();

    const mmInput: CatalogModel = { id: "mm", input: ["text", "image"] };
    const multimodal = withDefaultImageLimits(mmInput);
    expect(multimodal.inputLimits?.images?.resize).toEqual(DEFAULT_IMAGE_RESIZE);

    const customInput: CatalogModel = {
      id: "custom",
      vision: true,
      inputLimits: { images: { maxPerRequest: 4, resize: { maxWidth: 1024 } } },
    };
    const custom = withDefaultImageLimits(customInput);
    expect(custom.inputLimits?.images?.maxPerRequest).toBe(4);
    expect(custom.inputLimits?.images?.resize).toEqual({ maxWidth: 1024 });
  });

  it("resolves multimodal shape, preserves capabilities on refresh merge, and validates import schema", () => {
    const base: CatalogProvider = {
      id: "acme",
      label: "Acme",
      runtime: "openai-compatible",
      auth: "api-key",
      baseUrl: "https://acme.example/v1",
      models: [
        {
          id: "acme-vl",
          modelType: "chat",
          input: ["text", "image"],
          output: ["text"],
          inputLimits: { images: { maxPerMessage: 5 } },
        },
      ],
    };

    const shape = resolveRequestShape([base], "acme", "acme-vl", undefined);
    expect(shape.vision).toBe(true);
    expect(shape.inputModalities).toEqual(["text", "image"]);
    expect(shape.inputLimits).toEqual({ images: { maxPerMessage: 5 } });

    const merged = mergeProviders(
      [base],
      [{ id: "acme", models: [{ id: "acme-vl", contextWindow: 64000, inputLimits: { maxRequestBytes: 9_000_000, images: { resize: { maxWidth: 1000 } } } }] }],
      { preserveExplicitCapabilities: true, origin: "refresh" },
    );
    expect(merged[0]!.models[0]).toMatchObject({
      id: "acme-vl",
      contextWindow: 64000,
      modelType: "chat",
      input: ["text", "image"],
      output: ["text"],
      inputLimits: { maxRequestBytes: 9_000_000, images: { maxPerMessage: 5, resize: { maxWidth: 1000 } } },
    });

    const imported = JSON.parse(
      importCatalog(
        JSON.stringify({
          providers: {
            acme: {
              models: [
                {
                  id: "acme-img",
                  modelType: "image",
                  input: ["text", "image"],
                  output: ["image"],
                  inputLimits: {
                    maxRequestBytes: 5_000_000,
                    images: { maxPerRequest: 2, resize: { maxWidth: 1280, jpegQuality: 85 } },
                  },
                },
              ],
            },
          },
        }),
      ),
    );
    expect(imported.providers.acme.models[0]).toMatchObject({
      modelType: "image",
      input: ["text", "image"],
      output: ["image"],
      inputLimits: {
        maxRequestBytes: 5_000_000,
        images: { maxPerRequest: 2, resize: { maxWidth: 1280, jpegQuality: 85 } },
      },
    });
  });
});
