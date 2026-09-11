import { useEffect, useRef, useState } from 'react';
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
import {
  emailOrPasswordIncorrectMessage,
  isEmailAlreadyRegisteredError,
  isInvalidLoginCredentials,
  isObfuscatedDuplicateSignup,
  shouldCountLoginFailure,
  translateAuthError,
} from '@/lib/authErrors';
import { validateSignupPassword } from '@/lib/password';
import {
  accountLockedCheckMailMessage,
  accountLockedMessage,
  resetEmailSentMessage,
  isLoginClientTimeout,
  loginTimeoutMessage,
  loginLockFlagsFromError,
  notifyAccountLocked,
  isValidResetEmail,
  sendPasswordResetEmail,
  signInWithPasswordSecure,
} from '@/lib/loginSecurity';
import {
  adultsOnlyMessage,
  MIN_USER_AGE,
  isAdult,
  latestBirthDateForAge,
} from '@/lib/dating';
import { LegalLink, SiteFooter } from '@/components/LegalChrome';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import BirthDatePicker from '@/components/BirthDatePicker';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';
import {
  authNoticeMessage,
  consumeAuthNotice,
  writeRememberSession,
} from '@/lib/sessionIdle';
import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import { useTranslation, Trans } from 'react-i18next';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

type Mode = 'signin' | 'signup';

