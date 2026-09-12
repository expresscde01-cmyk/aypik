import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { t } from '@/i18n/t';
import { currentLocale } from '@/i18n/documentMeta';
import { isLocalizedContactPath, withLocalePrefix } from '@/i18n/path';
import { useMembership } from '@/lib/useMembership';

export function openLegalTerms() {
  const url = new URL(window.location.href);
  url.searchParams.set('legal', 'cgu');
  window.history.pushState({}, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function closeLegalTerms() {
  const url = new URL(window.location.href);
  url.searchParams.delete('legal');
  window.history.pushState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function isLegalTermsOpen() {
  return new URLSearchParams(window.location.search).get('legal') === 'cgu';
}

export function legalDocLabel(): string {
  return SITE_FREE_MODE ? t('legal.docLabelFree') : t('legal.docLabelPaid');
}

/** Intitulé du document légal affiché (CGU seules tant que le lancement est gratuit). */
export const LEGAL_DOC_LABEL = SITE_FREE_MODE ? 'CGU' : 'CGU / CGV';

export function LegalLink({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  const label = children ?? legalDocLabel();
  return (
    <button
      type="button"
      onClick={openLegalTerms}
      className={
        className ||
        'underline underline-offset-2 hover:text-rose-600 transition-colors'
      }
    >
      {label}
    </button>
  );
}

export const SUPPORT_EMAIL = 'aypik.contact@gmail.com';

export const CONTACT_PATH = '/contact';

export function contactHref(): string {
  return withLocalePrefix(currentLocale(), CONTACT_PATH);
}

export function isContactPage() {
  return isLocalizedContactPath();
}

export function ContactLink({
  className = '',
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <a
      href={contactHref()}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ||
        'underline underline-offset-2 hover:text-rose-600 transition-colors'
      }
    >
      {t('common.contactUs')}
    </a>
  );
}

export function SiteFooter({
  compact = false,
  showLegal = true,
}: {
  compact?: boolean;
  showLegal?: boolean;
}) {
  const { t } = useTranslation();
  const { status } = useMembership();
  const doc =
    SITE_FREE_MODE || !status.payment_visible
      ? t('legal.docLabelFree')
      : t('legal.docLabelPaid');
  return (
    <footer
      className={`border-t border-rose-100/80 bg-white/60 ${
        compact ? '' : 'mt-auto'
      }`}
    >
      <div
        className={`max-w-3xl mx-auto px-4 text-center text-xs text-gray-400 leading-relaxed ${
          compact ? 'py-2.5' : 'py-6 space-y-1.5'
        }`}
      >
        {compact ? (
          <p>
            {t('common.footerQuestions')} <ContactLink />
            {showLegal && (
              <>
                {' · '}
                <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                  {doc}
                </LegalLink>
              </>
            )}
          </p>
        ) : (
          <>
            <p>
              {t('common.footerQuestions')} <ContactLink />
            </p>
            {showLegal && (
              <p>
                {t('common.footerAgeLegal')}{' '}
                <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                  {doc}
                </LegalLink>
              </p>
            )}
          </>
        )}
      </div>
    </footer>
  );
}
