import { useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { translateAuthError } from '@/lib/authErrors';
import { validateSignupPassword } from '@/lib/password';
import { consumeRecoveryParamsFromUrl, unlockLoginSecurity } from '@/lib/loginSecurity';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import { SiteFooter } from '@/components/LegalChrome';
import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

export default function ResetPasswordScreen({
  onDone,
}: {
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    consumeRecoveryParamsFromUrl();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const passwordError = validateSignupPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      try {
        await unlockLoginSecurity();
      } catch {
        /* SQL pas encore appliqué : le mot de passe est déjà à jour */
      }
      onDone();
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="relative w-full max-w-md">
          <div className="flex justify-end mb-3">
            <LanguageSwitcher compact />
          </div>
          <div className="text-center mb-8">
            <div className="mb-5">
              <BrandMark size="lg" className="mx-auto" />
            </div>
            <BrandLockup variant="hero" />
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-8">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              {t('auth.resetTitle')}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              {t('auth.resetSubtitle')}
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
                    placeholder={t('auth.passwordPlaceholderSignup')}
                    autoComplete="new-password"
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
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('auth.confirmPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    autoComplete="new-password"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {t('auth.passwordHint')}
                </p>
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
                {loading ? t('auth.saving') : t('auth.saveUnlock')}
              </button>
            </form>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-6 pt-6 border-t border-gray-100">
              <ShieldCheck className="w-4 h-4" />
              {t('auth.secureLink')}
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
