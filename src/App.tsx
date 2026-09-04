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
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { queryClient } from '@/lib/queryClient';
import { fetchMaintenanceStatus } from '@/lib/maintenance';
import LegalTermsPage, {
  closeLegalTerms,
  isContactPage,
  isLegalTermsOpen,
} from '@/components/LegalTerms';
import ContactPage from '@/components/ContactPage';
import BrandLockupCopyGuard from '@/components/BrandLockupCopyGuard';

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

/**
 * Identifiant d’écran pour le scroll. Pas de React Router : les vues
 * s’échangent ici. Un changement d’écran (CGU, contact, auth, etc.)
 * remet toujours la fenêtre en haut — y compris si on rouvre les CGU
 * après les avoir déjà lues plus bas.
 */
function activeAppRoute(opts: {
  maintenanceGate: 'checking' | 'on' | 'off';
  showLegal: boolean;
  loading: boolean;
  hasSession: boolean;
  passwordRecovery: boolean;
  showAuth: boolean;
}): string {
  if (opts.maintenanceGate === 'on') return 'maintenance';
  if (opts.maintenanceGate === 'checking') return 'checking';
  if (opts.showLegal) return 'legal';
  if (isContactPage()) return 'contact';
  if (opts.loading) return 'loading';
  if (opts.hasSession && opts.passwordRecovery) return 'recovery';
  if (opts.hasSession) return 'app';
  if (opts.showAuth) return 'auth';
  return 'landing';
}

function AppContent() {
  const { session, loading, passwordRecovery, finishPasswordRecovery } = useAuth();
  /**
   * Vérifiée en parallèle de la session (et plus en amont, de façon
   * bloquante) : les deux appels réseau démarrent au même moment au premier
   * chargement au lieu de s'enchaîner l'un après l'autre, ce qui réduit
   * d'autant le temps avant le premier affichage utile (avant : durée
   * maintenance + durée session ; après : max des deux).
   */
  const { gate: maintenanceGate, message: maintenanceMessage } =
    useMaintenanceGate();
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

  const route = activeAppRoute({
    maintenanceGate,
    showLegal,
    loading,
    hasSession: Boolean(session),
    passwordRecovery,
    showAuth,
  });

  useEffect(() => {
    history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  let page: ReactNode;
  if (route === 'maintenance') {
    page = <MaintenanceScreen message={maintenanceMessage} />;
  } else if (route === 'checking' || route === 'loading') {
    page = <RouteFallback />;
  } else if (route === 'legal') {
    page = <LegalTermsPage onClose={closeLegalTerms} />;
  } else if (route === 'contact') {
    page = <ContactPage />;
  } else if (route === 'recovery') {
    page = <ResetPasswordScreen onDone={finishPasswordRecovery} />;
  } else if (route === 'app') {
    page = <AppShell />;
  } else if (route === 'auth') {
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
      {unsubNotice && maintenanceGate !== 'on' && (
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

/**
 * Démarre la vérification de maintenance dès le montage — indépendamment
 * de la session (voir AppContent) — plutôt que de bloquer tout l'arbre en
 * amont comme le faisait l'ancien composant MaintenanceGate.
 */
function useMaintenanceGate(): {
  gate: 'checking' | 'on' | 'off';
  message: string | null;
} {
  const [gate, setGate] = useState<'checking' | 'on' | 'off'>('checking');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMaintenanceStatus().then((status) => {
      if (cancelled) return;
      if (status.maintenance) {
        setMessage(status.message);
        setGate('on');
        return;
      }
      setGate('off');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { gate, message };
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrandLockupCopyGuard />
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
