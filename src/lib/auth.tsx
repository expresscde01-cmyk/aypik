import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  clearCachedRecoveryToken,
  consumeRecoveryParamsFromUrl,
  fetchOwnLoginLocked,
  takeRecoveryTokenFromUrl,
} from '@/lib/loginSecurity';
import { revealThenVerifyLock } from '@/lib/loginSessionGate';
import {
  recoveryLinkFailure,
  type RecoveryLinkFailure,
} from '@/lib/passwordRecoveryRoute';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  passwordRecovery: boolean;
  recoveryLinkError: RecoveryLinkFailure | null;
  finishPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

type RecoveryAttempt = NonNullable<ReturnType<typeof takeRecoveryTokenFromUrl>>;

let recoveryVerifyKey = '';
let recoveryVerifyTask: Promise<
  Awaited<ReturnType<typeof supabase.auth.verifyOtp>>
> | null = null;

function verifyRecoveryToken(token: RecoveryAttempt) {
  return supabase.auth.verifyOtp({
    type: token.type,
    token_hash: token.tokenHash,
  });
}

function verifyRecoveryTokenOnce(token: RecoveryAttempt) {
  if (recoveryVerifyTask && recoveryVerifyKey === token.tokenHash) {
    return recoveryVerifyTask;
  }
  recoveryVerifyKey = token.tokenHash;
  recoveryVerifyTask = verifyRecoveryToken(token);
  return recoveryVerifyTask;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  passwordRecovery: false,
  recoveryLinkError: null,
  finishPasswordRecovery: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => takeRecoveryTokenFromUrl() != null,
  );
  const [recoveryLinkError, setRecoveryLinkError] =
    useState<RecoveryLinkFailure | null>(null);
  const recoveryRef = useRef(passwordRecovery);
  const lockGateRef = useRef(0);
  const bootDoneRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const applySession = async (sess: Session | null, recovery: boolean) => {
      if (!mounted) return;
      if (sess && !recovery) {
        const gate = ++lockGateRef.current;
        revealThenVerifyLock({
          reveal: () => {
            setSession(sess);
            setLoading(false);
          },
          isLocked: fetchOwnLoginLocked,
          onLocked: async () => {
            if (!mounted || lockGateRef.current !== gate) return;
            await supabase.auth.signOut();
            if (!mounted || lockGateRef.current !== gate) return;
            setSession(null);
            setPasswordRecovery(false);
            recoveryRef.current = false;
            clearCachedRecoveryToken();
            setLoading(false);
          },
        });
        return;
      }
      setSession(sess);
      setLoading(false);
    };

    const boot = async () => {
      const recoveryToken = takeRecoveryTokenFromUrl();
      if (recoveryToken) {
        const { data, error } = await verifyRecoveryTokenOnce(recoveryToken);
        if (!mounted) return;
        if (!error && data.session) {
          bootDoneRef.current = true;
          recoveryRef.current = true;
          setPasswordRecovery(true);
          setRecoveryLinkError(null);
          supabase.auth.stopAutoRefresh();
          consumeRecoveryParamsFromUrl();
          await applySession(data.session, true);
          return;
        }
        consumeRecoveryParamsFromUrl();
        clearCachedRecoveryToken();
        bootDoneRef.current = true;
        recoveryRef.current = true;
        setPasswordRecovery(true);
        setRecoveryLinkError(recoveryLinkFailure(error) ?? 'invalid');
        const { data: existing } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(existing.session);
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      bootDoneRef.current = true;
      consumeRecoveryParamsFromUrl();
      await applySession(data.session, recoveryRef.current);
    };

    boot().catch(() => {
      if (!mounted) return;
      bootDoneRef.current = true;
      if (recoveryRef.current) setRecoveryLinkError('invalid');
      setSession(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;
      if (
        !bootDoneRef.current &&
        event !== 'PASSWORD_RECOVERY' &&
        event !== 'SIGNED_OUT'
      ) {
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true;
        setPasswordRecovery(true);
        setRecoveryLinkError(null);
        if (sess) supabase.auth.stopAutoRefresh();
        setSession(sess);
        setLoading(false);
        return;
      }
      if (event === 'SIGNED_OUT') {
        recoveryRef.current = false;
        setPasswordRecovery(false);
        setRecoveryLinkError(null);
        clearCachedRecoveryToken();
        setSession(null);
        setLoading(false);
        return;
      }
      void applySession(sess, recoveryRef.current);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
    }
    recoveryRef.current = false;
    setPasswordRecovery(false);
    setRecoveryLinkError(null);
    clearCachedRecoveryToken();
    setSession(null);
  };

  const finishPasswordRecovery = () => {
    recoveryRef.current = false;
    setPasswordRecovery(false);
    setRecoveryLinkError(null);
    clearCachedRecoveryToken();
    void supabase.auth.startAutoRefresh();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        passwordRecovery,
        recoveryLinkError,
        finishPasswordRecovery,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
