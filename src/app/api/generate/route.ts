import { NextResponse } from 'next/server';
import { generateAssets, ProviderError } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/generate
 * headers: x-openai-key (opcional) — key del usuario guardada en su navegador
 * body: { prompt: string, count?: 1-4, format?: 'square' | 'portrait', hd?: boolean, style?: 'silence' | 'archive' | 'gothic' }
 * → { provider, assets: GeneratedAsset[] }
 *
 * La key del usuario sólo se usa para esta petición: no se guarda ni se
 * registra en logs. Las respuestas llegan como data: URLs (sin CORS ni
 * "tainted canvas" al exportar o al usarlas como textura 3D).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const userKey = request.headers.get('x-openai-key')?.trim() || null;
    const result = await generateAssets(body, userKey);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Nunca se vuelca la petición (contiene la key), sólo el mensaje.
    console.error('[api/generate]', err instanceof Error ? err.message : 'error desconocido');
    return NextResponse.json({ error: 'Error inesperado generando el diseño.' }, { status: 500 });
  }
}

/** GET /api/generate → qué claves tiene configuradas el servidor (sólo booleanos, nunca las claves). */
export function GET() {
  return NextResponse.json(
    { openai: !!process.env.OPENAI_API_KEY, recraft: !!process.env.RECRAFT_API_KEY },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