export default function AuthScreen({
  onBack,
  initialMode = 'signup',
}: {
  onBack?: () => void;
  initialMode?: Mode;
}) {
  const { t } = useTranslation();
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
  const [rememberSession, setRememberSession] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const notifiedLockEmails = useRef<Set<string>>(new Set());
  const maxAdultBirthDate = latestBirthDateForAge(MIN_USER_AGE);

  useEffect(() => {
    const notice = authNoticeMessage(consumeAuthNotice());
    if (notice) setInfo(notice);
  }, []);

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
      setError(t('auth.needEmailReset'));
      return;
    }
    if (!isValidResetEmail(email)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError(t('auth.needCaptcha'));
      return;
    }
    if (resetBusy) return;
    setResetBusy(true);
    setInfo(null);
    try {
      await sendPasswordResetEmail(email, captchaToken || undefined);
      setError(null);
      setOfferPasswordReset(false);
      setInfo(resetEmailSentMessage());
    } catch (err) {
      setOfferPasswordReset(true);
      setError(translateAuthError(err));
    } finally {
      setResetBusy(false);
      resetCaptcha();
    }
  };

  /**
   * Affiche le verrouillage uniquement si le serveur a locked_at.
   * E-mail « Déblocage… » (notify_lock) seulement au passage just_locked —
   * jamais de fallback reset_password qui mentirait sur le type d’e-mail.
   */
  const applyServerLock = async (
    currentEmail: string,
    justLocked: boolean
  ) => {
    setAccountLocked(true);
    const key = emailKey(currentEmail);

    if (justLocked && !notifiedLockEmails.current.has(key)) {
      notifiedLockEmails.current.add(key);
      const emailed = await notifyAccountLocked(currentEmail);
      if (emailed) {
        setOfferPasswordReset(false);
        setError(accountLockedMessage());
        return;
      }
    }

    setOfferPasswordReset(true);
    setError(accountLockedCheckMailMessage());
  };

  const showSignupConfirmation = () => {
    setSignupSuccess(true);
    setInfo(t('auth.confirmEmailSent', { email }));
  };

  const handlePasswordFailure = async (currentEmail: string, err: unknown) => {
    const flags = loginLockFlagsFromError(err);
    if (flags.locked) {
      await applyServerLock(currentEmail, flags.justLocked);
      return;
    }

    setAccountLocked(false);
    setOfferPasswordReset(true);
    setError(emailOrPasswordIncorrectMessage());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!accountLocked) setOfferPasswordReset(false);

    if (!email.trim()) {
      setError(t('auth.needEmail'));
      return;
    }

    if (mode === 'signup') {
      if (!birthDate) {
        setError(t('auth.needBirthDate'));
        return;
      }
      if (!isAdult(birthDate)) {
        setError(adultsOnlyMessage());
        return;
      }
      const passwordError = validateSignupPassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    } else if (password.length < 1) {
      setError(t('auth.needPassword'));
      return;
    }

    if (mode === 'signin' && accountLocked) {
      setOfferPasswordReset(true);
      setError(accountLockedCheckMailMessage());
      return;
    }

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError(t('auth.needCaptcha'));
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { birth_date: birthDate },
            captchaToken: captchaToken || undefined,
          },
        });
        if (error) {
          if (isEmailAlreadyRegisteredError(error)) {
            showSignupConfirmation();
            return;
          }
          throw error;
        }
        if (isObfuscatedDuplicateSignup(data.user)) {
          if (data.session) await supabase.auth.signOut();
        }
        showSignupConfirmation();
        return;
      }

      await signInWithPasswordSecure(
        email,
        password,
        captchaToken || undefined
      );

      writeRememberSession(rememberSession);
    } catch (err) {
      if (mode === 'signup' && isEmailAlreadyRegisteredError(err)) {
        showSignupConfirmation();
        return;
      }
      if (mode === 'signin' && isLoginClientTimeout(err)) {
        setError(loginTimeoutMessage());
        return;
      }
      if (mode === 'signin' && shouldCountLoginFailure(err)) {
        await handlePasswordFailure(email, err);
        return;
      }
      if (mode === 'signin' && isInvalidLoginCredentials(err)) {
        setOfferPasswordReset(true);
        setError(emailOrPasswordIncorrectMessage());
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
        <div className="flex justify-end mb-3">
          <LanguageSwitcher compact />
        </div>
        <div className="text-center mb-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onBack?.();
            }}
            className="inline-flex flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-rose-300 rounded-2xl"
            aria-label={t('common.homeAria')}
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
              {t('auth.tabSignup')}
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
              {t('auth.tabSignin')}
            </button>
          </div>

          {mode === 'signup' && signupSuccess ? (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {t('auth.checkMailTitle')}
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
                {t('auth.backToSignin')}
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (accountLocked) {
                      setAccountLocked(false);
                      setOfferPasswordReset(false);
                      setError(null);
                    }
                  }}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                  placeholder={t('auth.emailPlaceholder')}
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="signup-birth-date-year"
                  className="block text-sm font-semibold text-gray-700 mb-1.5"
                >
                  {t('auth.birthDate')}
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
                {t('auth.password')}
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
                      ? t('auth.passwordPlaceholderSignup')
                      : t('auth.passwordPlaceholderSignin')
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={
                    showPassword
                      ? t('auth.hidePassword')
                      : t('auth.showPassword')
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
                  {t('auth.passwordHint')}
                </p>
              )}
            </div>

            {mode === 'signin' && (
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={(e) => setRememberSession(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-500 focus:ring-rose-300"
                />
                <span className="text-sm text-gray-600 leading-snug">
                  <span className="font-semibold text-gray-800">
                    {t('auth.rememberSession')}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {t('auth.rememberSessionHint')}
                  </span>
                </span>
              </label>
            )}

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
                  {mode === 'signin' && error === loginTimeoutMessage() && (
                    <button
                      type="submit"
                      disabled={
                        loading ||
                        (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)
                      }
                      className="font-semibold underline underline-offset-2 hover:text-red-800 disabled:opacity-50"
                    >
                      {t('common.retry')}
                    </button>
                  )}
                  {mode === 'signin' && offerPasswordReset && (
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={resetBusy}
                      className="font-semibold underline underline-offset-2 hover:text-red-800 disabled:opacity-50"
                    >
                      {resetBusy ? t('auth.sendingLink') : t('auth.forgotPassword')}
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
                ? t('auth.loading')
                : mode === 'signup'
                  ? t('auth.submitSignup')
                  : accountLocked
                    ? t('auth.submitLocked')
                    : t('auth.submitSignin')}
            </button>
          </form>
          )}

          <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4" />
              {t('auth.badgePrivate')}
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Sparkles className="w-4 h-4" />
              {t('auth.badgeChildfree')}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          <Trans
            i18nKey="auth.legalConsent"
            components={{
              legalDoc: (
                <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors" />
              ),
            }}
          />
        </p>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}
