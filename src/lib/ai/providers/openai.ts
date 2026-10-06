import type { GeneratedAsset, ImageFormat } from '../../types';
import { buildPrintPrompt, type CollectionStyleId } from '../prompt';
import { assetId, fetchWithTimeout, ProviderError } from './shared';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/images/generations';

const SIZES: Record<ImageFormat, string> = {
  square: '1024x1024',
  portrait: '1024x1792', // ideal para columnas/espinas en la espalda
};

interface OpenAIImageResponse {
  data?: { b64_json?: string; revised_prompt?: string }[];
  error?: { message?: string };
}

interface Options {
  apiKey: string;
  count: number;
  format: ImageFormat;
  hd: boolean;
  style: CollectionStyleId;
}

/**
 * DALL·E 3 sólo admite n = 1, así que cada variación es una petición en
 * paralelo. Devuelve PNG blanco sobre negro; el cliente convierte el negro en
 * transparencia antes de colocarlo en la prenda.
 */
export async function generateWithOpenAI(concept: string, { apiKey, count, format, hd, style }: Options) {
  const prompt = buildPrintPrompt(concept, style);

  const request = async (): Promise<{ b64: string; revised?: string }> => {
    const res = await fetchWithTimeout(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: SIZES[format],
        quality: hd ? 'hd' : 'standard',
        style: 'natural', // menos hiperrealista: mejor para arte plano de serigrafía
        response_format: 'b64_json',
      }),
    });
    const json = (await res.json().catch(() => ({}))) as OpenAIImageResponse;
    if (!res.ok) {
      const status = res.status === 401 ? 401 : res.status === 429 ? 429 : res.status === 400 ? 400 : 502;
      const detail =
        json.error?.message ??
        (res.status === 403 ? 'acceso denegado (¿firewall/proxy de red o key sin permisos de imágenes?)' : 'error desconocido');
      throw new ProviderError(`OpenAI (${res.status}): ${detail}`, status);
    }
    const item = json.data?.[0];
    if (!item?.b64_json) throw new ProviderError('OpenAI no devolvió ninguna imagen.', 502);
    return { b64: item.b64_json, revised: item.revised_prompt };
  };

  // allSettled: si una variación falla (p. ej. filtro de contenido) las demás se conservan.
  const results = await Promise.allSettled(Array.from({ length: count }, request));
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length) {
    const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw first?.reason instanceof ProviderError ? first.reason : new ProviderError('OpenAI falló.', 502);
  }

  return ok.map<GeneratedAsset>(({ b64, revised }, i) => ({
    id: assetId(),
    name: `${concept.slice(0, 28)} #${i + 1}`,
    kind: 'png',
    src: `data:image/png;base64,${b64}`,
    provider: 'openai',
    prompt: concept,
    revisedPrompt: revised,
    createdAt: Date.now(),
    needsBlackKnockout: true,
  }));
}
