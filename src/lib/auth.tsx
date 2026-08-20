import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  consumeRecoveryParamsFromUrl,
  fetchOwnLoginLocked,
  getRecoveryTokenFromUrl,
  isPasswordRecoveryRedirect,
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
  const [passwordRecovery, setPasswordRecovery] = useState(() =>
    isPasswordRecoveryRedirect()
  );
  const recoveryRef = useRef(isPasswordRecoveryRedirect());

  useEffect(() => {
    let mounted = true;

    const applySession = async (sess: Session | null, recovery: boolean) => {
      if (!mounted) return;
      if (sess && !recovery) {
        try {
          const locked = await fetchOwnLoginLocked();
          if (!mounted) return;
          if (locked) {
            try {
              await supabase.auth.signOut();
            } catch (err) {
              console.error('applySession signOut locked', err);
            }
            setSession(null);
            setPasswordRecovery(false);
            recoveryRef.current = false;
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('applySession lock check', err);
        }
      }
      setSession(sess);
      setLoading(false);
    };

    const boot = async () => {
      try {
        const recoveryToken = getRecoveryTokenFromUrl();
        if (recoveryToken) {
          try {
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
          } catch (err) {
            console.error('boot verifyOtp', err);
          }
          consumeRecoveryParamsFromUrl();
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        consumeRecoveryParamsFromUrl();
        const recovery = isPasswordRecoveryRedirect();
        recoveryRef.current = recovery;
        if (recovery) setPasswordRecovery(true);
        await applySession(data.session, recovery);
      } catch (err) {
        console.error('boot session', err);
        if (!mounted) return;
        setSession(null);
        setLoading(false);
      }
    };

    boot().catch((err) => {
      console.error('boot', err);
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
        setSession(null);
        setLoading(false);
        return;
      }
      void applySession(sess, recoveryRef.current).catch((err) => {
        console.error('onAuthStateChange applySession', err);
        if (!mounted) return;
        setSession(sess);
        setLoading(false);
      });
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
    setSession(null);
  };

  const finishPasswordRecovery = () => {
    recoveryRef.current = false;
    setPasswordRecovery(false);
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
