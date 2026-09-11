import { useEffect, useState, type FormEvent } from 'react';
import { Check, Quote } from 'lucide-react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { isPaidPremiumActive, type MembershipStatus } from '@/lib/membership';
import { userErrorMessage } from '@/lib/userError';
import {
  fetchMyTestimonial,
  submitPaidTestimonial,
  TESTIMONIAL_MAX_LEN,
  TESTIMONIAL_MIN_LEN,
  withdrawMyTestimonial,
  type MyTestimonial,
} from '@/lib/testimonials';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '@/i18n/format';

export default function TestimonialForm({
  status,
}: {
  status: MembershipStatus;
}) {
  const { t } = useTranslation();
  const [mine, setMine] = useState<MyTestimonial | null>(null);
  const [body, setBody] = useState('');
  const [consent, setConsent] = useState(false);
  const [includeAvatar, setIncludeAvatar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const allowed = !SITE_FREE_MODE && isPaidPremiumActive(status);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const row = await fetchMyTestimonial();
        if (!active) return;
        setMine(row);
        if (row?.exists && row.body) setBody(row.body);
        setIncludeAvatar(Boolean(row?.avatar_url));
        setConsent(false);
      } catch (err) {
        if (active) setError(userErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!consent) {
      setError(t('profile.testimonialConsentRequired'));
      return;
    }
    if (body.trim().length < TESTIMONIAL_MIN_LEN) {
      setError(
        t('profile.testimonialTooShortHint', { count: TESTIMONIAL_MIN_LEN })
      );
      return;
    }
    setSaving(true);
    const err = await submitPaidTestimonial({
      body: body.trim(),
      consent,
      includeAvatar,
    });
    setSaving(false);
    if (err) {
      setError(userErrorMessage(err));
      return;
    }
    setSaved(true);
    setConsent(false);
    try {
      setMine(await fetchMyTestimonial());
    } catch {
      /* ignore refresh error */
    }
  };

  const handleWithdraw = async () => {
    if (
      !window.confirm(t('profile.testimonialWithdrawConfirm'))
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    const err = await withdrawMyTestimonial();
    setSaving(false);
    if (err) {
      setError(userErrorMessage(err));
      return;
    }
    setMine({
      exists: false,
      consent_given: false,
      consent_given_at: null,
      can_submit: true,
    });
    setBody('');
    setConsent(false);
    setIncludeAvatar(false);
    setSaved(false);
  };

  return (
    <section
      id="temoignage-form"
      className="rounded-3xl border border-rose-100 bg-white/90 p-5 sm:p-6 shadow-sm shadow-rose-100/50 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 to-amber-50 border border-rose-100">
          <Quote className="h-5 w-5 text-rose-500" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            {t('profile.testimonialTitle')}
          </h2>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">
            {t('profile.testimonialReserved')}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loadingEllipsis')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mine?.exists && (
            <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              {t('profile.testimonialPublished')}
              {mine.consent_given_at
                ? t('profile.testimonialConsentOf', {
                    date: new Date(mine.consent_given_at).toLocaleString(
                      dateLocale()
                    ),
                  })
                : ''}
              .
            </p>
          )}

          <div>
            <label
              htmlFor="testimonial-body"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              {t('profile.testimonialMessage')}
            </label>
            <textarea
              id="testimonial-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={TESTIMONIAL_MAX_LEN}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400 resize-none"
              placeholder={t('profile.testimonialPlaceholder')}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {body.trim().length}/{TESTIMONIAL_MAX_LEN}
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAvatar}
              onChange={(e) => setIncludeAvatar(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              {t('profile.testimonialShowPhoto')}
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer rounded-2xl border border-rose-100 bg-rose-50/50 p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
              required
            />
            <span className="text-sm text-gray-800 leading-relaxed">
              {t('profile.testimonialConsentLabel')}
              <span className="block text-xs text-gray-500 mt-1">
                {t('profile.testimonialConsentHint')}
              </span>
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          {saved && (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check className="h-4 w-4" />
              {t('profile.testimonialSaved')}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={saving || !consent}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {saving
                ? t('profile.savingPref')
                : mine?.exists
                  ? t('profile.testimonialUpdate')
                  : t('profile.testimonialPublish')}
            </button>
            {mine?.exists && (
              <button
                type="button"
                onClick={() => void handleWithdraw()}
                disabled={saving}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                {t('profile.testimonialWithdraw')}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
