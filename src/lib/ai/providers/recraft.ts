import type { GeneratedAsset } from '../../types';
import { sanitizeSvg, svgToDataUrl } from '../../svg/sanitize';
import { stripSvgBackground } from '../../svg/stripBackground';
import { buildPrintPrompt, type CollectionStyleId } from '../prompt';
import { assetId, fetchWithTimeout, ProviderError } from './shared';

const RECRAFT_ENDPOINT = 'https://external.api.recraft.ai/v1/images/generations';

interface RecraftResponse {
  data?: { url?: string; b64_json?: string }[];
  code?: string;
  message?: string;
}

/** Sólo se descargan resultados alojados en dominios de Recraft (anti-SSRF). */
function isTrustedRecraftUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && (url.hostname === 'recraft.ai' || url.hostname.endsWith('.recraft.ai'));
  } catch {
    return false;
  }
}

/** Alternativa vectorial (SVG puro) si el servidor tiene RECRAFT_API_KEY y no hay key de OpenAI. */
export async function generateWithRecraft(prompt: string, count: number, style?: CollectionStyleId): Promise<GeneratedAsset[]> {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) throw new ProviderError('Falta RECRAFT_API_KEY en el servidor.', 500);

  const res = await fetchWithTimeout(RECRAFT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: buildPrintPrompt(prompt, style),
      model: 'recraftv3',
      style: 'vector_illustration',
      size: '1024x1024',
      n: count,
      response_format: 'url',
    }),
  });

  const json = (await res.json().catch(() => ({}))) as RecraftResponse;
  if (!res.ok) {
    throw new ProviderError(`Recraft respondió ${res.status}: ${json.message ?? json.code ?? 'error desconocido'}`, 502);
  }

  const urls = (json.data ?? []).map((d) => d.url).filter((u): u is string => !!u);
  if (!urls.length) throw new ProviderError('Recraft no devolvió imágenes.', 502);

  return Promise.all(
    urls.map(async (url, i) => {
      if (!isTrustedRecraftUrl(url)) throw new ProviderError('URL de resultado no confiable.', 502);
      const fileRes = await fetchWithTimeout(url, {});
      if (!fileRes.ok) throw new ProviderError(`No se pudo descargar el SVG (${fileRes.status}).`, 502);
      const raw = await fileRes.text();
      const { svg } = stripSvgBackground(sanitizeSvg(raw));
      return {
        id: assetId(),
        name: `${prompt.slice(0, 28)} #${i + 1}`,
        kind: 'svg' as const,
        svg,
        src: svgToDataUrl(svg),
        provider: 'recraft' as const,
        prompt,
        createdAt: Date.now(),
      };
    }),
  );
}
