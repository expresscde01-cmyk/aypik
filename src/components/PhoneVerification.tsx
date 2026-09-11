import { useEffect, useRef, useState } from 'react';
import { Phone, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { translateAuthError } from '@/lib/authErrors';
import { toE164France, formatE164ForDisplay, isValidOtpCode } from '@/lib/phone';
import { requestPhoneVerificationSms } from '@/lib/sendPhoneVerification';
import { useAuth } from '@/lib/auth';
import { BrandMark } from '@/components/BrandLockup';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';
import { useTranslation } from 'react-i18next';

/** Doit correspondre au réglage "SMS OTP Expiry" côté Supabase Dashboard. */
const OTP_VALIDITY_SECONDS = 60;

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

type Step = 'enter-phone' | 'enter-code';

/**
 * Étape obligatoire après inscription : l'utilisateur doit confirmer un
 * numéro de téléphone par SMS (OTP) avant d'accéder au reste du site.
 *
 * L'envoi passe par l'Edge Function send-phone-verification (JWT, Turnstile,
 * allowlist pays, quotas 24 h). verifyOtp type phone_change reste ici : il
 * ne déclenche pas d'SMS.
 *
 * Limite connue : un client avancé peut appeler PUT /auth/v1/user avec son
 * JWT et contourner l'app. Endpoint GoTrue natif, non révocable. Les verrous
 * restants sont les Geographic Permissions Twilio et le plafond projet
 * 30 SMS/h — ouvrir d'autres pays progressivement.
 */
export default function PhoneVerification() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [step, setStep] = useState<Step>('enter-phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const captchaBlocking = Boolean(TURNSTILE_SITE_KEY) && !captchaToken;

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const startCooldown = () => {
    setCooldown(OTP_VALIDITY_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((n) => {
        if (n <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };

  const sendCode = async (target: string) => {
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError(t('auth.needCaptcha'));
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await requestPhoneVerificationSms(target, captchaToken);
      setE164(target);
      setStep('enter-code');
      setInfo(t('auth.phoneCodeSent', { phone: formatE164ForDisplay(target) }));
      startCooldown();
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      resetCaptcha();
      setLoading(false);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const target = toE164France(phoneInput);
    if (!target) {
      setError(t('auth.phoneInvalidFrance'));
      return;
    }
    await sendCode(target);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!e164) return;
    if (!isValidOtpCode(code)) {
      setError(t('auth.phoneCodeDigits'));
      return;
    }
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: code.trim(),
        type: 'phone_change',
      });
      if (verifyError) throw verifyError;
      // Le contexte d'auth se met à jour tout seul via onAuthStateChange
      // (user.phone_confirmed_at) ; AppShell referme automatiquement cet
      // écran dès que c'est le cas.
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!e164 || cooldown > 0 || loading || captchaBlocking) return;
    await sendCode(e164);
  };

  const handleEditNumber = () => {
    setStep('enter-phone');
    setCode('');
    setError(null);
    setInfo(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-5">
            <BrandMark size="lg" className="mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('auth.phoneTitle')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            {t('auth.phoneIntro')}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-8">
          {step === 'enter-phone' && (
            <form onSubmit={handlePhoneSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('auth.phoneLabel')}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                    placeholder="06 52 28 94 11"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {t('auth.phoneFranceOnly')}
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              {TURNSTILE_SITE_KEY && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken(null)}
                  className="flex justify-center"
                />
              )}

              <button
                type="submit"
                disabled={loading || captchaBlocking}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? t('auth.phoneSending') : t('auth.phoneSendSms')}
              </button>
            </form>
          )}

          {step === 'enter-code' && (
            <form onSubmit={handleCodeSubmit} noValidate className="space-y-4">
              <button
                type="button"
                onClick={handleEditNumber}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.phoneChange')}
              </button>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('auth.phoneCodeLabel')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/[^\d]/g, ''))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400 text-center text-lg tracking-[0.5em] font-semibold"
                  placeholder="000000"
                />
              </div>

              {info && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{info}</span>
                </div>
              )}

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? t('auth.phoneVerifying') : t('auth.phoneValidate')}
              </button>

              {TURNSTILE_SITE_KEY && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken(null)}
                  className="flex justify-center"
                />
              )}

              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={cooldown > 0 || loading || captchaBlocking}
                className="w-full text-sm font-semibold text-rose-600 hover:text-rose-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {cooldown > 0
                  ? t('auth.phoneResendWait', { seconds: cooldown })
                  : t('auth.phoneResend')}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
