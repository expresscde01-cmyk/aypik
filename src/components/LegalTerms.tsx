import { ArrowLeft } from 'lucide-react';
import { BrandLockup, BRAND_FULL } from '@/components/BrandLockup';

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

export function LegalLink({
  children = 'CGU / CGV',
  className = '',
}: {
  children?: React.ReactNode;
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

export default function LegalTermsPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-gray-900 text-sm sm:text-base">
            CGU / CGV
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <article className="bg-white rounded-3xl border border-rose-100 shadow-xl shadow-rose-100/40 p-6 sm:p-8 space-y-8 text-sm text-gray-700 leading-relaxed">
          <header className="space-y-2 border-b border-gray-100 pb-6">
            <BrandLockup
              variant="inline"
              className="text-[10px] text-rose-500"
            />
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Conditions Générales d&apos;Utilisation et de Vente (CGU / CGV)
            </h2>
          </header>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">
              Préambule &amp; Philosophie
            </h3>
            <p>
              La présente plateforme est un service de rencontre en ligne dédié
              exclusivement aux personnes n&apos;ayant pas d&apos;enfants. Notre
              modèle repose sur des valeurs d&apos;éthique, de transparence et de
              respect de nos membres. Nous refusons catégoriquement
              l&apos;utilisation de « dark patterns », de piégeage marketing ou
              d&apos;engagements cachés.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">
              Article 1 : Objet et Acceptation
            </h3>
            <p>
              Les présentes Conditions Générales d&apos;Utilisation et de Vente
              régissent l&apos;accès, l&apos;utilisation et les modalités de
              souscription aux services proposés sur la plateforme. Toute
              inscription implique l&apos;acceptation sans réserve des présentes
              conditions.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 2 : Accès au Service et Offre Freemium
            </h3>
            <div>
              <p className="font-semibold text-gray-900">L&apos;essentiel gratuit</p>
              <p>
                L&apos;accès de base à la plateforme est gratuit et permet de
                créer son profil, de matcher et d&apos;échanger des messages sans
                contrepartie financière.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Offre Membre Fondateur
              </p>
              <p>
                Strictement réservée aux 500 premiers membres inscrits, cette
                offre accorde 6 mois de services Premium offerts. Dès que ce
                plafond est atteint, l&apos;offre Membre Fondateur n&apos;est
                plus proposée : les nouveaux inscrits basculent automatiquement
                vers l&apos;offre freemium / Premium standard.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>
                  Aucune carte bancaire n&apos;est requise pour en bénéficier.
                </li>
                <li>
                  À l&apos;issue des 6 mois, le compte fait l&apos;objet d&apos;un
                  retour automatique à l&apos;offre gratuite, sans tacite
                  reconduction et sans prélèvement automatique.
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 3 : Abonnement Premium et Achats Ponctuels
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                Abonnement Premium (19,99&nbsp;€ / mois)
              </p>
              <p>
                Cet abonnement optionnel apporte du confort supplémentaire
                (filtrage avancé, voir qui a liké, likes illimités). Il est
                souscrit sans engagement et est résiliable à tout moment en un
                clic depuis l&apos;espace personnel.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Achats uniques (ex.&nbsp;: Boost 24&nbsp;h)
              </p>
              <p>
                Proposés à prix unique sous forme d&apos;achat ponctuel, ces
                services ne constituent en aucun cas un abonnement et ne génèrent
                aucun prélèvement récurrent.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Paiements</p>
              <p>
                Les transactions sont sécurisées par l&apos;intermédiaire de
                prestataires agréés (Stripe pour la carte bancaire, et PayPal).
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 4 : Propriété Intellectuelle et Protection du Concept
            </h3>
            <div>
              <p className="font-semibold text-gray-900">Contenus et Code</p>
              <p>
                L&apos;ensemble de la structure de la plateforme, de son code
                source, de ses interfaces graphiques, de ses textes et de sa
                charte éditoriale est protégé par les lois en vigueur sur la
                propriété intellectuelle. Toute reproduction, copie, aspiration
                de données (scraping) ou exploitation non autorisée du concept et
                des codes est strictement interdite.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Marque</p>
              <p>
                Le nom et l&apos;identité visuelle de la plateforme sont
                protégés.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">
              Article 5 : Comportement des Utilisateurs et Sécurité
            </h3>
            <p>
              Les utilisateurs s&apos;engagent à respecter la bienveillance de
              la communauté. Les profils ne correspondant pas à la philosophie
              du site ou adoptant un comportement malveillant, harcelant ou
              contraire à l&apos;éthique de la communauté feront l&apos;objet
              d&apos;une suspension ou d&apos;une suppression de compte
              immédiate, sans préavis ni remboursement.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">
              Article 6 : Résiliation et Suppression de Compte
            </h3>
            <p>
              L&apos;utilisateur peut à tout moment supprimer son compte et
              l&apos;intégralité de ses données personnelles en un clic depuis
              les paramètres de son profil, conformément à la réglementation sur
              la protection des données (RGPD).
            </p>
          </section>

          <footer className="border-t border-gray-100 pt-6 text-xs text-gray-400">
            En utilisant {BRAND_FULL}, vous confirmez avoir lu et
            accepté les présentes CGU / CGV.
          </footer>
        </article>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-rose-600 hover:text-rose-700"
          >
            Retour
          </button>
        </div>
      </main>
    </div>
  );
}
