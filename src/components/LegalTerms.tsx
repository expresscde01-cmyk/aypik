import { ArrowLeft } from 'lucide-react';
import { BRAND_NAME, BRAND_BASELINE, BRAND_FULL } from '@/components/BrandLockup';
import { SITE_FREE_MODE, FOUNDER_MAX_SLOTS } from '@/lib/founderCopy';

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

export const SUPPORT_EMAIL = 'aypik.contact@gmail.com';

export function ContactLink({
  className = '',
}: {
  className?: string;
}) {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
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
                  CGU / CGV
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
                  CGU / CGV
                </LegalLink>
              </p>
            )}
          </>
        )}
      </div>
    </footer>
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
            <p className="inline-flex items-baseline gap-1.5 text-[10px]">
              <span
                className="font-extrabold uppercase tracking-[0.22em]"
                style={{ color: '#C71585' }}
              >
                {BRAND_NAME}
              </span>
              <span className="text-xs font-light tracking-wide text-gray-600">
                <span className="mr-1" aria-hidden>
                  —
                </span>
                {BRAND_BASELINE}
              </span>
            </p>
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

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">
              Article 2 : Majorité et interdiction aux mineurs
            </h3>
            <p>
              La plateforme {BRAND_NAME} est un service de rencontre
              exclusivement réservé aux personnes majeures. Toute inscription,
              tout accès et toute utilisation du Service par une personne âgée
              de moins de 18 ans sont strictement interdits.
            </p>
            <p>
              En s&apos;inscrivant, l&apos;utilisateur déclare et garantit
              avoir 18 ans révolus à la date de création du compte. Une date
              de naissance est exigée ; l&apos;accès est refusé si l&apos;âge
              déclaré est inférieur à 18 ans.
            </p>
            <p>
              {BRAND_NAME} se réserve le droit de refuser, suspendre ou
              supprimer, sans préavis, tout compte dont le titulaire s&apos;avérerait
              mineur ou aurait fourni une date de naissance inexacte afin de
              contourner cette interdiction.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 3 : Accès au Service et Offre Freemium
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
                Strictement réservée aux {FOUNDER_MAX_SLOTS} premiers membres
                inscrits, cette offre accorde 6 mois de services Premium
                offerts, likes illimités, un flash, et un boost de
                visibilité du profil pendant le premier mois. Le titre de
                Membre Fondateur et le numéro associé restent visibles tant
                que le compte est actif. Dès que ce plafond est atteint,
                l&apos;offre n&apos;est plus proposée.
              </p>
              <p>
                Le statut de Membre Fondateur et son numéro associé sont
                strictement liés au compte actif. En cas de désinscription ou
                de suppression du compte, le badge est définitivement perdu et
                ne pourra pas être réattribué.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>
                  À l&apos;issue des 6 mois, les avantages fonctionnels
                  prennent fin et le compte revient à l&apos;offre gratuite,
                  sans tacite reconduction ni prélèvement. Le badge Membre
                  Fondateur reste honorifique tant que le compte existe.
                </li>
                <li>
                  Aucune carte bancaire n&apos;est requise pour en bénéficier.
                </li>
              </ul>
            </div>
          </section>

          {!SITE_FREE_MODE && (
          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 4 : Abonnement Premium et Achats Ponctuels
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                {SITE_FREE_MODE
                  ? 'Abonnement Premium'
                  : 'Abonnement Premium (19,99\u00a0€ / mois)'}
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
          )}

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 5 : Propriété Intellectuelle et Protection du Concept
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
              Article 6 : Comportement des Utilisateurs et Sécurité
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
              Article 7 : Résiliation et Suppression de Compte
            </h3>
            <p>
              L&apos;utilisateur peut à tout moment demander la suppression de
              son compte et de l&apos;intégralité de ses données personnelles
              depuis les paramètres de son profil, conformément à la
              réglementation sur la protection des données (RGPD). La
              suppression n&apos;est pas immédiate : le compte passe au statut
              « en cours de suppression » pendant 30 jours. Une reconnexion
              pendant ce délai permet d&apos;annuler la demande. Passé ce délai,
              toutes les données sont effacées définitivement.
            </p>
            <p>
              Le statut de Membre Fondateur et son numéro associé sont
              strictement liés au compte actif. En cas de désinscription ou
              de suppression du compte, le badge est définitivement perdu et
              ne pourra pas être réattribué.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">Glossaire</h3>
            <div>
              <p className="font-semibold text-gray-900">Like</p>
              <p>
                Action simple permettant d&apos;exprimer un intérêt pour le
                profil d&apos;un autre membre de manière discrète.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Flash</p>
              <p>
                Action prioritaire et plus appuyée qu&apos;un simple Like,
                envoyant un signal fort et direct à la personne ciblée pour lui
                signifier un intérêt immédiat.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Match</p>
              <p>
                Relation bilatérale établie entre deux membres, actant
                qu&apos;un intérêt mutuel a été confirmé (qu&apos;il provienne
                de Likes croisés ou d&apos;un Flash accepté). C&apos;est cette
                validation mutuelle qui ouvre l&apos;accès à la messagerie.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Messagerie et consentement
              </p>
              <p>
                Par mesure de sécurité et de prévention des contacts non
                sollicités, l&apos;envoi de messages est strictement
                conditionné à un Match préalable. Il est donc impossible de
                dialoguer avec un membre sans avoir reçu ou vu son Like/Flash
                accepté en retour.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Matché le</p>
              <p>
                Indique la date à laquelle l&apos;utilisateur a répondu
                favorablement (par un Like retour ou l&apos;acceptation
                d&apos;un Flash) à l&apos;intérêt initial d&apos;un autre
                membre.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Match le</p>
              <p>
                Indique la date à laquelle le Like ou le Flash initialement
                envoyé par l&apos;utilisateur a été accepté en retour.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Boost</p>
              <p>
                Fonctionnalité permettant de mettre en avant son profil en tête
                de liste pendant une durée déterminée pour maximiser sa
                visibilité.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Questions fréquentes
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                Puis-je m&apos;inscrire si j&apos;ai moins de 18 ans&nbsp;?
              </p>
              <p>
                Non. Le Service est exclusivement réservé aux personnes
                majeures. L&apos;inscription et l&apos;accès sont refusés à
                toute personne de moins de 18 ans.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Comment se passe la suppression de mon compte&nbsp;?
              </p>
              <p>
                La suppression n&apos;est pas immédiate : vous disposez d&apos;un
                délai de 30 jours pour vous reconnecter et annuler. Passé ce
                délai, toutes vos données sont définitivement effacées.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Que devient le badge Membre Fondateur si je me désinscris&nbsp;?
              </p>
              <p>
                Le statut de Membre Fondateur et son numéro associé sont
                strictement liés au compte actif. En cas de désinscription ou
                de suppression du compte, le badge est définitivement perdu et
                ne pourra pas être réattribué.
              </p>
            </div>
          </section>

          <footer className="border-t border-gray-100 pt-6 text-xs text-gray-400 space-y-2">
            <p>
              Vous avez des questions ?{' '}
              <ContactLink className="underline underline-offset-2 hover:text-rose-600 transition-colors" />
            </p>
            <p>
              En utilisant {BRAND_FULL}, vous confirmez avoir lu et
              accepté les présentes CGU / CGV.
            </p>
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
