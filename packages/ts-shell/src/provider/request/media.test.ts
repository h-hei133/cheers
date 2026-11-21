import { describe, expect, it, vi } from 'vitest';
import type { ModelTransport } from '../../core/agent/request/model.js';
import { readMedia } from '../../runtime/execution/media/index.js';
import { pngImage } from '../../test-utils/image.js';
import { requestClassification, requestGeneratedImages } from './media.js';

const baseUrl = 'https://openrouter.ai/api/v1';
const image = pngImage(2, 2);
const inline = `data:${image.mimeType};base64,${image.data}`;
const images = (url: string) => ({ choices: [{ finish_reason: 'stop', message: { images: [{ image_url: { url } }] } }],
  usage: { prompt_tokens: 10, completion_tokens: 2 } });

function fixture(response: () => Response, signal?: AbortSignal) {
  const dispatch = vi.fn(), confirmUnsent = vi.fn(), settle = vi.fn();
  const transport = vi.fn<ModelTransport>(async (_url, _init, beforeDispatch) => { beforeDispatch(); return response(); });
  const input = { baseUrl, model: 'image-fixture', provider: 'openai-compatible', prompt: 'a grid of blue squares',
    outputText: true, headers: {}, admission: () => undefined, signal, transport,
    policy: { reserve: vi.fn(() => ({ id: 'fixture', dispatch, confirmUnsent, settle })) } };
  return { input, transport, dispatch, confirmUnsent, settle };
}

describe('native image generation requests', () => {
  it('dispatches the exact nonstreaming wire once and settles provider usage before delivery', async () => {
    const owner = fixture(() => Response.json(images(inline)));
    await expect(requestGeneratedImages(owner.input)).resolves.toEqual([image]);
    expect(owner.transport).toHaveBeenCalledOnce();
    const [url, init] = owner.transport.mock.calls[0]!;
    expect(String(url)).toBe(baseUrl + '/chat/completions');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'image-fixture', messages: [{ role: 'user', content: 'a grid of blue squares' }],
      modalities: ['image', 'text'], stream: false,
    });
    expect(owner.dispatch).toHaveBeenCalledOnce();
    expect(owner.settle).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 10, outputTokens: 2, complete: true }));
  });

  it.each(['https://untrusted.invalid/asset', 'data:image/png;base64,eA==',
    inline.replace('image/png', 'image/jpeg')])('refuses unverified images without additional requests', async url => {
    const owner = fixture(() => Response.json(images(url)));
    await expect(requestGeneratedImages(owner.input)).rejects.toMatchObject({ failure: 'provider_output_invalid' });
    expect(owner.transport).toHaveBeenCalledOnce();
    expect(owner.settle).toHaveBeenCalledOnce();
  });

  it('classifies an HTTP refusal without reporting the response detail or replaying the request', async () => {
    const owner = fixture(() => new Response('PRIVATE_FIXTURE_BODY', { status: 401 }));
    await expect(requestGeneratedImages(owner.input)).rejects.toMatchObject({
      failure: 'provider_auth', message: 'Image generation failed (provider_auth).',
    });
    expect(owner.transport).toHaveBeenCalledOnce();
  });

  it('withholds cancelled and oversized inputs before dispatch', async () => {
    const controller = new AbortController();
    const cancelled = fixture(() => Response.json(images(inline)), controller.signal);
    controller.abort();
    await expect(requestGeneratedImages(cancelled.input)).rejects.toMatchObject({ failure: 'provider_cancelled' });
    expect(cancelled.transport).not.toHaveBeenCalled();
    const oversized = fixture(() => Response.json(images(inline)));
    await expect(requestGeneratedImages({ ...oversized.input, inputLimits: { maxRequestBytes: 10 } })).rejects.toThrow();
    expect(oversized.transport).not.toHaveBeenCalled();
  });

  it('rechecks admission at transport handoff and releases the unsent reservation', async () => {
    const owner = fixture(() => Response.json(images(inline)));
    let revoked = false;
    const providerFetch = vi.fn();
    owner.transport.mockImplementationOnce(async (_url, _init, beforeDispatch) => {
      revoked = true;
      beforeDispatch();
      return providerFetch();
    });
    await expect(requestGeneratedImages({ ...owner.input,
      admission: () => revoked ? 'Fixture revoked' : undefined })).rejects.toBeInstanceOf(Error);
    expect(owner.confirmUnsent).toHaveBeenCalledOnce();
    expect(owner.dispatch).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('sends inline references through the existing image codec and admitted limits', async () => {
    const owner = fixture(() => Response.json(images(inline)));
    await expect(requestGeneratedImages({ ...owner.input, references: [image],
      inputLimits: { images: { maxPerRequest: 1, resize: { maxWidth: 2, maxHeight: 2 } } } })).resolves.toEqual([image]);
    expect(JSON.parse(String(owner.transport.mock.calls[0]![1].body))).toMatchObject({
      messages: [{ role: 'user', content: [{ type: 'text', text: owner.input.prompt },
        { type: 'image_url', image_url: { url: inline } }] }],
    });
    const invalid = fixture(() => Response.json(images(inline)));
    await expect(requestGeneratedImages({ ...invalid.input, references: [image, image],
      inputLimits: { images: { maxPerMessage: 1 } } })).rejects.toThrow('number of input images');
    await expect(requestGeneratedImages({ ...invalid.input, references: [{ ...image, data: 'eA==' }] }))
      .rejects.toThrow('could not be verified');
    expect(invalid.transport).not.toHaveBeenCalled();
    expect(invalid.input.policy.reserve).not.toHaveBeenCalled();
  });

  it('bounds encoded output of image normalization before reserving or dispatching', async () => {
    const oversized = pngImage(1, 1, 'a'.repeat(3 * 1024 * 1024));
    const resize = vi.spyOn(readMedia, 'resize').mockResolvedValue(oversized);
    try {
      const owner = fixture(() => Response.json(images(inline)));
      await expect(requestGeneratedImages({ ...owner.input, references: [image],
        inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } } }))
        .rejects.toThrow('Normalized input exceeds the 4MiB encoded media limit');
      expect(resize).toHaveBeenCalledOnce();
      expect(owner.input.policy.reserve).not.toHaveBeenCalled();
      expect(owner.transport).not.toHaveBeenCalled();
    } finally { resize.mockRestore(); }
  });
});

