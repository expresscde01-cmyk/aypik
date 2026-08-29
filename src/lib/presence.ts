import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** Fenêtre « en ligne » — alignée sur `profile_is_online_for_viewer` en SQL. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Heartbeat : 90 s, dans la fourchette 1–2 min demandée. */
export const PRESENCE_HEARTBEAT_MS = 90 * 1000;

export async function touchMyPresence(): Promise<void> {
  const { error } = await supabase.rpc('touch_my_presence');
  if (error) {
    /* RPC pas encore collée, ou session absente : ignorer. */
  }
}

/**
 * Met à jour last_active_at tant que l’onglet est visible.
 * Le mode Incognito n’empêche pas le heartbeat : le masquage est côté serveur.
 */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void touchMyPresence();
    };

    tick();
    const id = window.setInterval(tick, PRESENCE_HEARTBEAT_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);
}
