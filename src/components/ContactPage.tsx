import { useRef, useState } from 'react';
import { AlertCircle, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import { LegalLink, SiteFooter } from '@/components/LegalTerms';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';
import {
  CONTACT_CATEGORIES,
  CONTACT_SUCCESS_MESSAGE,
  submitContactForm,
  validateContactForm,
} from '@/lib/contact';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const FIELD_CLASS =
  'w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400 bg-white';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const values = { name, email, category, message, consent };
    const validationError = validateContactForm(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const result = await submitContactForm(values, captchaToken);
      if (result.ok) {
        setSent(true);
        return;
      }
      setError(result.error);
      resetCaptcha();
    } catch {
      setError(
        "L'envoi a échoué. Merci de réessayer dans quelques instants."
      );
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-lg">
          <div className="text-center mb-8">
            <a
              href="/"
              className="inline-flex flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-rose-300 rounded-2xl"
              aria-label="Accueil Aypik"
            >
              <div className="mb-5">
                <BrandMark size="lg" className="mx-auto" />
              </div>
              <BrandLockup variant="hero" />
            </a>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-8">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Nous contacter
            </h1>
            <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
              Une question, un souci technique ou un signalement : écrivez-nous,
              nous lisons chaque message.
            </p>

            {sent ? (
              <div className="mt-6 space-y-4 text-center py-2">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {CONTACT_SUCCESS_MESSAGE}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="contact-name"
                    className="block text-sm font-semibold text-gray-700 mb-1.5"
                  >
                    Nom
                  </label>
                  <div className="relative">
                    <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="contact-name"
                      type="text"
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`${FIELD_CLASS} pl-11`}
                      placeholder="Votre nom"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contact-email"
                    className="block text-sm font-semibold text-gray-700 mb-1.5"
                  >
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="contact-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${FIELD_CLASS} pl-11`}
                      placeholder="vous@exemple.com"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    Nous l’utiliserons uniquement pour vous répondre.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="contact-category"
                    className="block text-sm font-semibold text-gray-700 mb-1.5"
                  >
                    Sujet
                  </label>
                  <select
                    id="contact-category"
                    name="category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="">Choisir un sujet</option>
                    {CONTACT_CATEGORIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    className="block text-sm font-semibold text-gray-700 mb-1.5"
                  >
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={6}
                    maxLength={4000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={`${FIELD_CLASS} resize-y min-h-[8rem]`}
                    placeholder="Votre message"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-rose-500 focus:ring-rose-200"
                  />
                  <span>
                    J&apos;accepte que mes données soient utilisées pour traiter
                    ma demande. Voir les{' '}
                    <LegalLink>CGU (politique de confidentialité)</LegalLink>.
                  </span>
                </label>

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
                    <p>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    loading ||
                    (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)
                  }
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Envoi…' : 'Envoyer'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