describe('native decisions requests', () => {
  const questions = {
    shape: { type: 'choice', instructions: 'Which shape is visible?', criteria: { square: 'Four sides', circle: 'No sides' } },
    quality: { type: 'score', instructions: 'How clear is it?', criteria: ['Poor', 'Clear'] },
    blue: { type: 'bool', instructions: 'Is it blue?', criteria: { true: 'Blue', false: 'Other' } },
  } as const;
  const answers = [
    { name: 'shape', type: 'choice', choice: 'square', probabilities: [
      { value: 'square', probability: 0.9 }, { value: 'circle', probability: 0.1 } ], confidence: 0.8 },
    { name: 'quality', type: 'score', score: 0.75, confidence: 0.7, probabilities: [
      { value: 0, label: 'Poor', probability: 0.25 }, { value: 1, label: 'Clear', probability: 0.75 },
    ] },
    { name: 'blue', type: 'predicate', probability: 0.8 },
  ];
  const usage = { input_tokens: 20, output_tokens: 2, total_tokens: 22 };
  const target = { baseUrl: 'https://api.openai.com/v1', model: 'classifier-fixture', provider: 'openai', state: { subject: 'logo' }, questions };

  it('uses the native resource, exact named questions, and admitted image content', async () => {
    const owner = fixture(() => Response.json({ answers, usage }));
    await expect(requestClassification({ ...owner.input, ...target, images: [image] })).resolves.toEqual({
      shape: { type: 'choice', choice: 'square', probabilities: { square: 0.9, circle: 0.1 }, confidence: 0.8 },
      quality: { type: 'score', score: 0.75, probabilities: { 0: 0.25, 1: 0.75 }, confidence: 0.7 },
      blue: { type: 'bool', probability: 0.8 },
    });
    const [url, init] = owner.transport.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/decisions');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'classifier-fixture', input: [{ role: 'user', content: [
      { type: 'input_json', data: target.state }, { type: 'input_image', image_url: inline },
    ] }], questions: [
      { name: 'shape', type: 'choice', instructions: questions.shape.instructions,
        choices: [{ value: 'square', description: 'Four sides' }, { value: 'circle', description: 'No sides' }] },
      { name: 'quality', type: 'score', instructions: questions.quality.instructions, levels: [{ label: 'Poor' }, { label: 'Clear' }] },
      { name: 'blue', type: 'predicate', instructions: 'Is it blue?\n\nTrue means: Blue\nFalse means: Other' },
    ] });
    expect(owner.input.policy.reserve).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'openai-decisions', purpose: 'classification' }));
    expect(owner.settle).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 20, outputTokens: 2, complete: true }));
  });

  it('settles a rejected answer without reporting private response data', async () => {
    const owner = fixture(() => Response.json({ answers: [
      { name: 'shape', type: 'refusal', refusal: 'PRIVATE_FIXTURE_BODY' }, ...answers.slice(1),
    ], usage }));
    await expect(requestClassification({ ...owner.input, ...target })).rejects.toMatchObject({
      failure: 'provider_safety_block', message: 'Model classification failed (provider_safety_block).',
    });
    expect(owner.transport).toHaveBeenCalledOnce();
    expect(owner.settle).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 20, outputTokens: 2 }));
  });

  it('refuses a score distribution with duplicate or unexpected levels', async () => {
    const owner = fixture(() => Response.json({ answers: [answers[0], {
      ...answers[1], probabilities: [{ value: 0, probability: 0.25 }, { value: 0, probability: 0.75 }],
    }, answers[2]], usage }));
    await expect(requestClassification({ ...owner.input, ...target })).rejects.toMatchObject({ failure: 'provider_output_invalid' });
    expect(owner.settle).toHaveBeenCalledOnce();
  });

  it('checks body and image limits before allocating request budget', async () => {
    const owner = fixture(() => Response.json({ answers, usage }));
    await expect(requestClassification({ ...owner.input, ...target,
      inputLimits: { maxRequestBytes: 10 } })).rejects.toThrow('byte limit');
    await expect(requestClassification({ ...owner.input, ...target, images: [image],
      inputLimits: { images: { maxPerRequest: 0 } } })).rejects.toThrow('number of input images');
    expect(owner.transport).not.toHaveBeenCalled();
    expect(owner.input.policy.reserve).not.toHaveBeenCalled();
  });
});
