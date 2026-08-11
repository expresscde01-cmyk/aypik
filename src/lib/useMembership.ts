import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  DEFAULT_MEMBERSHIP,
  parseMembershipStatus,
  type MembershipStatus,
} from '@/lib/membership';

export function useMembership() {
  const { user } = useAuth();
  const [status, setStatus] = useState<MembershipStatus>(DEFAULT_MEMBERSHIP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(DEFAULT_MEMBERSHIP);
      setLoading(false);
      return;
    }

    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      'get_my_membership_status'
    );

    if (rpcError) {
      // Migration pas encore appliquée : fallback freemium local
      if (
        rpcError.code === '42883' ||
        rpcError.message.includes('get_my_membership_status')
      ) {
        setStatus({
          ...DEFAULT_MEMBERSHIP,
          // Sans migration : pas de limite stricte côté client
          unlimited_likes: true,
          likes_remaining_today: null,
        });
        setError(null);
      } else {
        setError(rpcError.message);
        setStatus(DEFAULT_MEMBERSHIP);
      }
    } else {
      setStatus(parseMembershipStatus(data));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const purchaseBoost = useCallback(async (): Promise<string | null> => {
    const { error: rpcError } = await supabase.rpc('purchase_boost');
    if (rpcError) {
      if (
        rpcError.code === '42883' ||
        rpcError.message.includes('purchase_boost')
      ) {
        return "Le boost n'est pas encore disponible. Exécutez la migration Supabase freemium.";
      }
      return rpcError.message;
    }
    await refresh();
    return null;
  }, [refresh]);

  return { status, loading, error, refresh, purchaseBoost };
}
