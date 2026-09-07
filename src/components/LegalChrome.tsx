import type { ReactNode } from 'react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';

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

/** Intitulé du document légal affiché (CGU seules tant que le lancement est gratuit). */
export const LEGAL_DOC_LABEL = SITE_FREE_MODE ? 'CGU' : 'CGU / CGV';

export function LegalLink({
  children = LEGAL_DOC_LABEL,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={openLegalTerms}
      className={
        className ||
        'underline underline-offset-2 hover:text-rose-600 transition-colors'
      }
    >
      {children}
    </button>
  );
}

export const SUPPORT_EMAIL = 'aypik.contact@gmail.com';

export const CONTACT_PATH = '/contact';

export function isContactPage() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === CONTACT_PATH;
}

export function ContactLink({
  className = '',
}: {
  className?: string;
}) {
  return (
    <a
      href={CONTACT_PATH}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ||
        'underline underline-offset-2 hover:text-rose-600 transition-colors'
      }
    >
      Nous contacter
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
            Vous avez des questions ? <ContactLink />
            {showLegal && (
              <>
                {' · '}
                <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                  {LEGAL_DOC_LABEL}
                </LegalLink>
              </>
            )}
          </p>
        ) : (
          <>
            <p>
              Vous avez des questions ? <ContactLink />
            </p>
            {showLegal && (
              <p>
                Aypik · 18 ans et plus ·{' '}
                <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
                  {LEGAL_DOC_LABEL}
                </LegalLink>
              </p>
            )}
          </>
        )}
      </div>
    </footer>
  );
}
