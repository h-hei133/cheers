import { requestBrowser } from '../../core/network/connection.js';
import { requestScope, withinRequest } from '../../core/network/request.js';
import { httpError, NetworkError } from '../../core/network/error.js';
import { admitBrowserUrl } from '../urlAdmission.js';
import type { BrowserOriginPolicy } from '../originPolicy.js';
import { classifyBlockedHost, isPublicAddress } from '../../core/security/egressGuard.js';
import type { ArtifactManager, StoredArtifact } from '../../core/session/artifactManager.js';

export const TRANSFER_BYTES = 8 * 1024 * 1024;

/** Explicit URL transfers use the existing bounded transport; browser cookies are not forwarded. */
export async function downloadUrl(input: string, policy: BrowserOriginPolicy, artifacts: ArtifactManager, signal?: AbortSignal): Promise<StoredArtifact> {
  if (process.platform !== 'linux') throw new Error('Verified binary download publication is unavailable on this platform.');
  const scope = requestScope(30_000, signal);
  try {
    let url = input;
    for (let hop = 0; hop <= 5; hop++) {
      scope.check();
      const response = await requestBrowser(url, { maxBytes: TRANSFER_BYTES }, scope, {
        admitUrl: value => admitBrowserUrl(value, policy).allowed,
        admitAddress: address => isPublicAddress(address) || classifyBlockedHost(address)?.class === 'loopback'
          || (policy.allowPrivateNetwork && classifyBlockedHost(address)?.class === 'private'),
      });
      if (response.status >= 300 && response.status < 400) {
        if (hop === 5) throw new NetworkError('redirect_limit');
        const location = response.headers.get('location');
        if (!location) throw new NetworkError('invalid_response');
        try { url = new URL(location, url).toString(); } catch { throw new NetworkError('invalid_response'); }
        continue;
      }
      if (!response.ok) throw httpError(response.status);
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      let bytes = 0;
      try {
        for (;;) {
          scope.check();
          const read = reader && await withinRequest(reader.read(), scope);
          if (!read || read.done) break;
          bytes += read.value.byteLength;
          if (bytes > TRANSFER_BYTES) throw new NetworkError('response_limit');
          chunks.push(read.value);
        }
      } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
      scope.check();
      return await artifacts.saveBinary(Buffer.concat(chunks, bytes), 'browser-download', 'bin', scope.signal);
    }
    throw new NetworkError('redirect_limit');
  } finally { scope.dispose(); }
}
