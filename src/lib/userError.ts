/** Extrait un message lisible (Error, PostgREST `{ message }`, string). */
export function userErrorMessage(
  err: unknown,
  fallback = 'Une erreur est survenue'
): string {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return fallback;
}
