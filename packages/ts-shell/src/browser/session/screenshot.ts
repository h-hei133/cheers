import type { PwPage } from '../playwrightRuntime.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';

export const SCREENSHOT_BYTES = 2 * 1024 * 1024;
const SENSITIVE = 'input,textarea,select,[contenteditable],iframe,frame';

/** Native CSS-scale pixels with mandatory masking; optional masks must match. */
export async function captureScreenshot(page: PwPage, masks: readonly string[]): Promise<ImageContent> {
  if (!page.screenshot || !page.locator || !page.viewportSize) throw new Error('Screenshot adapter is unavailable.');
  if (masks.length > 16 || masks.some(mask => !mask.trim() || mask.length > 1024)) throw new Error('Use at most 16 bounded mask selectors.');
  const viewport = page.viewportSize();
  if (!viewport || viewport.width * viewport.height > 4_000_000) throw new Error('Screenshot viewport exceeds the 4 MP limit.');
  const locators = [page.locator(SENSITIVE)];
  for (const selector of masks) {
    const locator = page.locator(selector);
    if (await locator.count() < 1) throw new Error('A required screenshot mask did not match. No image was returned.');
    locators.push(locator);
  }
  const buffer = await page.screenshot({ type: 'png', scale: 'css', fullPage: false, mask: locators, maskColor: '#000000', timeout: 5000 });
  for (const locator of locators.slice(1)) {
    if (await locator.count() < 1) throw new Error('A required screenshot mask disappeared. No image was returned.');
  }
  if (buffer.length > SCREENSHOT_BYTES) throw new Error('Screenshot exceeds the 2 MiB image limit.');
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer.length < 24) throw new Error('Screenshot did not return a PNG image.');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width * height > 4_000_000) throw new Error('Screenshot pixels exceed the 4 MP limit.');
  return { type: 'image', data: buffer.toString('base64'), mimeType: 'image/png' };
}
