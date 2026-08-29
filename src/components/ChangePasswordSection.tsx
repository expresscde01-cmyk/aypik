import { useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  isInvalidLoginCredentials,
  translateAuthError,
} from '@/lib/authErrors';
import { validateSignupPassword } from '@/lib/password';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const SUCCESS_MESSAGE = 'Votre mot de passe a été mis à jour avec succès';

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full pl-11 pr-11 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function ChangePasswordSection() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  /**
   * Après un enregistrement réussi, le bouton reste désactivé (même si le
   * widget CAPTCHA se re-valide tout seul en arrière-plan) tant que la
   * personne n'a pas retouché un des champs : ça évite qu'un bouton
   * "prêt à re-cliquer" reste affiché juste après le message de succès.
   */
  const handleFieldChange =
    (setter: (value: string) => void) => (value: string) => {
      setter(value);
      setSuccess(null);
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const email = user?.email?.trim();
    if (!email) {
      setError('Session invalide. Reconnecte-toi pour modifier ton mot de passe.');
      return;
    }
    if (!currentPassword) {
      setError('Saisis ton ancien mot de passe.');
      return;
    }

    const passwordError = validateSignupPassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Le nouveau mot de passe doit être différent de l\'ancien.');
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Merci de valider le CAPTCHA avant de continuer.');
      return;
    }

    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
        options: { captchaToken: captchaToken || undefined },
      });
      if (verifyError) {
        if (isInvalidLoginCredentials(verifyError)) {
          throw new Error("L'ancien mot de passe est incorrect.");
        }
        throw verifyError;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(SUCCESS_MESSAGE);
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setSaving(false);
      resetCaptcha();
    }
  };

  return (
    <div
      id="change-password"
      className="mt-4 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8"
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-1">
        MOT DE PASSE
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Modifie ton mot de passe. Il doit contenir au moins 12 caractères, une
        majuscule et un caractère spécial.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <PasswordField
          id="profile-current-password"
          label="Ancien mot de passe"
          value={currentPassword}
          onChange={handleFieldChange(setCurrentPassword)}
          autoComplete="current-password"
        />
        <PasswordField
          id="profile-new-password"
          label="Nouveau mot de passe"
          value={newPassword}
          onChange={handleFieldChange(setNewPassword)}
          autoComplete="new-password"
          placeholder="12 caractères min., majuscule, symbole"
          hint="Au moins 12 caractères, une majuscule et un caractère spécial."
        />
        <PasswordField
          id="profile-confirm-password"
          label="Confirmation du nouveau mot de passe"
          value={confirmPassword}
          onChange={handleFieldChange(setConfirmPassword)}
          autoComplete="new-password"
        />

        {TURNSTILE_SITE_KEY && (
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
            className="flex justify-center"
          />
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm animate-fadeIn">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={
            saving ||
            success !== null ||
            (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)
          }
          className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {saving ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
        </button>
      </form>
    </div>
  );
}
