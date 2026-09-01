import { ArrowLeft } from 'lucide-react';
import { BRAND_NAME, BRAND_BASELINE } from '@/components/BrandLockup';
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

/** Intitulé du document légal affiché (CGU seules tant que le lancement est gratuit). */
export const LEGAL_DOC_LABEL = SITE_FREE_MODE ? 'CGU' : 'CGU / CGV';

export function LegalLink({
  children = LEGAL_DOC_LABEL,
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
            {LEGAL_DOC_LABEL}
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
              Conditions Générales d&apos;Utilisation
            </h2>
            <p className="text-xs text-gray-500">
              Dernière mise à jour : 31 août 2026. Version applicable au
              lancement bénévole et gratuit du Service.
            </p>
          </header>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">Préambule</h3>
            <p>
              {BRAND_NAME} est une plateforme de rencontre en ligne dédiée
              exclusivement aux personnes majeures n&apos;ayant pas
              d&apos;enfants. Elle est éditée à titre personnel, dans le cadre
              d&apos;un projet bénévole, non lucratif au lancement, et conçu
              pour rester accessible sans contrepartie financière pour
              l&apos;usage de base.
            </p>
            <p>
              Le Service repose sur la transparence, la bienveillance et le
              refus des « dark patterns » : pas de pratiques trompeuses, pas
              d&apos;engagement caché, pas de carte bancaire exigée pour
              s&apos;inscrire ou utiliser le cœur du Service, pas de
              réduction artificielle des fonctionnalités de base destinée à
              contraindre un paiement.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 1 — Mentions légales (LCEN)
            </h3>
            <p>
              Conformément à la loi n° 2004-575 du 21 juin 2004 pour la
              confiance dans l&apos;économie numérique (LCEN), les présentes
              mentions identifient l&apos;éditeur du Service et
              l&apos;hébergeur.
            </p>
            <div>
              <p className="font-semibold text-gray-900">Éditeur du Service</p>
              <p>
                Le site {BRAND_NAME} (accessible notamment à l&apos;adresse{' '}
                <a
                  href="https://aypik.fr"
                  className="underline underline-offset-2 hover:text-rose-600"
                >
                  https://aypik.fr
                </a>
                ) est édité par une personne physique agissant à titre non
                professionnel, dans le cadre d&apos;un projet bénévole.
              </p>
              <p>
                Directeur de la publication : le fondateur d&apos;{BRAND_NAME},
                personne physique, joignable à l&apos;adresse{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="underline underline-offset-2 hover:text-rose-600"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
              <p>
                En application de l&apos;article 6, III de la LCEN, dès lors
                que l&apos;édition s&apos;effectue à titre non professionnel,
                l&apos;éditeur peut limiter la publication de ses éléments
                d&apos;identification personnelle, sous réserve de les avoir
                communiqués à l&apos;hébergeur. Toute réclamation, demande
                d&apos;exercice des droits ou signalement peut être adressé à
                l&apos;adresse e-mail ci-dessus.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Hébergeur</p>
              <p>
                o2switch, SAS au capital de 100&nbsp;000&nbsp;euros
                <br />
                Chemin des Pardiaux, 63000 Clermont-Ferrand, France
                <br />
                RCS Clermont-Ferrand 510&nbsp;909&nbsp;807
                <br />
                SIRET 510&nbsp;909&nbsp;807&nbsp;00032
                <br />
                TVA intra-communautaire FR35&nbsp;510&nbsp;909&nbsp;807
                <br />
                Site :{' '}
                <a
                  href="https://www.o2switch.fr"
                  className="underline underline-offset-2 hover:text-rose-600"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  https://www.o2switch.fr
                </a>
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 2 — Objet, acceptation et évolution du modèle
            </h3>
            <div>
              <p className="font-semibold text-gray-900">2.1 Objet</p>
              <p>
                Les présentes Conditions Générales d&apos;Utilisation (ci-après
                les « CGU ») ont pour objet de définir les conditions
                d&apos;accès et d&apos;utilisation du Service {BRAND_NAME} :
                création de profil, découverte de membres, expressions
                d&apos;intérêt (Like, Flash), constitution de Matchs,
                messagerie conditionnée à un Match, et paramètres de
                visibilité du compte.
              </p>
              <p>
                Les présentes CGU ne constituent pas des conditions générales
                de vente. Aucune offre payante n&apos;est commercialisée au
                lancement.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">2.2 Acceptation</p>
              <p>
                L&apos;inscription, la création d&apos;un compte ou
                l&apos;utilisation du Service emportent acceptation pleine et
                entière des présentes CGU. Si l&apos;utilisateur n&apos;accepte
                pas ces conditions, il doit s&apos;abstenir d&apos;utiliser le
                Service et peut demander la suppression de son compte.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                2.3 Cœur du Service gratuit
              </p>
              <p>
                Le cœur du Service — à savoir, a minima, la création et la
                gestion d&apos;un profil, la consultation des profils
                compatibles, l&apos;expression d&apos;un intérêt de base, la
                constitution de Matchs et l&apos;usage de la messagerie entre
                membres matchés — restera accessible gratuitement.
              </p>
              <p>
                L&apos;utilisateur qui ne souhaite rien payer ne subira
                aucune perte des services de base. Aucune fonctionnalité
                constitutive du cœur du Service ne sera retirée, bridée ou
                conditionnée à un paiement de manière à contraindre
                l&apos;utilisateur à souscrire une option payante.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                2.4 Évolution future — options payantes éventuelles
              </p>
              <p>
                L&apos;éditeur se réserve le droit de proposer
                ultérieurement, lorsque le projet le justifiera, des modules
                ou options payantes strictement optionnelles (confort,
                visibilité accrue ou fonctionnalités additionnelles n&apos;étant
                pas indispensables à l&apos;usage de base).
              </p>
              <p>
                Le cas échéant :
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  les utilisateurs en seront informés préalablement, de
                  manière claire et distincte ;
                </li>
                <li>
                  ces modules feront l&apos;objet de Conditions Générales de
                  Vente (CGV) distinctes des présentes CGU, à accepter
                  expressément au moment de la souscription ;
                </li>
                <li>
                  le refus de souscrire une option payante n&apos;entraînera
                  ni fermeture de compte, ni perte des services de base
                  décrits à l&apos;article 2.3.
                </li>
              </ul>
              <p>
                Tant que de telles CGV n&apos;ont pas été publiées et
                acceptées, aucun paiement n&apos;est dû et aucune carte
                bancaire n&apos;est demandée.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                2.5 Modification des CGU
              </p>
              <p>
                L&apos;éditeur peut modifier les présentes CGU pour des motifs
                légitimes (évolution légale, technique ou du Service). La
                version applicable est celle publiée sur le Site, datée. En cas
                de modification substantielle, une information sera portée à
                la connaissance des utilisateurs. La poursuite de
                l&apos;utilisation du Service après entrée en vigueur vaut
                acceptation, sans préjudice du droit de supprimer son compte.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 3 — Conditions d&apos;accès
            </h3>
            <p>
              Aux fins des présentes, les termes « site » et
              « application » désignent le même Service {BRAND_NAME},
              accessible via un navigateur à l&apos;adresse{' '}
              <a
                href="https://aypik.fr"
                className="underline underline-offset-2 hover:text-rose-600"
              >
                https://aypik.fr
              </a>{' '}
              ou installé sur un appareil (application web progressive,
              ou PWA).
              L&apos;installation ne donne lieu à aucune collecte de
              données supplémentaire par rapport à l&apos;usage via
              navigateur. Le Service n&apos;étant pas distribué via
              Google Play ou l&apos;App Store, aucune condition
              d&apos;utilisation tierce de ces plateformes ne
              s&apos;applique.
            </p>
            <div>
              <p className="font-semibold text-gray-900">
                3.1 Majorité — 18 ans révolus
              </p>
              <p>
                Le Service est exclusivement réservé aux personnes majeures.
                Toute inscription, tout accès et toute utilisation par une
                personne âgée de moins de 18 ans sont strictement interdits.
              </p>
              <p>
                En s&apos;inscrivant, l&apos;utilisateur déclare et garantit
                avoir 18 ans révolus à la date de création du compte. Une
                date de naissance est exigée ; l&apos;accès est refusé si
                l&apos;âge déclaré est inférieur à 18 ans.
              </p>
              <p>
                L&apos;éditeur se réserve le droit de refuser, suspendre ou
                supprimer, sans préavis, tout compte dont le titulaire
                s&apos;avérerait mineur ou aurait fourni une date de
                naissance inexacte afin de contourner cette interdiction.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.2 Public du Service
              </p>
              <p>
                Le Service s&apos;adresse aux personnes majeures se déclarant
                sans enfant. L&apos;utilisateur s&apos;engage à renseigner un
                profil sincère à cet égard. Un profil manifestement
                incompatible avec cette orientation éditoriale pourra être
                suspendu ou supprimé.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.3 Unicité des comptes
              </p>
              <p>
                Chaque utilisateur ne peut détenir qu&apos;un seul et unique
                compte. La création, la détention ou l&apos;usage, simultané
                ou successif en fraude de la présente règle, de plusieurs
                comptes par une même personne physique est interdit.
              </p>
              <p>
                L&apos;ouverture d&apos;un compte est liée à une seule
                adresse e-mail, identifiant unique du compte. Il est interdit
                de créer plusieurs comptes à partir d&apos;une même adresse
                e-mail, ou plusieurs comptes pour une même personne, y
                compris au moyen d&apos;adresses distinctes.
              </p>
              <p>
                L&apos;éditeur peut refuser l&apos;inscription, suspendre ou
                supprimer, sans préavis ni indemnité, tout compte constituant
                un doublon, une multi-détention ou une tentative de
                contournement. L&apos;utilisateur ne saurait alors prétendre
                à aucun dédommagement ni au transfert d&apos;avantages,
                y compris le statut de Membre Fondateur et le numéro qui y
                est attaché.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.4 Bienveillance et modération
              </p>
              <p>
                Les utilisateurs s&apos;engagent à un usage loyal, respectueux
                et bienveillant : pas de harcèlement, d&apos;injures, de
                propos haineux, de contenus illicites, d&apos;usurpation
                d&apos;identité, de sollicitations commerciales non
                autorisées, ni de comportement tendant à compromettre la
                sécurité d&apos;autrui.
              </p>
              <p>
                La messagerie n&apos;est ouverte qu&apos;après Match, afin de
                limiter les contacts non sollicités. Le Like demeure discret
                jusqu&apos;à réciprocité.
              </p>
              <p>
                L&apos;éditeur, dans le cadre d&apos;une obligation de
                moyens, peut modérer, masquer ou supprimer un contenu, et
                avertir, suspendre ou supprimer un compte, sans préavis
                lorsque la gravité des faits le justifie. Un signalement peut
                être adressé à {SUPPORT_EMAIL}.
              </p>
              <p>
                L&apos;utilisateur dont le compte a été suspendu ou
                supprimé pour manquement aux présentes CGU peut contester
                cette décision en écrivant à {SUPPORT_EMAIL}, en exposant
                les éléments qu&apos;il souhaite voir pris en compte.
                L&apos;éditeur examine cette contestation dans un délai
                raisonnable.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.5 Genre et critères de mise en relation
              </p>
              <p>
                Si l&apos;utilisateur ne renseigne pas son genre lors de
                l&apos;inscription, son profil est présenté à l&apos;ensemble
                des membres sans distinction de genre, et des profils de tout
                genre lui sont réciproquement proposés, jusqu&apos;à ce que
                cette information soit renseignée dans son profil.
                L&apos;utilisateur peut renseigner ou modifier cette
                information à tout moment depuis son profil ; les critères de
                mise en relation en tiennent compte pour la suite.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">3.6 Mot de passe</p>
              <p>
                L&apos;utilisateur peut à tout moment modifier son mot de
                passe depuis les paramètres de son profil (page Profil), sans
                avoir besoin de contacter l&apos;éditeur. Il lui appartient
                de choisir un mot de passe suffisamment robuste et de le
                garder confidentiel.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.7 Découvrir, suggestions et visibilité du compte
              </p>
              <p className="font-semibold text-gray-900">
                3.7.1 Filtrage des suggestions
              </p>
              <p>
                Les profils proposés sur Découvrir et dans les suggestions
                de l&apos;Accueil sont établis selon les critères de mise en
                relation (article 3.5) et le fonctionnement décrit au
                glossaire (Like, Flash, Match).
              </p>
              <p>
                Un profil auquel l&apos;utilisateur a déjà adressé un Like
                ou un Flash n&apos;est plus présenté dans Découvrir ni dans
                les suggestions de l&apos;Accueil. Cette exclusion ne
                supprime pas l&apos;interaction déjà enregistrée : le
                profil demeure gérable depuis Mes Matchs, selon son statut
                (À étudier, Match, archive, etc.).
              </p>
              <p className="font-semibold text-gray-900">
                3.7.2 Modes de visibilité
              </p>
              <p>
                L&apos;utilisateur choisit un seul mode de visibilité à la
                fois, depuis le menu du compte (entrée « Visibilité »). Les
                libellés ci-dessous sont ceux affichés dans ce menu.
              </p>
              <p>
                <span className="font-semibold text-gray-900">Normale.</span>{' '}
                Le profil est visible normalement : il peut être proposé
                dans Découvrir et dans les suggestions de l&apos;Accueil,
                sous réserve des filtres de l&apos;article 3.7.1 et des
                autres conditions des présentes. Le statut de présence en
                ligne (article 3.8) peut être affiché aux autres membres.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  Incognito.
                </span>{' '}
                L&apos;utilisateur continue d&apos;utiliser le Service. Son
                profil peut toujours être proposé dans Découvrir et dans
                les suggestions. En revanche, il n&apos;apparaît pas « en
                ligne » aux yeux des autres membres (article 3.8).
                L&apos;utilisateur Incognito continue, quant à lui, de voir
                le statut en ligne des autres membres, lorsque celui-ci
                leur est applicable.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  Ne plus apparaître dans Découvrir et Suggestions.
                </span>{' '}
                Le profil n&apos;est plus proposé aux autres membres dans
                Découvrir ni dans les suggestions de l&apos;Accueil. Les
                Matchs déjà constitués, les conversations et les
                interactions déjà enregistrées (Likes, Flashs) sont
                conservés. L&apos;utilisateur peut continuer d&apos;utiliser
                le Service, y compris Mes Matchs et la messagerie
                conditionnée à un Match.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  Mettre le compte en pause.
                </span>{' '}
                Le compte est mis en pause complète. L&apos;utilisateur
                peut encore se connecter ; l&apos;usage du Service est alors
                limité à la réactivation du compte. Le profil n&apos;est
                plus proposé dans Découvrir ni dans les suggestions de
                l&apos;Accueil pendant la durée de la pause. Aucun nouveau
                Like, Flash ou message n&apos;est enregistré à destination
                de ce compte pendant la pause ; un membre qui tente une
                telle interaction en est informé. Les Matchs, conversations et
                interactions déjà existants ne sont pas supprimés ; ils
                redeviennent utilisables à la réactivation. Les Likes,
                Flashs et messages qui auraient été adressés pendant la
                pause ne sont pas conservés.
              </p>
              <p>
                Un compte dont l&apos;utilisateur a choisi l&apos;un des
                modes ci-dessus, y compris « Mettre le compte en pause »,
                demeure un compte actif au sens des présentes CGU. Le
                statut de Membre Fondateur et le numéro associé ne sont
                pas perdus. Seule la suppression définitive du compte,
                dans les conditions de l&apos;article 8.2, emporte la
                perte définitive de ce badge et de ce numéro.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.8 Présence en ligne
              </p>
              <p>
                Lorsqu&apos;un membre utilise le Service dans une session
                active, un horodatage de dernière activité
                (last_active_at) peut être mis à jour périodiquement. Un
                profil est considéré comme « en ligne » lorsqu&apos;une
                activité récente est constatée (fenêtre de quelques
                minutes) et que le mode Incognito n&apos;est pas actif.
              </p>
              <p>
                Ce statut peut être signalé aux autres membres par un
                indicateur visuel (point vert) sur la photo de profil,
                notamment dans Découvrir, les suggestions de l&apos;Accueil
                et Mes Matchs. L&apos;horodatage lui-même n&apos;est pas
                affiché aux autres membres. En mode Incognito, le profil
                n&apos;est jamais présenté comme en ligne, même si le
                membre utilise effectivement le Service.
              </p>
              <p>
                Le traitement de last_active_at est décrit à l&apos;article
                8.1.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 4 — Offre « Membre Fondateur »
            </h3>
            <p>
              L&apos;offre Membre Fondateur est honorifique. Elle est
              strictement réservée aux {FOUNDER_MAX_SLOTS} premiers membres
              inscrits, dans la limite des places disponibles. Dès que ce
              plafond est atteint, l&apos;offre n&apos;est plus proposée. Les
              numéros de Membre Fondateur sont attribués de façon séquentielle
              et ne sont jamais réattribués.
            </p>
            <p>
              Pendant une période de six (6) mois à compter de
              l&apos;activation de l&apos;offre sur le compte, les avantages
              fonctionnels sont consentis à titre gracieux, sans engagement
              de durée, sans tacite reconduction et sans aucune demande de
              carte bancaire. Ils comprennent notamment, selon les
              fonctionnalités effectivement déployées : likes et Flash
              illimités, ainsi qu&apos;un boost de visibilité du profil
              pendant le premier mois.
            </p>
            <p>
              À l&apos;issue de ces six mois, les avantages fonctionnels
              cessent. Le compte demeure alors sur l&apos;offre de base
              gratuite. Le titre de Membre Fondateur et le numéro associé
              restent visibles à titre honorifique tant que le compte est
              actif.
            </p>
            <p>
              Le statut de Membre Fondateur et son numéro associé sont
              strictement liés au compte actif. En cas de désinscription ou
              de suppression du compte, le badge est définitivement perdu et
              ne pourra pas être réattribué. Un compte dont la visibilité
              est restreinte ou qui est mis en pause au sens de
              l&apos;article 3.7 demeure un compte actif ; voir également
              l&apos;article 8.2.
            </p>
            <p>
              Cette offre ne constitue ni un contrat de vente, ni un
              abonnement, ni une contrepartie financière. Elle n&apos;ouvre
              droit à aucun remboursement, cession ou conversion en numéraire.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 5 — Boost et statut Premium
            </h3>
            <p>
              Le badge « Premium » est le libellé d&apos;affichage des
              avantages Fondateur pendant leur période d&apos;activation de
              6 mois (article 4) : il matérialise visuellement, sur le
              profil, que ces avantages (likes et Flash illimités, Boost
              offert le premier mois) sont actuellement actifs. Il disparaît
              à l&apos;issue des 6 mois, à la différence du titre
              honorifique « Membre Fondateur » et de son numéro, qui restent
              affichés tant que le compte est actif (article 4). La validité
              du Boost est consultable à tout moment depuis la page « Mon
              profil ».
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 6 — Propriété intellectuelle et contenus utilisateurs
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                6.1 Éléments de la plateforme
              </p>
              <p>
                L&apos;ensemble de la structure du Site, de son code source,
                de ses interfaces, textes, graphismes, bases de données,
                logos et charte éditoriale est protégé par le droit
                d&apos;auteur, le droit des marques et, le cas échéant, le
                droit des producteurs de bases de données. Toute
                reproduction, extraction (y compris par scraping),
                adaptation ou exploitation non autorisée est interdite.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">6.2 Marque</p>
              <p>
                Le nom {BRAND_NAME}, ses déclinaisons et son identité
                visuelle sont protégés. Toute utilisation non autorisée est
                interdite.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                6.3 Contenus publiés par l&apos;utilisateur
              </p>
              <p>
                L&apos;utilisateur conserve les droits qu&apos;il détient sur
                les contenus qu&apos;il publie (photo, biographie, centres
                d&apos;intérêt, messages, le cas échéant témoignage).
              </p>
              <p>
                Il concède à l&apos;éditeur, pour la durée de présence des
                contenus sur le Service, une licence non exclusive, mondiale,
                gratuite et non cessible, strictement limitée à ce qui est
                nécessaire au fonctionnement du Site : hébergement,
                affichage aux membres concernés, mise en cache, sauvegarde
                technique et, le cas échéant, modération.
              </p>
              <p>
                Cette licence prend fin, sous réserve des copies de sauvegarde
                techniques transitoires, lors de la suppression du contenu ou
                du compte. L&apos;utilisateur garantit disposer des droits
                nécessaires et que ses contenus ne portent pas atteinte aux
                droits des tiers.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 7 — Responsabilités
            </h3>
            <p>
              {BRAND_NAME} est un outil de mise en relation. L&apos;éditeur
              n&apos;est pas partie aux relations nouées entre utilisateurs
              et n&apos;organise pas les rencontres hors ligne.
            </p>
            <p>
              L&apos;utilisateur est seul responsable des informations qu&apos;il
              communique, de l&apos;exactitude de son profil, de ses
              échanges et de ses rencontres. Il lui appartient de faire
              preuve de prudence (ne pas communiquer de données bancaires,
              privilégier un lieu public pour une première rencontre, etc.).
              L&apos;éditeur ne saurait être tenu des comportements hors
              ligne des membres, ni de l&apos;absence de rencontre, ni de
              l&apos;inexactitude d&apos;un profil d&apos;un tiers, dès lors
              qu&apos;il n&apos;en a pas eu une connaissance effective.
            </p>
            <p>
              L&apos;éditeur, agissant à titre bénévole, s&apos;oblige à une
              obligation de moyens : continuité raisonnable du Service,
              sécurité adaptée à un site de cette nature, modération diligente
              des signalements. Le Service est fourni « en l&apos;état » ;
              des interruptions (maintenance, force majeure, défaillance
              d&apos;un prestataire) peuvent survenir.
            </p>
            <p>
              La responsabilité de l&apos;éditeur ne peut être engagée qu&apos;en
              cas de faute prouvée qui lui est directement imputable. Elle
              est limitée, dans les limites permises par la loi, aux
              dommages directs. Rien dans les présentes n&apos;exclut la
              responsabilité en cas de faute lourde ou dolosive, ni
              l&apos;indemnisation des dommages corporels.
            </p>
            <p>
              Pour les contenus illicites signalés, l&apos;éditeur agit
              conformément à la LCEN dès qu&apos;il en a effectivement
              connaissance.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 8 — Données personnelles, résiliation et droit applicable
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                8.1 Protection des données (RGPD)
              </p>
              <p>
                L&apos;éditeur est responsable du traitement des données
                personnelles collectées pour fournir le Service (compte,
                profil, interactions, messages, horodatage de dernière
                activité last_active_at visé à l&apos;article 3.8, journaux
                techniques nécessaires à la sécurité). Le traitement repose
                principalement sur l&apos;exécution du contrat
                d&apos;utilisation (les présentes CGU) et, le cas échéant,
                sur le consentement (par exemple notifications e-mail ou
                témoignage) ou l&apos;intérêt légitime (sécurité,
                prévention des fraudes et des comptes multiples).
              </p>
              <p>
                Les données ne sont pas vendues. Elles peuvent être
                transmises aux seuls prestataires strictement nécessaires
                (hébergeur, infrastructure technique, envoi d&apos;e-mails),
                établis dans l&apos;Union européenne ou offrant des garanties
                appropriées.
              </p>
              <p>
                Cookies et traceurs. Le Service utilise, à ce jour,
                uniquement des cookies strictement nécessaires à son
                fonctionnement (notamment le maintien de la session de
                connexion), pour lesquels aucun consentement préalable
                n&apos;est requis. Si l&apos;éditeur venait à mettre en
                place, à l&apos;avenir, des cookies ou traceurs non
                essentiels (par exemple à des fins de mesure
                d&apos;audience), l&apos;utilisateur en serait informé au
                moyen d&apos;un bandeau dédié lui permettant d&apos;accepter,
                de refuser ou de personnaliser son consentement avant leur
                dépôt, conformément à la réglementation applicable. Une
                politique de cookies dédiée serait alors publiée et
                accessible depuis le Site.
              </p>
              <p>
                L&apos;utilisateur dispose des droits d&apos;accès,
                rectification, effacement, limitation, opposition et
                portabilité, ainsi que du droit d&apos;introduire une
                réclamation auprès de la CNIL (www.cnil.fr). Ces droits
                s&apos;exercent via les paramètres du profil et/ou à{' '}
                {SUPPORT_EMAIL}.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                8.2 Résiliation et suppression du compte
              </p>
              <p>
                L&apos;utilisateur peut à tout moment demander la suppression
                de son compte et de l&apos;intégralité de ses données
                personnelles depuis les paramètres de son profil.
              </p>
              <p>
                Les modes de visibilité de l&apos;article 3.7, y compris
                « Mettre le compte en pause », ne constituent pas une
                suppression du compte. Le profil et les données demeurent ;
                le compte reste actif. La perte du statut de Membre
                Fondateur et du numéro associé n&apos;intervient qu&apos;en
                cas de désinscription ou de suppression au titre du présent
                article 8.2.
              </p>
              <p>
                Pour l&apos;utilisateur, cette suppression est définitive :
                le profil n&apos;est plus visible et n&apos;est plus utilisé.
                Pour des raisons techniques et de sécurité (correction
                d&apos;une erreur de manipulation, obligations légales), les
                données peuvent être conservées de manière interne pendant
                un délai de purge de trente (30) jours, après lequel elles
                sont irrémédiablement effacées. Certaines traces
                strictement nécessaires (par exemple factures futures, ou
                conservation imposée par la loi) pourraient, le cas échéant,
                être conservées plus longtemps, de façon cloisonnée.
              </p>
              <p>
                Le statut de Membre Fondateur et son numéro associé sont
                strictement liés au compte actif. En cas de désinscription
                ou de suppression du compte, le badge est définitivement
                perdu et ne pourra pas être réattribué.
              </p>
              <p>
                L&apos;éditeur peut résilier un compte en cas de manquement
                grave ou répété aux présentes CGU.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                8.3 Droit applicable et tribunaux compétents
              </p>
              <p>
                Les présentes CGU sont régies par le droit français.
              </p>
              <p>
                En cas de litige, et après tentative de résolution amiable
                (contact à {SUPPORT_EMAIL}), les tribunaux français
                compétents seront saisis. Lorsque l&apos;utilisateur a la
                qualité de consommateur, il peut saisir, outre les
                juridictions territorialement compétentes en vertu du code
                de procédure civile, la juridiction du lieu où il demeurait
                au moment de la conclusion du contrat ou de la survenance du
                fait dommageable. Il peut également recourir à un médiateur
                de la consommation, dans les conditions prévues par le code
                de la consommation, dès lors que cette voie lui est ouverte.
              </p>
            </div>
          </section>

          {/*
            Pause d’abonnement : non applicable tant que SITE_FREE_MODE
            (aucune offre payante). La clause est dans l’annexe ci-dessus,
            affichée seulement lorsque des CGV / modules payants existent.
          */}
          {!SITE_FREE_MODE && (
            <section className="space-y-3">
              <h3 className="text-base font-bold text-gray-900">
                Annexe — Offres payantes (renvoi aux CGV)
              </h3>
              <p>
                Lorsque des modules payants sont commercialisés, leurs prix,
                modalités de paiement, rétractation et résiliation figurent
                exclusivement dans des Conditions Générales de Vente
                distinctes, acceptées au moment de la souscription. Stripe et
                PayPal peuvent être utilisés comme prestataires de paiement.
              </p>
              <p>
                Si l&apos;utilisateur dispose alors d&apos;un abonnement
                payant, la mise en pause du compte (article 3.7) n&apos;emporte
                pas, par elle-même, la résiliation de cet abonnement. Les
                effets sur la facturation, la période déjà payée et une
                éventuelle suspension de prélèvement relèvent exclusivement
                des CGV acceptées lors de la souscription.
              </p>
              <p>
                Les membres disposant d&apos;un abonnement Premium actif
                peuvent soumettre un témoignage. La publication du texte et
                du prénom n&apos;a lieu qu&apos;après un consentement
                explicite, via une case à cocher non pré-cochée. Le
                témoignage est supprimé en cas de retrait du consentement ou
                de suppression du compte (RGPD).
              </p>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Annexe A — Glossaire
            </h3>
            <div>
              <p className="font-semibold text-gray-900">Mes Matchs</p>
              <p>
                Page regroupant les interactions de l&apos;utilisateur
                (intérêts reçus, Matchs, archives et espaces associés). Sur
                cette page, les profils sont classés par ordre chronologique
                d&apos;apparition : les plus récemment ajoutés apparaissent
                en haut à gauche de la grille, tandis que les profils apparus
                antérieurement sont progressivement repoussés vers le bas à
                droite, selon l&apos;ordre de lecture habituel (de gauche à
                droite, puis de haut en bas).
              </p>
            </div>
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
                envoyant un signal fort et direct à la personne ciblée pour
                lui signifier un intérêt immédiat.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Match</p>
              <p>
                Relation bilatérale établie entre deux membres, actant
                qu&apos;un intérêt mutuel a été confirmé (qu&apos;il
                provienne de Likes croisés ou d&apos;un Flash accepté).
                C&apos;est cette validation mutuelle qui ouvre l&apos;accès
                à la messagerie.
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
                dialoguer avec un membre sans avoir reçu ou vu son
                Like/Flash accepté en retour.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">À étudier</p>
              <p>
                Statut d&apos;un profil dont le Like ou le Flash a été reçu
                et n&apos;a pas encore fait l&apos;objet d&apos;une décision.
                L&apos;utilisateur peut alors refuser le profil, le mettre
                en attente, ou confirmer un Match.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Mettre en attente</p>
              <p>
                Action permettant de conserver un profil reçu (Like ou Flash)
                afin de l&apos;étudier plus tard, sans le refuser ni le
                matcher immédiatement. Le profil reste alors accessible
                depuis Mes Matchs, dans « Mis en attente par toi », jusqu&apos;à
                une décision définitive (Matcher, refuser ou archiver).
                Réciproquement, lorsqu&apos;un autre membre met en attente le
                Like ou le Flash de l&apos;utilisateur, ce profil apparaît
                pour l&apos;utilisateur dans « Mis en attente par l&apos;autre
                », en consultation uniquement : la décision d&apos;attendre,
                de matcher ou de refuser appartient à l&apos;autre membre.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Matché le</p>
              <p>
                Libellé affiché lorsque c&apos;est l&apos;utilisateur
                connecté qui valide ou accepte la sollicitation entrante
                d&apos;un tiers (Like reçu, Flash reçu, ou intérêt en
                attente tranché par Matcher). La date indiquée est celle de
                cette acceptation (« Matché le [date] »). Sur Mes Matchs, ce
                libellé peut être complété par « — 1er mot » ou « —
                Discussion en cours » selon l&apos;état de la messagerie.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Match le</p>
              <p>
                Libellé affiché lorsque le Match découle de l&apos;acceptation
                par l&apos;autre membre de la sollicitation initiale de
                l&apos;utilisateur connecté (Like ou Flash envoyé, puis
                accepté en retour). La date indiquée est celle de cette
                acceptation (« Match le [date] »). Sur Mes Matchs, ce
                libellé peut également être complété par « — 1er mot » ou
                « — Discussion en cours » selon l&apos;état de la messagerie.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">1er mot</p>
              <p>
                Statut d&apos;un Match lorsqu&apos;aucun message n&apos;a
                encore été échangé. La messagerie est ouverte ; le premier
                échange reste à écrire.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Discussion en cours
              </p>
              <p>
                Statut d&apos;un Match dès qu&apos;au moins un message a été
                échangé entre les deux membres.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Archiver / Supprimer
              </p>
              <p>
                Options de gestion proposées pour les profils ayant décliné
                un Like ou un Flash. Archiver conserve le profil dans un
                espace dédié de la page Mes Matchs ; Supprimer le retire de
                cette liste.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Matchs rompus</p>
              <p>
                Espace de conservation des Matchs archivés ou rompus depuis
                une conversation déjà validée, distingué selon l&apos;auteur
                de la décision. Si l&apos;utilisateur est lui-même à
                l&apos;origine de l&apos;archivage ou de la rupture, le Match
                apparaît dans « Matchs rompus par toi » : il peut alors
                rétablir le lien (et l&apos;accès à la messagerie) ou le
                supprimer définitivement. Si c&apos;est l&apos;autre
                personne qui a rompu le lien, le Match apparaît dans « Matchs
                rompus par l&apos;autre » : seule la suppression définitive
                est possible, le rétablissement n&apos;étant pas proposé.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Boost</p>
              <p>
                Fonctionnalité permettant de mettre en avant son profil en
                tête de liste pendant une durée déterminée pour maximiser sa
                visibilité.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Découvrir</p>
              <p>
                Page permettant de parcourir des profils compatibles, selon
                les critères de mise en relation et le filtrage décrits à
                l&apos;article 3.7.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Suggestions</p>
              <p>
                Profils proposés sur l&apos;Accueil. Ils obéissent au même
                filtrage que Découvrir (article 3.7.1) et aux modes de
                visibilité de l&apos;article 3.7.2.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Visibilité</p>
              <p>
                Paramètre du compte à choix unique, accessible depuis le
                menu du compte. Les quatre modes sont : Normale, Incognito,
                Ne plus apparaître dans Découvrir et Suggestions, et
                Mettre le compte en pause (article 3.7.2).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">En ligne</p>
              <p>
                Indicateur (point vert sur la photo) signalant qu&apos;un
                membre a une activité récente et n&apos;est pas en mode
                Incognito. Voir l&apos;article 3.8.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Annexe B — Questions fréquentes
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                Puis-je m&apos;inscrire si j&apos;ai moins de 18 ans&nbsp;?
              </p>
              <p>
                Non. Le Service est exclusivement réservé aux personnes
                majeures.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Puis-je créer plusieurs comptes&nbsp;?
              </p>
              <p>
                Non. Un seul compte par personne et par adresse e-mail, selon
                l&apos;article 3.3.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Le Service va-t-il devenir payant&nbsp;?
              </p>
              <p>
                Le cœur du Service restera gratuit. Des options payantes
                pourront éventuellement être proposées plus tard ; elles
                seront facultatives, annoncées à l&apos;avance et régies par
                des CGV distinctes. Qui ne paie rien conserve les services
                de base.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Comment se passe la suppression de mon compte&nbsp;?
              </p>
              <p>
                Elle est demandée depuis le profil. Le profil n&apos;est plus
                visible. Les données sont irrémédiablement effacées après un
                délai de purge de 30 jours (article 8.2).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Que devient le badge Membre Fondateur si je me
                désinscris&nbsp;?
              </p>
              <p>
                Le statut de Membre Fondateur et son numéro associé sont
                strictement liés au compte actif. En cas de désinscription
                ou de suppression du compte, le badge est définitivement
                perdu et ne pourra pas être réattribué.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Un profil que j&apos;ai déjà liké ou flashé peut-il
                réapparaître dans Découvrir&nbsp;?
              </p>
              <p>
                Non. Il n&apos;est plus proposé dans Découvrir ni dans les
                suggestions de l&apos;Accueil (article 3.7.1). L&apos;interaction
                reste gérable depuis Mes Matchs.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Quelle est la différence entre mettre le compte en pause et
                supprimer mon compte&nbsp;?
              </p>
              <p>
                « Mettre le compte en pause » (article 3.7) laisse le compte
                actif : le badge Membre Fondateur et son numéro sont
                conservés ; le profil n&apos;est plus proposé dans Découvrir
                ni dans les suggestions, et les nouvelles interactions ne
                sont pas enregistrées le temps de la pause. La suppression
                (article 8.2) est définitive : le profil n&apos;est plus
                utilisé, les données sont effacées après le délai de purge,
                et le badge Fondateur est perdu.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Que signifie le point vert sur une photo de profil&nbsp;?
              </p>
              <p>
                Il indique que le membre est considéré comme en ligne
                (article 3.8). Ce point n&apos;apparaît pas si ce membre a
                activé Incognito.
              </p>
            </div>
          </section>

          <footer className="border-t border-gray-100 pt-6 text-xs text-gray-400 space-y-2">
            <p>
              Vous avez des questions ?{' '}
              <ContactLink className="underline underline-offset-2 hover:text-rose-600 transition-colors" />
            </p>
            <p>
              En utilisant {BRAND_NAME} — {BRAND_BASELINE} — vous confirmez
              avoir lu et accepté les présentes Conditions Générales
              d&apos;Utilisation.
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
