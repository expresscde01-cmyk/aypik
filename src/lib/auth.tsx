import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  clearCachedRecoveryToken,
  consumeRecoveryParamsFromUrl,
  fetchOwnLoginLocked,
  isPasswordRecoveryRedirect,
  takeRecoveryTokenFromUrl,
} from '@/lib/loginSecurity';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  passwordRecovery: false,
  finishPasswordRecovery: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    takeRecoveryTokenFromUrl();
    return isPasswordRecoveryRedirect();
  });
  const recoveryRef = useRef(passwordRecovery);

  useEffect(() => {
    let mounted = true;

    const applySession = async (sess: Session | null, recovery: boolean) => {
      if (!mounted) return;
      if (sess && !recovery) {
        const locked = await fetchOwnLoginLocked();
        if (!mounted) return;
        if (locked) {
          await supabase.auth.signOut();
          setSession(null);
          setPasswordRecovery(false);
          recoveryRef.current = false;
          clearCachedRecoveryToken();
          setLoading(false);
          return;
        }
      }
      setSession(sess);
      setLoading(false);
    };

    const boot = async () => {
      const recoveryToken = takeRecoveryTokenFromUrl();
      if (recoveryToken) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: recoveryToken.type,
          token_hash: recoveryToken.tokenHash,
        });
        if (!mounted) return;
        if (!error && data.session) {
          recoveryRef.current = true;
          setPasswordRecovery(true);
          consumeRecoveryParamsFromUrl();
          await applySession(data.session, true);
          return;
        }
        consumeRecoveryParamsFromUrl();
        clearCachedRecoveryToken();
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      consumeRecoveryParamsFromUrl();
      const recovery = isPasswordRecoveryRedirect();
      recoveryRef.current = recovery;
      if (recovery) setPasswordRecovery(true);
      await applySession(data.session, recovery);
    };

    boot().catch(() => {
      if (!mounted) return;
      setSession(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true;
        setPasswordRecovery(true);
        setSession(sess);
        setLoading(false);
        return;
      }
      if (event === 'SIGNED_OUT') {
        recoveryRef.current = false;
        setPasswordRecovery(false);
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
    clearCachedRecoveryToken();
    setSession(null);
  };

  const finishPasswordRecovery = () => {
    recoveryRef.current = false;
    setPasswordRecovery(false);
    clearCachedRecoveryToken();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        passwordRecovery,
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
