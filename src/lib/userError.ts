/** Extrait un message lisible (Error, PostgREST `{ message }`, string). */
import { ADULTS_ONLY_MESSAGE } from '@/lib/dating';

export function userErrorMessage(
  err: unknown,
  fallback = 'Une erreur est survenue'
): string {
  if (typeof err === 'string' && err.trim()) {
    return friendlyDbMessage(err.trim());
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) {
      return friendlyDbMessage(msg.trim());
    }
  }
  return fallback;
}

function friendlyDbMessage(msg: string): string {
  if (msg.includes('minors_not_allowed')) return ADULTS_ONLY_MESSAGE;
  return msg;
}
