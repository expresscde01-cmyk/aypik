import { useRef, useState } from 'react';
import {
  Mail,
  Lock,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import HomeBackButton from '@/components/HomeBackButton';
import {
  EMAIL_ALREADY_REGISTERED_MESSAGE,
  isEmailAlreadyRegisteredError,
  isInvalidLoginCredentials,
  isObfuscatedDuplicateSignup,
  shouldCountLoginFailure,
  translateAuthError,
} from '@/lib/authErrors';
import { emailIsRegistered } from '@/lib/signupEmail';
import { validateSignupPassword } from '@/lib/password';
import {
  ACCOUNT_LOCKED_MESSAGE,
  LOGIN_FAILURE_LIMIT,
  RESET_EMAIL_SENT_MESSAGE,
  clearLoginFailuresIfAllowed,
  fetchLoginLockStatus,
  notifyAccountLocked,
  recordLoginFailure,
  isValidResetEmail,
  sendPasswordResetEmail,
} from '@/lib/loginSecurity';
import {
  ADULTS_ONLY_MESSAGE,
  MIN_USER_AGE,
  isAdult,
  latestBirthDateForAge,
} from '@/lib/dating';
import { LegalLink, SiteFooter } from '@/components/LegalTerms';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import BirthDatePicker from '@/components/BirthDatePicker';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

type Mode = 'signin' | 'signup';

export default function AuthScreen({
  onBack,
  initialMode = 'signup',
}: {
  onBack?: () => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [accountLocked, setAccountLocked] = useState(false);
  const [offerPasswordReset, setOfferPasswordReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const failCountByEmail = useRef<Map<string, number>>(new Map());
  const notifiedLockEmails = useRef<Set<string>>(new Set());
  const maxAdultBirthDate = latestBirthDateForAge(MIN_USER_AGE);

  const emailKey = (value: string) => value.trim().toLowerCase();

  const resetCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setAccountLocked(false);
    setOfferPasswordReset(false);
    setSignupSuccess(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Saisis ton adresse e-mail pour réinitialiser ton mot de passe.');
      return;
    }
    if (!isValidResetEmail(email)) {
      setError('Adresse e-mail invalide.');
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Merci de valider le CAPTCHA avant de continuer.');
      return;
    }
    if (resetBusy) return;
    setResetBusy(true);
    setInfo(null);
    try {
      await sendPasswordResetEmail(email, captchaToken || undefined);
      setError(null);
      setOfferPasswordReset(false);
      setInfo(RESET_EMAIL_SENT_MESSAGE);
    } catch (err) {
      setOfferPasswordReset(true);
      setError(translateAuthError(err));
    } finally {
      setResetBusy(false);
      resetCaptcha();
    }
  };

  const applyLock = async (currentEmail: string, sendAlert: boolean) => {
    setAccountLocked(true);
    setOfferPasswordReset(false);
    setError(ACCOUNT_LOCKED_MESSAGE);
    const key = emailKey(currentEmail);
    if (!sendAlert || notifiedLockEmails.current.has(key)) return;
    notifiedLockEmails.current.add(key);
    const emailed = await notifyAccountLocked(currentEmail);
    if (!emailed) {
      try {
        await sendPasswordResetEmail(currentEmail);
      } catch {
        /* e-mail de déblocage : silence en prod */
      }
    }
  };

  const handlePasswordFailure = async (currentEmail: string) => {
    const key = emailKey(currentEmail);
    const localCount = (failCountByEmail.current.get(key) || 0) + 1;
    failCountByEmail.current.set(key, localCount);

    const result = await recordLoginFailure(currentEmail);
    const locked =
      result.locked || localCount >= LOGIN_FAILURE_LIMIT;
    if (locked) {
      await applyLock(
        currentEmail,
        result.justLocked || localCount >= LOGIN_FAILURE_LIMIT
      );
      return;
    }

    setAccountLocked(false);
    setOfferPasswordReset(true);
    setError('Mot de passe incorrect.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!accountLocked) setOfferPasswordReset(false);

    if (!email.trim()) {
      setError('Saisis ton adresse e-mail.');
      return;
    }

    if (mode === 'signup') {
      if (!birthDate) {
        setError('Indique ta date de naissance.');
        return;
      }
      if (!isAdult(birthDate)) {
        setError(ADULTS_ONLY_MESSAGE);
        return;
      }
      const passwordError = validateSignupPassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    } else if (password.length < 1) {
      setError('Saisis ton mot de passe.');
      return;
    }

    if (mode === 'signin' && accountLocked) {
      setOfferPasswordReset(false);
      setError(ACCOUNT_LOCKED_MESSAGE);
      return;
    }

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Merci de valider le CAPTCHA avant de continuer.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        if (await emailIsRegistered(email)) {
          setError(EMAIL_ALREADY_REGISTERED_MESSAGE);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { birth_date: birthDate },
            captchaToken: captchaToken || undefined,
          },
        });
        if (error) throw error;
        if (isObfuscatedDuplicateSignup(data.user)) {
          if (data.session) await supabase.auth.signOut();
          setError(EMAIL_ALREADY_REGISTERED_MESSAGE);
          return;
        }
        setSignupSuccess(true);
        setInfo(
          `Un email de confirmation a été envoyé à ${email}. Clique sur le lien qu'il contient pour activer ton compte.`
        );
        return;
      }

      const alreadyBlocked =
        (failCountByEmail.current.get(emailKey(email)) || 0) >=
        LOGIN_FAILURE_LIMIT;
      if (alreadyBlocked) {
        await applyLock(email, false);
        return;
      }

      const locked = await fetchLoginLockStatus(email);
      if (locked) {
        await applyLock(email, false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: captchaToken || undefined },
      });
      if (error) throw error;
      if (!data.session) {
        await handlePasswordFailure(email);
        return;
      }

      failCountByEmail.current.delete(emailKey(email));
      const stillLocked = await clearLoginFailuresIfAllowed();
      if (stillLocked) {
        await supabase.auth.signOut();
        await applyLock(email, false);
      }
    } catch (err) {
      if (mode === 'signup' && isEmailAlreadyRegisteredError(err)) {
        setError(EMAIL_ALREADY_REGISTERED_MESSAGE);
        return;
      }
      if (mode === 'signin' && shouldCountLoginFailure(err)) {
        await handlePasswordFailure(email);
        return;
      }
      if (mode === 'signin' && isInvalidLoginCredentials(err)) {
        setOfferPasswordReset(true);
        setError('Mot de passe incorrect.');
        return;
      }
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {onBack && (
          <div className="mb-4 flex justify-start">
            <HomeBackButton onClick={onBack} />
          </div>
        )}

        <div className="text-center mb-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onBack?.();
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
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => switchMode('signup')}
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
              onClick={() => switchMode('signin')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Se connecter
            </button>
          </div>

          {mode === 'signup' && signupSuccess ? (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Vérifie ta boîte mail
                </p>
                <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                  {info}
                </p>
              </div>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-sm font-semibold text-rose-600 hover:text-rose-700 transition-colors"
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
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
                  onChange={(e) => {
                    const next = e.target.value;
                    setEmail(next);
                    const count =
                      failCountByEmail.current.get(emailKey(next)) || 0;
                    setAccountLocked(count >= LOGIN_FAILURE_LIMIT);
                  }}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                  placeholder="toi@exemple.com"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="signup-birth-date-year"
                  className="block text-sm font-semibold text-gray-700 mb-1.5"
                >
                  Date de naissance
                </label>
                <BirthDatePicker
                  id="signup-birth-date"
                  required
                  value={birthDate}
                  maxAgeDate={maxAdultBirthDate}
                  onChange={setBirthDate}
                />
              </div>
            )}

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
                      : 'Ton mot de passe'
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

            {TURNSTILE_SITE_KEY && (
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                className="flex justify-center"
              />
            )}

            {info && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm animate-fadeIn">
                <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{info}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-2">
                  <p>{error}</p>
                  {mode === 'signup' &&
                    error === EMAIL_ALREADY_REGISTERED_MESSAGE && (
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="font-semibold underline underline-offset-2 hover:text-red-800"
                      >
                        Se connecter
                      </button>
                    )}
                  {mode === 'signin' && offerPasswordReset && (
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={resetBusy}
                      className="font-semibold underline underline-offset-2 hover:text-red-800 disabled:opacity-50"
                    >
                      {resetBusy ? 'Envoi du lien...' : 'Mot de passe oublié ?'}
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (mode === 'signin' && accountLocked) ||
                (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)
              }
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Chargement...'
                : mode === 'signup'
                  ? 'Créer mon compte'
                  : accountLocked
                    ? 'Compte bloqué'
                    : 'Se connecter'}
            </button>
          </form>
          )}

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
          En t&apos;inscrivant, tu confirmes avoir 18 ans révolus, être une
          personne sans enfant et accepter les{' '}
          <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors" />
          .
        </p>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}
