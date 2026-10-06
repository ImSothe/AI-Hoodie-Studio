'use client';

import { useSyncExternalStore } from 'react';

/**
 * Configuración local del usuario (sólo en este navegador).
 *
 * La OpenAI API Key se guarda en localStorage porque así lo pide el flujo de
 * herramienta interna. Ojo: cualquier script que se ejecute en este origen
 * podría leerla (XSS), así que no se debe usar en un dominio público ni con
 * una key sin límite de gasto. En el servidor nunca se persiste ni se loguea.
 */

const OPENAI_KEY = 'aihs.openaiApiKey';
const listeners = new Set<() => void>();
let memory: string | null = null;

function read(key: string) {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return ''; // modo privado / almacenamiento bloqueado
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento: la key vivirá sólo en memoria hasta recargar */
  }
  memory = value ?? '';
  listeners.forEach((l) => l());
}

export function getOpenAIKey() {
  if (memory === null) memory = typeof window === 'undefined' ? '' : read(OPENAI_KEY);
  return memory;
}

export function setOpenAIKey(value: string) {
  write(OPENAI_KEY, value.trim() || null);
}

export function clearOpenAIKey() {
  write(OPENAI_KEY, null);
}

/** Formato de las keys de OpenAI (sk-..., sk-proj-...). */
export function looksLikeOpenAIKey(value: string) {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

export function maskKey(value: string) {
  return value.length > 12 ? `${value.slice(0, 7)}••••${value.slice(-4)}` : '••••';
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === OPENAI_KEY) {
      memory = e.newValue ?? '';
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useOpenAIKey() {
  return useSyncExternalStore(subscribe, getOpenAIKey, () => '');
}
