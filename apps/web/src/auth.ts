import { useSyncExternalStore } from "react";

/**
 * The API token. Typed in once, kept in localStorage, sent as the bearer on every request and as
 * `?token=` on the WebSocket. localStorage can throw (private windows, blocked site data), so every
 * access is wrapped and the token also lives in memory for the life of the tab.
 */
const KEY = "cutonce.api_token";

let memoryToken: string | null = null;
let rejected = false;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    memoryToken = window.localStorage.getItem(KEY);
  } catch {
    memoryToken = null;
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function getToken(): string | null {
  load();
  return memoryToken;
}

export function setToken(token: string): void {
  load();
  memoryToken = token.trim() || null;
  rejected = false;
  try {
    if (memoryToken) window.localStorage.setItem(KEY, memoryToken);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage is unavailable; the in-memory copy still works until the tab closes.
  }
  emit();
}

/** Forget the token. `wasRejected` makes the prompt say the server refused it. */
export function clearToken(wasRejected = false): void {
  load();
  memoryToken = null;
  rejected = wasRejected;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  emit();
}

export function tokenWasRejected(): boolean {
  return rejected;
}

export function subscribeToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: the current token, re-rendering when it changes. */
export function useToken(): string | null {
  return useSyncExternalStore(subscribeToken, getToken, () => null);
}
