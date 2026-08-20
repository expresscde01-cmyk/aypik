import { useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { translateAuthError } from '@/lib/authErrors';
import { validateSignupPassword } from '@/lib/password';
import { consumeRecoveryParamsFromUrl, unlockLoginSecurity } from '@/lib/loginSecurity';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import { SiteFooter } from '@/components/LegalTerms';

export default function ResetPasswordScreen({
  onDone,
}: {
  onDone: () => void;
}) {
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
      setError('Les deux mots de passe ne correspondent pas.');
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
      } catch (err) {
        console.error('unlockLoginSecurity after password update', err);
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
          <div className="text-center mb-8">
            <div className="mb-5">
              <BrandMark size="lg" className="mx-auto" />
            </div>
            <BrandLockup variant="hero" />
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-8">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              Nouveau mot de passe
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Choisis un mot de passe pour débloquer ton compte et te reconnecter.
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
                    placeholder="12 caractères min., majuscule, symbole"
                    autoComplete="new-password"
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
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Confirmer
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                    placeholder="Retape ton mot de passe"
                    autoComplete="new-password"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  Au moins 12 caractères, une majuscule et un caractère spécial.
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
                {loading ? 'Enregistrement...' : 'Enregistrer et débloquer'}
              </button>
            </form>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-6 pt-6 border-t border-gray-100">
              <ShieldCheck className="w-4 h-4" />
              Lien sécurisé à usage unique
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
