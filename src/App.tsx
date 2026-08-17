import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import AuthScreen from '@/components/AuthScreen';
import ResetPasswordScreen from '@/components/ResetPasswordScreen';
import AppShell from '@/components/AppShell';
import LandingPage from '@/components/LandingPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import LegalTermsPage, {
  closeLegalTerms,
  isLegalTermsOpen,
} from '@/components/LegalTerms';

function AppContent() {
  const { session, loading, passwordRecovery, finishPasswordRecovery } = useAuth();
  const [showLegal, setShowLegal] = useState(isLegalTermsOpen);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

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

  if (showLegal) {
    return <LegalTermsPage onClose={closeLegalTerms} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-amber-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-200 animate-pop">
            <svg
              className="w-6 h-6 text-white animate-pulse"
              fill="white"
              viewBox="0 0 24 24"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
          <div className="text-gray-400 text-sm">Chargement...</div>
        </div>
      </div>
    );
  }

  if (session && passwordRecovery) {
    return (
      <ResetPasswordScreen
        onDone={finishPasswordRecovery}
      />
    );
  }

  if (session) {
    return <AppShell />;
  }

  if (showAuth) {
    return (
      <AuthScreen
        initialMode={authMode}
        onBack={() => setShowAuth(false)}
      />
    );
  }

  return (
    <LandingPage
      onAuthClick={(mode) => {
        setAuthMode(mode ?? 'signup');
        setShowAuth(true);
      }}
      onLogoClick={() => setShowAuth(false)}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
