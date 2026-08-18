import { useCallback, useEffect, useState } from 'react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { purgeExpiredDeletions } from '@/lib/deleteAccount';
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

const SCHEMA_CACHE_ERROR =
  "L'activation de l'offre n'est pas encore disponible. Réessaie dans quelques secondes.";

function isMissingRpc(error: { code?: string; message: string }, name: string) {
  return (
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    new RegExp(`Could not find the (function|.*)${name}`, 'i').test(error.message)
  );
}

function isSchemaCacheError(error: { code?: string; message: string }) {
  return (
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    /schema cache/i.test(error.message)
  );
}

function publicErrorMessage(error: { code?: string; message: string }) {
  if (isSchemaCacheError(error)) return SCHEMA_CACHE_ERROR;
  return error.message;
}

const PURGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const PURGE_STORAGE_KEY = 'aypik-purge-deletions-at';

function maybePurgeExpiredDeletions() {
  try {
    const last = Number(localStorage.getItem(PURGE_STORAGE_KEY) || '0');
    if (Number.isFinite(last) && Date.now() - last < PURGE_COOLDOWN_MS) return;
    localStorage.setItem(PURGE_STORAGE_KEY, String(Date.now()));
  } catch {
    return;
  }
  void purgeExpiredDeletions();
}

async function claimOfferFallback(
  offer: SignupOffer,
  userId: string
): Promise<EnsureMembershipResult> {
  if (offer === 'founder') {
    const { data, error } = await supabase.rpc('try_claim_founder_slot', {
      p_user_id: userId,
    });
    if (!error && data && typeof data === 'object') {
      const row = data as Record<string, unknown>;
      return {
        ok: true,
        error: null,
        plan: (typeof row.plan === 'string' ? row.plan : 'founder') as MembershipPlan,
        is_founder: Boolean(row.is_founder),
      };
    }
    if (error) {
      return {
        ok: false,
        error: publicErrorMessage(error),
        plan: null,
        is_founder: false,
      };
    }
  }

  const { data, error } = await supabase.rpc('ensure_my_membership');
  if (!error && data && typeof data === 'object') {
    const raw = data as Record<string, unknown>;
    if (raw.linked === true) {
      return {
        ok: true,
        error: null,
        plan: (typeof raw.plan === 'string' ? raw.plan : 'free') as MembershipPlan,
        is_founder: Boolean(raw.is_founder),
      };
    }
  }

  return {
    ok: false,
    error: error ? publicErrorMessage(error) : SCHEMA_CACHE_ERROR,
    plan: null,
    is_founder: false,
  };
}

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
    maybePurgeExpiredDeletions();
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
    if (SITE_FREE_MODE) {
      return 'Les achats sont désactivés pendant le lancement.';
    }
    const { error: rpcError } = await supabase.rpc('purchase_boost');
    if (rpcError) {
      if (rpcError.message.includes('payments_disabled')) {
        return 'Les achats sont désactivés pendant le lancement.';
      }
      if (rpcError.message.includes('boost_not_available_for_founders')) {
        return "Le Boost n'est pas inclus dans l'offre Membre Fondateur.";
      }
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
      if (!user) {
        return {
          ok: false,
          error: 'Non authentifié',
          plan: null,
          is_founder: false,
        };
      }

      const { data, error: rpcError } = await supabase.rpc(
        'claim_signup_offer',
        { p_offer: offer }
      );

      if (rpcError) {
        if (isMissingRpc(rpcError, 'claim_signup_offer')) {
          const fallback = await claimOfferFallback(offer, user.id);
          if (fallback.ok) await refresh();
          return fallback;
        }
        return {
          ok: false,
          error: publicErrorMessage(rpcError),
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
    [refresh, user]
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
