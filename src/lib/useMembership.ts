import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  DEFAULT_MEMBERSHIP,
  isValidLinkedOffer,
  MEMBERSHIP_REQUIRED_ERROR,
  parseMembershipStatus,
  type MembershipPlan,
  type MembershipStatus,
} from '@/lib/membership';

export type EnsureMembershipResult = {
  ok: boolean;
  error: string | null;
  plan: MembershipPlan | null;
  is_founder: boolean;
};

export type SignupOffer = 'founder' | 'free';

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
      if (
        rpcError.code === '42883' ||
        rpcError.message.includes('get_my_membership_status')
      ) {
        setStatus({
          ...DEFAULT_MEMBERSHIP,
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

  /** Choix explicite d’offre avant création du profil. */
  const claimSignupOffer = useCallback(
    async (offer: SignupOffer): Promise<EnsureMembershipResult> => {
      const { data, error: rpcError } = await supabase.rpc(
        'claim_signup_offer',
        { p_offer: offer }
      );

      if (rpcError) {
        const missingFn =
          rpcError.code === '42883' ||
          rpcError.code === 'PGRST202' ||
          /Could not find the (function|.*)claim_signup_offer/i.test(
            rpcError.message
          );

        if (missingFn) {
          return {
            ok: false,
            error:
              "La fonction d'offre n'est pas encore visible côté API. Rechargez la page dans quelques secondes (cache schéma Supabase).",
            plan: null,
            is_founder: false,
          };
        }
        return {
          ok: false,
          error: rpcError.message,
          plan: null,
          is_founder: false,
        };
      }

      const raw = (data && typeof data === 'object' ? data : {}) as Record<
        string,
        unknown
      >;
      const linked = raw.linked === true;
      const plan =
        typeof raw.plan === 'string' ? (raw.plan as MembershipPlan) : null;

      if (
        !linked ||
        !isValidLinkedOffer({
          linked,
          plan,
          user_id: typeof raw.user_id === 'string' ? raw.user_id : undefined,
        })
      ) {
        await refresh();
        return {
          ok: false,
          error:
            typeof raw.error === 'string' && raw.error
              ? `Offre non enregistrée (${raw.error}).`
              : MEMBERSHIP_REQUIRED_ERROR,
          plan: null,
          is_founder: false,
        };
      }

      await refresh();
      return {
        ok: true,
        error: null,
        plan,
        is_founder: Boolean(raw.is_founder),
      };
    },
    [refresh]
  );

  /**
   * Vérifie qu’une offre est bien liée en base (après création du profil).
   */
  const ensureMembershipLinked =
    useCallback(async (): Promise<EnsureMembershipResult> => {
      const { data, error: rpcError } = await supabase.rpc(
        'ensure_my_membership'
      );

      if (rpcError) {
        if (
          rpcError.code === '42883' ||
          rpcError.message.includes('ensure_my_membership')
        ) {
          await refresh();
          const { data: statusData } = await supabase.rpc(
            'get_my_membership_status'
          );
          const parsed = parseMembershipStatus(statusData);
          if (isValidLinkedOffer(parsed)) {
            setStatus(parsed);
            return {
              ok: true,
              error: null,
              plan: parsed.plan,
              is_founder: parsed.is_founder,
            };
          }
          return {
            ok: false,
            error: MEMBERSHIP_REQUIRED_ERROR,
            plan: null,
            is_founder: false,
          };
        }
        return {
          ok: false,
          error: rpcError.message,
          plan: null,
          is_founder: false,
        };
      }

      const raw = (data && typeof data === 'object' ? data : {}) as Record<
        string,
        unknown
      >;
      const linked = raw.linked === true;
      const plan =
        typeof raw.plan === 'string' ? (raw.plan as MembershipPlan) : null;

      if (
        !linked ||
        !isValidLinkedOffer({
          linked,
          plan,
          user_id: typeof raw.user_id === 'string' ? raw.user_id : undefined,
        })
      ) {
        await refresh();
        return {
          ok: false,
          error: MEMBERSHIP_REQUIRED_ERROR,
          plan: null,
          is_founder: false,
        };
      }

      await refresh();
      return {
        ok: true,
        error: null,
        plan,
        is_founder: Boolean(raw.is_founder),
      };
    }, [refresh]);

  return {
    status,
    loading,
    error,
    refresh,
    purchaseBoost,
    claimSignupOffer,
    ensureMembershipLinked,
  };
}
