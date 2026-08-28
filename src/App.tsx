import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, ShieldCheck, X } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import ErrorBoundary from '@/components/ErrorBoundary';
import AppShell from '@/components/AppShell';
import LandingPage from '@/components/LandingPage';
import AuthScreen from '@/components/AuthScreen';
import ResetPasswordScreen from '@/components/ResetPasswordScreen';
import RouteFallback from '@/components/RouteFallback';
import { createAppQueryClient } from '@/lib/queryClient';
import LegalTermsPage, {
  closeLegalTerms,
  isLegalTermsOpen,
} from '@/components/LegalTerms';

const queryClient = createAppQueryClient();

const UNSUBSCRIBED_SUCCESS_MESSAGE =
  "Vous êtes désabonné·e. Vous ne recevrez plus d'e-mails de notification de la part d'Aypik. Les e-mails strictement nécessaires au fonctionnement du compte (sécurité, facturation) peuvent encore vous être envoyés.";

const UNSUBSCRIBED_ERROR_DEFAULT =
  'Ce lien de désabonnement est invalide.';

type UnsubscribeNotice = {
  kind: 'success' | 'error';
  text: string;
};

/**
 * Mémorise uniquement un vrai message. Ne jamais cacher `null` : un premier
 * chargement de `/` ne doit pas empêcher `?unsubscribed=` d’être lu ensuite.
 * Le cache sert au remount Strict Mode après replaceState.
 */
let consumedUnsubscribeNotice: UnsubscribeNotice | null = null;

function consumeUnsubscribedFromUrl(): UnsubscribeNotice | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('unsubscribed');

  if (raw === '1' || raw === '0') {
    consumedUnsubscribeNotice =
      raw === '1'
        ? { kind: 'success', text: UNSUBSCRIBED_SUCCESS_MESSAGE }
        : {
            kind: 'error',
            text: params.get('reason')?.trim() || UNSUBSCRIBED_ERROR_DEFAULT,
          };
    const url = new URL(window.location.href);
    url.searchParams.delete('unsubscribed');
    url.searchParams.delete('reason');
    window.history.replaceState(
      {},
      '',
      url.pathname + url.search + url.hash
    );
    return consumedUnsubscribeNotice;
  }

  return consumedUnsubscribeNotice;
}

function UnsubscribeBanner({
  notice,
  onClose,
}: {
  notice: UnsubscribeNotice;
  onClose: () => void;
}) {
  const isError = notice.kind === 'error';
  return (
    <div className="border-b border-rose-100/80 bg-white/90">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div
          role={isError ? 'alert' : 'status'}
          className={`flex items-start gap-2 p-3 rounded-xl text-sm animate-fadeIn ${
            isError
              ? 'bg-red-50 text-red-700'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {isError ? (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <span className="min-w-0 flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center shrink-0 -mt-1 -mr-1"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { session, loading, passwordRecovery, finishPasswordRecovery } = useAuth();
  const [showLegal, setShowLegal] = useState(isLegalTermsOpen);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [unsubNotice, setUnsubNotice] = useState<UnsubscribeNotice | null>(
    consumeUnsubscribedFromUrl
  );

  useEffect(() => {
    const notice = consumeUnsubscribedFromUrl();
    if (notice) setUnsubNotice(notice);
  }, []);

  useEffect(() => {
    const sync = () => setShowLegal(isLegalTermsOpen());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paypal = params.get('paypal');
    const stripe = params.get('stripe');
    if (paypal || stripe) {
      const url = new URL(window.location.href);
      url.searchParams.delete('paypal');
      url.searchParams.delete('stripe');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  useEffect(() => {
    if (session) setShowAuth(false);
  }, [session]);

  let page: ReactNode;
  if (showLegal) {
    page = <LegalTermsPage onClose={closeLegalTerms} />;
  } else if (loading) {
    page = <RouteFallback />;
  } else if (session && passwordRecovery) {
    page = <ResetPasswordScreen onDone={finishPasswordRecovery} />;
  } else if (session) {
    page = <AppShell />;
  } else if (showAuth) {
    page = (
      <AuthScreen
        initialMode={authMode}
        onBack={() => setShowAuth(false)}
      />
    );
  } else {
    page = (
      <LandingPage
        onAuthClick={(mode) => {
          setAuthMode(mode ?? 'signup');
          setShowAuth(true);
        }}
        onLogoClick={() => setShowAuth(false)}
      />
    );
  }

  return (
    <>
      {unsubNotice && (
        <UnsubscribeBanner
          notice={unsubNotice}
          onClose={() => {
            consumedUnsubscribeNotice = null;
            setUnsubNotice(null);
          }}
        />
      )}
      {page}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
