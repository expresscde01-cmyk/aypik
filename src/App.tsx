import { useEffect, useState } from 'react';
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
    return <RouteFallback />;
  }

  if (session && passwordRecovery) {
    return <ResetPasswordScreen onDone={finishPasswordRecovery} />;
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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
