import type { GenerateResponse, ImageFormat } from '../types';
import { DEFAULT_COLLECTION_STYLE, isCollectionStyle, MAX_PROMPT_LENGTH, MAX_VARIATIONS, type CollectionStyleId } from './prompt';
import { generateWithOpenAI } from './providers/openai';
import { generateWithRecraft } from './providers/recraft';
import { ProviderError } from './providers/shared';

export { ProviderError };

const KEY_FORMAT = /^sk-[A-Za-z0-9_-]{20,}$/;

interface ValidRequest {
  prompt: string;
  count: number;
  format: ImageFormat;
  hd: boolean;
  style: CollectionStyleId;
}

export function validateRequest(body: unknown): ValidRequest {
  if (!body || typeof body !== 'object') throw new ProviderError('Cuerpo de petición inválido.', 400);
  const { prompt, count, format, hd, style } = body as Record<string, unknown>;
  if (typeof prompt !== 'string' || !prompt.trim()) throw new ProviderError('Escribe un concepto de diseño.', 400);
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ProviderError(`El prompt supera ${MAX_PROMPT_LENGTH} caracteres.`, 400);
  }
  if (format !== undefined && format !== 'square' && format !== 'portrait') {
    throw new ProviderError('Formato de imagen inválido.', 400);
  }
  if (style !== undefined && !isCollectionStyle(style)) {
    throw new ProviderError('Dirección de colección desconocida.', 400);
  }
  return {
    prompt: prompt.trim(),
    count: Math.min(MAX_VARIATIONS, Math.max(1, Math.floor(Number(count) || 1))),
    format: (format as ImageFormat | undefined) ?? 'square',
    hd: hd === true,
    style: (style as CollectionStyleId | undefined) ?? DEFAULT_COLLECTION_STYLE,
  };
}

/**
 * Orden de resolución (sin modo demo):
 * 1. Key de OpenAI enviada por el usuario (cabecera) → DALL·E 3
 * 2. OPENAI_API_KEY del servidor → DALL·E 3
 * 3. RECRAFT_API_KEY del servidor → Recraft v3 (SVG)
 * 4. Ninguna → 401 pidiendo configurar la key
 */
export async function generateAssets(body: unknown, userKey?: string | null): Promise<GenerateResponse> {
  const req = validateRequest(body);

  if (userKey && !KEY_FORMAT.test(userKey)) {
    throw new ProviderError('La OpenAI API Key no tiene un formato válido (debe empezar por "sk-").', 400);
  }
  const openaiKey = userKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return { provider: 'openai', assets: await generateWithOpenAI(req.prompt, { ...req, apiKey: openaiKey }) };
  }
  if (process.env.RECRAFT_API_KEY) {
    return { provider: 'recraft', assets: await generateWithRecraft(req.prompt, req.count, req.style) };
  }
  throw new ProviderError('Falta la OpenAI API Key. Pégala en Configuración para generar con DALL·E 3.', 401);
}
