import { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from '@/lib/authApi';
import { translateAuthError } from '@/lib/authErrors';
import { validateSignupPassword } from '@/lib/password';
import { LegalLink } from '@/components/LegalTerms';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import { useFounderAvailability } from '@/lib/useFounderAvailability';
import { founderOfferBadgeLabel } from '@/lib/membership';

type Mode = 'signin' | 'signup';

const AUTH_EMAIL_DRAFT_KEY = 'aypik_auth_email_draft';
const AUTH_MODE_DRAFT_KEY = 'aypik_auth_mode_draft';

function readAuthEmailDraft(): string {
  try {
    return sessionStorage.getItem(AUTH_EMAIL_DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

function readAuthModeDraft(): Mode {
  try {
    return sessionStorage.getItem(AUTH_MODE_DRAFT_KEY) === 'signin'
      ? 'signin'
      : 'signup';
  } catch {
    return 'signup';
  }
}

export default function AuthScreen({ onBack }: { onBack?: () => void }) {
  const [mode, setMode] = useState<Mode>(() => readAuthModeDraft());
  const [email, setEmail] = useState(() => readAuthEmailDraft());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { availability } = useFounderAvailability();
  const founderOpen = availability.founder_open;
  const founderBadge = founderOfferBadgeLabel(availability);

  useEffect(() => {
    try {
      sessionStorage.setItem(AUTH_EMAIL_DRAFT_KEY, email);
      sessionStorage.setItem(AUTH_MODE_DRAFT_KEY, mode);
    } catch {
      // ignore
    }
  }, [email, mode]);

  const handleBack = () => {
    try {
      sessionStorage.setItem(AUTH_EMAIL_DRAFT_KEY, email);
      sessionStorage.setItem(AUTH_MODE_DRAFT_KEY, mode);
    } catch {
      // ignore
    }
    onBack?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Veuillez saisir votre adresse e-mail.');
      return;
    }

    if (mode === 'signup') {
      const passwordError = validateSignupPassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    } else if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);

    try {
      // Auth découplée des e-mails : aucun await mail, aucune confirmation forcée.
      const { error: authError } =
        mode === 'signup'
          ? await signUpWithEmailPassword(email, password, { founderOpen })
          : await signInWithEmailPassword(email, password);
      if (authError) throw authError;
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {onBack && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Accueil
          </button>
        )}

        <div className="text-center mb-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              handleBack();
            }}
            className="inline-flex flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-rose-300 rounded-2xl"
            aria-label="Accueil Aypik"
          >
            <div className="mb-5 animate-pop">
              <BrandMark size="lg" className="mx-auto" />
            </div>
            <BrandLockup variant="hero" />
          </a>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-8">
          {mode === 'signup' && founderOpen && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-950">
                {founderBadge}
              </p>
              <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                Créez votre compte (e-mail et mot de passe) pour rejoindre
                l’offre Fondateur — aucun paiement requis.
              </p>
            </div>
          )}

          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Créer un compte
            </button>
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Se connecter
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                  placeholder={
                    mode === 'signup'
                      ? '12 caractères min., majuscule, symbole'
                      : 'Votre mot de passe'
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={
                    showPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="mt-1.5 text-xs text-gray-400">
                  Au moins 12 caractères, une majuscule et un caractère spécial.
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Chargement...'
                : mode === 'signup'
                  ? founderOpen
                    ? 'Créer mon compte Fondateur'
                    : 'Créer mon compte'
                  : 'Se connecter'}
            </button>
          </form>

          <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4" />
              100% privé
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Sparkles className="w-4 h-4" />
              Sans enfants
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          En vous inscrivant, vous confirmez être une personne sans enfant et
          accepter les{' '}
          <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
            CGU / CGV
          </LegalLink>
          .
        </p>
      </div>
    </div>
  );
}
