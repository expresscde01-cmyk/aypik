const MAINTENANCE_STATUS_URL =
  `${(import.meta.env.VITE_SUPABASE_URL || 'https://dtsyeouinmpjvdgwkncu.supabase.co').replace(/\/$/, '')}/functions/v1/maintenance-status`;

const FETCH_TIMEOUT_MS = 3000;

export type MaintenanceStatus = {
  maintenance: boolean;
  message: string | null;
};

const OPEN: MaintenanceStatus = { maintenance: false, message: null };

function bypassFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('bypass');
  return value?.trim() ? value.trim() : null;
}

/**
 * Fail-open : timeout, réseau ou JSON invalide → site accessible.
 * Propage `?bypass=` s’il est déjà dans l’URL (contournement serveur).
 */
export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = new URL(MAINTENANCE_STATUS_URL);
    const bypass = bypassFromLocation();
    if (bypass) url.searchParams.set('bypass', bypass);

    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (anon) {
      headers.apikey = anon;
      headers.Authorization = `Bearer ${anon}`;
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers,
    });
    if (!response.ok) return OPEN;

    const body = (await response.json()) as { maintenance?: unknown; message?: unknown };
    if (body.maintenance !== true) return OPEN;

    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : null;
    return { maintenance: true, message };
  } catch {
    return OPEN;
  } finally {
    window.clearTimeout(timer);
  }
}
