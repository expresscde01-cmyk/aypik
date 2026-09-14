import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseFounderOfferClosed } from '@/lib/founderSlots';

/** En cas d’erreur réseau ou RPC absent : ne pas clôturer l’offre à tort. */
async function fetchFounderOfferClosed(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('get_founder_slot_status');
    if (error || data == null) return false;
    return parseFounderOfferClosed(data);
  } catch {
    return false;
  }
}

export function useFounderSlots(): {
  closed: boolean;
  loading: boolean;
} {
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchFounderOfferClosed().then((next) => {
      if (!active) return;
      setClosed(next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { closed, loading };
}
