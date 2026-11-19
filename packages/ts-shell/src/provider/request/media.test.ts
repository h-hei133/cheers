import { describe, expect, it, vi } from 'vitest';
import type { ModelTransport } from '../../core/agent/request/model.js';
import { pngImage } from '../../test-utils/image.js';
import { requestGeneratedImages } from './media.js';

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
  return { input, transport, dispatch, settle };
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
});
