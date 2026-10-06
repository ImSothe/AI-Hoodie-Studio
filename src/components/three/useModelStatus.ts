'use client';

import { useCallback, useEffect, useState } from 'react';

export type ModelStatus =
  | { state: 'checking' }
  | { state: 'ready' }
  | { state: 'missing' }
  | { state: 'error'; message: string };

/**
 * Comprueba con un HEAD que public/models/hoodie.glb existe antes de
 * montar el visor. Sin archivo no hay modelo de reserva: se muestra el aviso.
 */
export function useModelStatus(url: string) {
  const [status, setStatus] = useState<ModelStatus>({ state: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus({ state: 'checking' });
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then((r) => {
        if (!alive) return;
        const isHtml = (r.headers.get('content-type') ?? '').includes('text/html');
        setStatus(r.ok && !isHtml ? { state: 'ready' } : { state: 'missing' });
      })
      .catch(() => alive && setStatus({ state: 'missing' }));
    return () => {
      alive = false;
    };
  }, [url, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const fail = useCallback((message: string) => setStatus({ state: 'error', message }), []);
  return { status, retry, fail };
}
