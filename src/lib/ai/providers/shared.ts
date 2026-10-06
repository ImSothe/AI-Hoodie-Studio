export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export function assetId() {
  return `asset_${crypto.randomUUID()}`;
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } catch (err) {
    if (controller.signal.aborted) throw new ProviderError('El proveedor de IA tardó demasiado.', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
